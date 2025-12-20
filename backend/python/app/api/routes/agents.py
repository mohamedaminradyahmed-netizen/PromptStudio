"""
API routes for Agent operations.

Provides endpoints for:
- Running research agents
- Creating and executing plans
- Running LangGraph workflows
- Agent orchestration
"""

import uuid
from typing import Any, Optional

from fastapi import APIRouter, HTTPException, Depends, Request
from loguru import logger
from pydantic import BaseModel, Field

from app.agents.autogen_agents import (
    AgentOrchestrator,
    ResearchAgent,
    PlannerAgent,
    ExecutionAgent,
)
from app.agents.langgraph_workflow import (
    WorkflowRunner,
    create_initial_state,
    LANGGRAPH_AVAILABLE,
)
from app.agents.models.agent_models import (
    AgentTask,
    AgentResult,
    AgentRole,
    ExecutionPlan,
    ResearchQuery,
    ResearchResult,
    TaskStatus,
)


router = APIRouter(prefix="/agents", tags=["agents"])


# Request/Response Models
class ResearchRequest(BaseModel):
    """Request for research operation."""
    query: str = Field(..., description="The research query")
    max_results: int = Field(default=5, ge=1, le=20)
    search_type: str = Field(default="web", description="web, semantic, or both")


class PlanRequest(BaseModel):
    """Request for plan creation."""
    goal: str = Field(..., description="The goal to achieve")
    context: Optional[str] = Field(None, description="Additional context")
    available_tools: Optional[list[str]] = Field(None, description="List of available tools")


class ExecutePlanRequest(BaseModel):
    """Request for plan execution."""
    plan: dict = Field(..., description="The execution plan to run")


class TaskRequest(BaseModel):
    """Request for full task orchestration."""
    description: str = Field(..., description="Task description")
    with_research: bool = Field(default=True, description="Whether to perform research first")
    context: Optional[dict] = Field(default_factory=dict)


class WorkflowRequest(BaseModel):
    """Request for LangGraph workflow execution."""
    task: str = Field(..., description="The task to accomplish")
    workflow_type: str = Field(default="plan_execute", description="research or plan_execute")
    max_iterations: int = Field(default=10, ge=1, le=50)


class AgentStatusResponse(BaseModel):
    """Response with agent system status."""
    autogen_available: bool
    langgraph_available: bool
    available_agents: list[str]
    available_workflows: list[str]


# Dependency for getting services
async def get_services(request: Request) -> dict[str, Any]:
    """Get available services for agents from app state."""
    if hasattr(request.app.state, "agent_services"):
        return request.app.state.agent_services
    return {}


# Routes
@router.get("/status", response_model=AgentStatusResponse)
async def get_agent_status():
    """Get the status of the agent system."""
    try:
        from app.agents.autogen_agents import AUTOGEN_AVAILABLE
    except ImportError:
        AUTOGEN_AVAILABLE = False

    return AgentStatusResponse(
        autogen_available=AUTOGEN_AVAILABLE,
        langgraph_available=LANGGRAPH_AVAILABLE,
        available_agents=[
            "ResearchAgent",
            "PlannerAgent",
            "ExecutionAgent",
            "AgentOrchestrator",
        ],
        available_workflows=[
            "research",
            "plan_execute",
        ],
    )


@router.post("/research", response_model=ResearchResult)
async def run_research(
    request: ResearchRequest,
    services: dict = Depends(get_services),
):
    """
    Run a research operation using the ResearchAgent.

    Searches the web and/or semantic database for information.
    """
    logger.info(f"Research request: {request.query}")

    try:
        agent = ResearchAgent()
        query = ResearchQuery(
            query=request.query,
            max_results=request.max_results,
            search_type=request.search_type,
        )

        result = await agent.research(
            query=query,
            llm_service=services.get("llm_service"),
        )

        return result

    except Exception as e:
        logger.error(f"Research error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/plan", response_model=ExecutionPlan)
async def create_plan(
    request: PlanRequest,
    services: dict = Depends(get_services),
):
    """
    Create an execution plan using the PlannerAgent.

    Breaks down a goal into actionable steps.
    """
    logger.info(f"Plan request: {request.goal}")

    try:
        agent = PlannerAgent()
        plan = await agent.create_plan(
            goal=request.goal,
            context=request.context,
            available_tools=request.available_tools,
            llm_service=services.get("llm_service"),
        )

        return plan

    except Exception as e:
        logger.error(f"Planning error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/execute", response_model=AgentResult)
async def execute_plan(
    request: ExecutePlanRequest,
    services: dict = Depends(get_services),
):
    """
    Execute a plan using the ExecutionAgent.

    Runs each step in the plan sequentially.
    """
    logger.info(f"Execute plan request: {request.plan.get('id', 'unknown')}")

    try:
        # Convert dict to ExecutionPlan
        from app.agents.models.agent_models import PlanStep

        steps = [
            PlanStep(
                step_number=s.get("step_number", i + 1),
                action=s.get("action", ""),
                description=s.get("description", s.get("action", "")),
                dependencies=s.get("dependencies", []),
                tool_name=s.get("tool_name") or s.get("tool"),
                tool_params=s.get("tool_params", {}),
            )
            for i, s in enumerate(request.plan.get("steps", []))
        ]

        plan = ExecutionPlan(
            id=request.plan.get("id", str(uuid.uuid4())[:8]),
            goal=request.plan.get("goal", ""),
            steps=steps,
        )

        agent = ExecutionAgent()
        result = await agent.execute_plan(plan=plan, services=services)

        return result

    except Exception as e:
        logger.error(f"Execution error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/orchestrate", response_model=AgentResult)
async def run_orchestration(
    request: TaskRequest,
    services: dict = Depends(get_services),
):
    """
    Run full task orchestration using AgentOrchestrator.

    Combines research, planning, and execution into a single workflow.
    """
    logger.info(f"Orchestration request: {request.description}")

    try:
        task = AgentTask(
            id=str(uuid.uuid4())[:8],
            description=request.description,
            agent_role=AgentRole.ORCHESTRATOR,
            context=request.context or {},
        )

        orchestrator = AgentOrchestrator(services=services)
        result = await orchestrator.run(
            task=task,
            with_research=request.with_research,
        )

        return result

    except Exception as e:
        logger.error(f"Orchestration error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/workflow")
async def run_workflow(
    request: WorkflowRequest,
    services: dict = Depends(get_services),
):
    """
    Run a LangGraph workflow.

    Supports:
    - research: Simple research workflow
    - plan_execute: Full plan-and-execute workflow
    """
    logger.info(f"Workflow request: {request.workflow_type} - {request.task}")

    if not LANGGRAPH_AVAILABLE:
        raise HTTPException(
            status_code=503,
            detail="LangGraph is not available. Please install langgraph package.",
        )

    try:
        runner = WorkflowRunner(services=services)

        if request.workflow_type == "research":
            result = await runner.run_research(request.task)
        elif request.workflow_type == "plan_execute":
            result = await runner.run_plan_execute(
                task=request.task,
                max_iterations=request.max_iterations,
            )
        else:
            raise HTTPException(
                status_code=400,
                detail=f"Unknown workflow type: {request.workflow_type}",
            )

        return {
            "workflow_type": request.workflow_type,
            "task": request.task,
            "result": result.get("final_result"),
            "error": result.get("error"),
            "steps_completed": len(result.get("step_results", [])),
            "research_performed": len(result.get("research_results", [])) > 0,
        }

    except Exception as e:
        logger.error(f"Workflow error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/tools")
async def list_available_tools():
    """List all available tools for agents."""
    return {
        "tools": [
            {
                "name": "web_search",
                "description": "Search the web using DuckDuckGo",
                "parameters": ["query", "max_results"],
            },
            {
                "name": "semantic_search",
                "description": "Search semantic database for similar content",
                "parameters": ["query", "collection", "limit"],
            },
            {
                "name": "analyze_prompt",
                "description": "Analyze a prompt for clarity and effectiveness",
                "parameters": ["prompt", "context"],
            },
            {
                "name": "refine_prompt",
                "description": "Refine and improve a prompt",
                "parameters": ["prompt", "target_task", "style"],
            },
            {
                "name": "generate_text",
                "description": "Generate text using an LLM",
                "parameters": ["prompt", "model", "temperature", "max_tokens"],
            },
            {
                "name": "execute_command",
                "description": "Execute a YAML-defined command",
                "parameters": ["command_name", "parameters"],
            },
        ]
    }
