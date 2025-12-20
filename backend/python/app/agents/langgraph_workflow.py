"""
LangGraph-based workflow orchestration for PromptStudio.

Provides state machine-based workflows for complex agent interactions
using the Plan-and-Execute pattern.
"""

import operator
import uuid
from datetime import datetime
from typing import Annotated, Any, Literal, Optional, TypedDict

from loguru import logger

try:
    from langgraph.graph import StateGraph, END
    from langgraph.prebuilt import ToolNode
    from langchain_core.messages import HumanMessage, AIMessage, SystemMessage, BaseMessage
    from langchain_openai import ChatOpenAI
    from langchain_anthropic import ChatAnthropic
    LANGGRAPH_AVAILABLE = True
except ImportError:
    LANGGRAPH_AVAILABLE = False
    logger.warning("LangGraph not installed. Workflow functionality will be limited.")

from app.agents.models.agent_models import (
    AgentRole,
    AgentTask,
    ExecutionPlan,
    PlanStep,
    ResearchResult,
    TaskStatus,
    WorkflowState as PydanticWorkflowState,
)
from app.agents.tools.search_tools import web_search
from app.agents.tools.analysis_tools import analyze_prompt_tool, refine_prompt_tool
from app.agents.tools.execution_tools import generate_text_tool


class AgentState(TypedDict):
    """State for the agent workflow graph."""
    messages: Annotated[list[BaseMessage], operator.add]
    task: str
    plan: Optional[dict]
    plan_steps: list[dict]
    current_step: int
    research_results: list[dict]
    step_results: list[dict]
    final_result: Optional[str]
    error: Optional[str]
    iteration: int
    max_iterations: int


def create_initial_state(task: str, max_iterations: int = 10) -> AgentState:
    """Create initial state for a workflow."""
    return AgentState(
        messages=[],
        task=task,
        plan=None,
        plan_steps=[],
        current_step=0,
        research_results=[],
        step_results=[],
        final_result=None,
        error=None,
        iteration=0,
        max_iterations=max_iterations,
    )


class WorkflowNodes:
    """Node functions for the workflow graph."""

    def __init__(self, llm: Optional[Any] = None, services: dict[str, Any] = None):
        self.services = services or {}
        self.llm = llm

        if llm is None and LANGGRAPH_AVAILABLE:
            import os
            api_key = os.getenv("OPENAI_API_KEY", "")
            if api_key:
                self.llm = ChatOpenAI(
                    model="gpt-4-turbo",
                    temperature=0.7,
                    api_key=api_key,
                )

    async def research_node(self, state: AgentState) -> dict:
        """
        Research node: Gathers information related to the task.
        """
        logger.info(f"Research node: {state['task']}")

        try:
            # Perform web search
            results = await web_search(
                query=state["task"],
                max_results=5,
            )

            research_data = {
                "query": state["task"],
                "sources": results,
                "timestamp": datetime.utcnow().isoformat(),
            }

            # Generate summary if LLM available
            if self.llm and results:
                formatted = "\n".join([
                    f"- {r.get('title', 'No title')}: {r.get('body', 'No content')}"
                    for r in results[:5]
                ])
                summary_prompt = f"Summarize these research findings concisely:\n\n{formatted}"

                if LANGGRAPH_AVAILABLE:
                    response = await self.llm.ainvoke([HumanMessage(content=summary_prompt)])
                    research_data["summary"] = response.content
                else:
                    research_data["summary"] = formatted
            else:
                research_data["summary"] = "No results found"

            return {
                "research_results": [research_data],
                "messages": [AIMessage(content=f"Research completed: {research_data['summary'][:200]}...")],
                "iteration": state["iteration"] + 1,
            }

        except Exception as e:
            logger.error(f"Research node error: {e}")
            return {
                "error": str(e),
                "messages": [AIMessage(content=f"Research failed: {str(e)}")],
            }

    async def plan_node(self, state: AgentState) -> dict:
        """
        Planning node: Creates an execution plan for the task.
        """
        logger.info(f"Planning node: {state['task']}")

        try:
            # Build context from research
            research_context = ""
            if state["research_results"]:
                research_context = state["research_results"][0].get("summary", "")

            # Generate plan using LLM
            if self.llm:
                plan_prompt = f"""Create a step-by-step execution plan for this task:

Task: {state['task']}
{f'Research findings: {research_context}' if research_context else ''}

Provide 3-5 clear, actionable steps. Format each step as:
Step N: [Action description]
Tool: [web_search|analyze_prompt|refine_prompt|generate_text|none]
"""
                if LANGGRAPH_AVAILABLE:
                    response = await self.llm.ainvoke([HumanMessage(content=plan_prompt)])
                    plan_text = response.content
                else:
                    plan_text = "Step 1: Analyze task\nStep 2: Execute\nStep 3: Review"
            else:
                plan_text = "Step 1: Analyze the task\nStep 2: Gather information\nStep 3: Execute\nStep 4: Review results"

            # Parse plan into steps
            steps = []
            lines = plan_text.strip().split("\n")
            step_num = 0

            for line in lines:
                if line.strip().lower().startswith("step"):
                    step_num += 1
                    action = line.split(":", 1)[-1].strip() if ":" in line else line
                    steps.append({
                        "step_number": step_num,
                        "action": action,
                        "status": "pending",
                        "tool": None,
                        "result": None,
                    })
                elif line.strip().lower().startswith("tool:"):
                    if steps:
                        tool = line.split(":", 1)[-1].strip().lower()
                        if tool != "none":
                            steps[-1]["tool"] = tool

            plan_data = {
                "id": str(uuid.uuid4())[:8],
                "goal": state["task"],
                "steps": steps,
                "created_at": datetime.utcnow().isoformat(),
            }

            return {
                "plan": plan_data,
                "plan_steps": steps,
                "messages": [AIMessage(content=f"Plan created with {len(steps)} steps")],
            }

        except Exception as e:
            logger.error(f"Planning node error: {e}")
            return {
                "error": str(e),
                "messages": [AIMessage(content=f"Planning failed: {str(e)}")],
            }

    async def execute_node(self, state: AgentState) -> dict:
        """
        Execution node: Executes the current step in the plan.
        """
        current = state["current_step"]
        steps = state["plan_steps"]

        if current >= len(steps):
            return {
                "messages": [AIMessage(content="All steps completed")],
            }

        step = steps[current]
        logger.info(f"Executing step {step['step_number']}: {step['action']}")

        try:
            result = {"step": step["step_number"], "success": True, "output": None}

            tool = step.get("tool")
            if tool:
                if tool in ("web_search", "search"):
                    search_results = await web_search(step["action"], max_results=3)
                    result["output"] = search_results

                elif tool in ("analyze_prompt", "analyze"):
                    analysis = await analyze_prompt_tool(
                        prompt=step["action"],
                        instructor_service=self.services.get("instructor_service"),
                    )
                    result["output"] = analysis.model_dump()

                elif tool in ("refine_prompt", "refine"):
                    refinement = await refine_prompt_tool(
                        prompt=step["action"],
                        instructor_service=self.services.get("instructor_service"),
                    )
                    result["output"] = refinement.model_dump()

                elif tool in ("generate_text", "generate"):
                    gen_result = await generate_text_tool(
                        prompt=step["action"],
                        llm_service=self.services.get("llm_service"),
                    )
                    result["output"] = gen_result.model_dump()

                else:
                    result["output"] = f"Completed: {step['action']}"
            else:
                result["output"] = f"Completed: {step['action']}"

            # Update step status
            step["status"] = "completed"
            step["result"] = result["output"]

            return {
                "step_results": [result],
                "current_step": current + 1,
                "plan_steps": steps,
                "messages": [AIMessage(content=f"Step {step['step_number']} completed")],
                "iteration": state["iteration"] + 1,
            }

        except Exception as e:
            logger.error(f"Execution node error: {e}")
            step["status"] = "failed"
            return {
                "step_results": [{"step": step["step_number"], "success": False, "error": str(e)}],
                "current_step": current + 1,
                "plan_steps": steps,
                "messages": [AIMessage(content=f"Step {step['step_number']} failed: {str(e)}")],
            }

    async def synthesize_node(self, state: AgentState) -> dict:
        """
        Synthesis node: Combines all results into a final output.
        """
        logger.info("Synthesizing results")

        try:
            # Gather all results
            research = state.get("research_results", [])
            step_results = state.get("step_results", [])

            # Build summary
            summary_parts = [f"Task: {state['task']}\n"]

            if research:
                summary_parts.append(f"Research: {research[0].get('summary', 'N/A')[:200]}\n")

            if step_results:
                summary_parts.append("Execution Results:")
                for r in step_results:
                    status = "✓" if r.get("success") else "✗"
                    output = str(r.get("output", r.get("error", "N/A")))[:100]
                    summary_parts.append(f"  {status} Step {r['step']}: {output}")

            final_result = "\n".join(summary_parts)

            # Use LLM for better synthesis if available
            if self.llm and LANGGRAPH_AVAILABLE:
                synthesis_prompt = f"""Synthesize these results into a concise final answer:

{final_result}

Provide a clear, actionable summary."""

                response = await self.llm.ainvoke([HumanMessage(content=synthesis_prompt)])
                final_result = response.content

            return {
                "final_result": final_result,
                "messages": [AIMessage(content="Results synthesized")],
            }

        except Exception as e:
            logger.error(f"Synthesis node error: {e}")
            return {
                "final_result": f"Synthesis failed: {str(e)}",
                "error": str(e),
            }


def should_continue_execution(state: AgentState) -> Literal["execute", "synthesize"]:
    """Determine if execution should continue or move to synthesis."""
    current = state["current_step"]
    total_steps = len(state["plan_steps"])

    if current >= total_steps:
        return "synthesize"

    if state["iteration"] >= state["max_iterations"]:
        logger.warning("Max iterations reached, moving to synthesis")
        return "synthesize"

    if state.get("error"):
        return "synthesize"

    return "execute"


def create_research_workflow(
    llm: Optional[Any] = None,
    services: dict[str, Any] = None,
) -> Optional[Any]:
    """
    Create a simple research workflow.

    Flow: research -> synthesize -> END
    """
    if not LANGGRAPH_AVAILABLE:
        logger.warning("LangGraph not available")
        return None

    nodes = WorkflowNodes(llm=llm, services=services)

    workflow = StateGraph(AgentState)

    # Add nodes
    workflow.add_node("research", nodes.research_node)
    workflow.add_node("synthesize", nodes.synthesize_node)

    # Add edges
    workflow.set_entry_point("research")
    workflow.add_edge("research", "synthesize")
    workflow.add_edge("synthesize", END)

    return workflow.compile()


def create_plan_execute_workflow(
    llm: Optional[Any] = None,
    services: dict[str, Any] = None,
) -> Optional[Any]:
    """
    Create a Plan-and-Execute workflow.

    Flow: research -> plan -> execute (loop) -> synthesize -> END
    """
    if not LANGGRAPH_AVAILABLE:
        logger.warning("LangGraph not available")
        return None

    nodes = WorkflowNodes(llm=llm, services=services)

    workflow = StateGraph(AgentState)

    # Add nodes
    workflow.add_node("research", nodes.research_node)
    workflow.add_node("plan", nodes.plan_node)
    workflow.add_node("execute", nodes.execute_node)
    workflow.add_node("synthesize", nodes.synthesize_node)

    # Add edges
    workflow.set_entry_point("research")
    workflow.add_edge("research", "plan")
    workflow.add_edge("plan", "execute")
    workflow.add_conditional_edges(
        "execute",
        should_continue_execution,
        {
            "execute": "execute",
            "synthesize": "synthesize",
        }
    )
    workflow.add_edge("synthesize", END)

    return workflow.compile()


async def run_workflow(
    workflow: Any,
    task: str,
    max_iterations: int = 10,
) -> dict[str, Any]:
    """
    Run a compiled workflow.

    Args:
        workflow: Compiled LangGraph workflow
        task: The task to accomplish
        max_iterations: Maximum iterations for execution loop

    Returns:
        Final state dictionary
    """
    if workflow is None:
        return {
            "error": "Workflow not available",
            "final_result": None,
        }

    initial_state = create_initial_state(task, max_iterations)

    try:
        # Run the workflow
        final_state = await workflow.ainvoke(initial_state)
        return dict(final_state)

    except Exception as e:
        logger.error(f"Workflow execution error: {e}")
        return {
            "error": str(e),
            "final_result": None,
        }


class WorkflowRunner:
    """
    High-level interface for running LangGraph workflows.
    """

    def __init__(self, services: dict[str, Any] = None):
        self.services = services or {}
        self.llm = None

        if LANGGRAPH_AVAILABLE:
            import os
            api_key = os.getenv("OPENAI_API_KEY", "")
            if api_key:
                self.llm = ChatOpenAI(
                    model="gpt-4-turbo",
                    temperature=0.7,
                    api_key=api_key,
                )

    async def run_research(self, query: str) -> dict[str, Any]:
        """Run a research-only workflow."""
        workflow = create_research_workflow(llm=self.llm, services=self.services)
        return await run_workflow(workflow, query)

    async def run_plan_execute(
        self,
        task: str,
        max_iterations: int = 10,
    ) -> dict[str, Any]:
        """Run a full plan-and-execute workflow."""
        workflow = create_plan_execute_workflow(llm=self.llm, services=self.services)
        return await run_workflow(workflow, task, max_iterations)

    def is_available(self) -> bool:
        """Check if LangGraph is available."""
        return LANGGRAPH_AVAILABLE
