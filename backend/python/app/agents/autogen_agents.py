"""
AutoGen-based agents for PromptStudio.

Provides research, planning, and execution agents using the
AutoGen framework for multi-agent conversations.
"""

import uuid
from datetime import datetime
from typing import Any, Optional

from loguru import logger

try:
    from autogen import AssistantAgent, UserProxyAgent, ConversableAgent
    from autogen import GroupChat, GroupChatManager
    AUTOGEN_AVAILABLE = True
except ImportError:
    AUTOGEN_AVAILABLE = False
    logger.warning("AutoGen not installed. Agent functionality will be limited.")

from app.agents.models.agent_models import (
    AgentConfig,
    AgentRole,
    AgentTask,
    AgentResult,
    ExecutionPlan,
    PlanStep,
    ResearchQuery,
    ResearchResult,
    TaskStatus,
)
from app.agents.tools.search_tools import web_search, format_search_results
from app.agents.tools.analysis_tools import analyze_prompt_tool, refine_prompt_tool
from app.agents.tools.execution_tools import execute_command_tool, generate_text_tool


class BaseAgent:
    """Base class for all agents."""

    def __init__(
        self,
        name: str,
        role: AgentRole,
        llm_config: Optional[dict] = None,
        system_prompt: Optional[str] = None,
    ):
        self.name = name
        self.role = role
        self.llm_config = llm_config or self._default_llm_config()
        self.system_prompt = system_prompt or self._default_system_prompt()
        self._agent: Optional[Any] = None

    def _default_llm_config(self) -> dict:
        """Get default LLM configuration."""
        import os
        return {
            "config_list": [
                {
                    "model": os.getenv("OPENAI_MODEL", "gpt-4-turbo"),
                    "api_key": os.getenv("OPENAI_API_KEY", ""),
                }
            ],
            "temperature": 0.7,
            "timeout": 120,
        }

    def _default_system_prompt(self) -> str:
        """Get default system prompt based on role."""
        prompts = {
            AgentRole.RESEARCHER: """You are a research agent specialized in finding and synthesizing information.
Your tasks include:
- Searching the web for relevant information
- Analyzing and summarizing findings
- Providing citations and sources
- Identifying knowledge gaps

Always provide accurate, well-sourced information.""",

            AgentRole.PLANNER: """You are a planning agent specialized in breaking down complex tasks.
Your tasks include:
- Analyzing goals and requirements
- Creating step-by-step execution plans
- Identifying dependencies between steps
- Estimating effort and resources needed

Always create clear, actionable plans.""",

            AgentRole.EXECUTOR: """You are an execution agent specialized in carrying out tasks.
Your tasks include:
- Following execution plans step by step
- Using available tools to complete tasks
- Reporting progress and results
- Handling errors gracefully

Always complete tasks thoroughly and report outcomes.""",

            AgentRole.CRITIC: """You are a critic agent specialized in evaluating outputs.
Your tasks include:
- Reviewing work for quality and accuracy
- Providing constructive feedback
- Suggesting improvements
- Validating against requirements

Always be thorough but constructive in your feedback.""",

            AgentRole.ORCHESTRATOR: """You are an orchestrator agent that coordinates other agents.
Your tasks include:
- Delegating tasks to appropriate agents
- Managing agent conversations
- Synthesizing results from multiple agents
- Ensuring goals are achieved

Always maintain focus on the overall objective.""",
        }
        return prompts.get(self.role, "You are a helpful AI assistant.")

    def create_autogen_agent(self) -> Optional[Any]:
        """Create an AutoGen agent instance."""
        if not AUTOGEN_AVAILABLE:
            logger.warning(f"AutoGen not available, cannot create {self.name}")
            return None

        self._agent = AssistantAgent(
            name=self.name,
            system_message=self.system_prompt,
            llm_config=self.llm_config,
        )
        return self._agent


class ResearchAgent(BaseAgent):
    """Agent specialized in research and information gathering."""

    def __init__(
        self,
        name: str = "Researcher",
        llm_config: Optional[dict] = None,
        system_prompt: Optional[str] = None,
    ):
        super().__init__(
            name=name,
            role=AgentRole.RESEARCHER,
            llm_config=llm_config,
            system_prompt=system_prompt,
        )

    async def research(
        self,
        query: ResearchQuery,
        llm_service: Any = None,
    ) -> ResearchResult:
        """
        Perform research on a given query.

        Args:
            query: The research query
            llm_service: Optional LLM service for summarization

        Returns:
            ResearchResult with findings and sources
        """
        logger.info(f"ResearchAgent starting research: {query.query}")

        sources = []
        search_type = query.search_type

        # Perform web search
        if search_type in ("web", "both"):
            web_results = await web_search(
                query=query.query,
                max_results=query.max_results,
            )
            sources.extend([
                {
                    "type": "web",
                    "title": r.get("title", ""),
                    "url": r.get("href", ""),
                    "snippet": r.get("body", ""),
                }
                for r in web_results
            ])

        # Format results for summarization
        formatted = format_search_results(
            [{"title": s["title"], "href": s.get("url", ""), "body": s.get("snippet", "")}
             for s in sources],
            search_type="web",
        )

        # Generate summary
        summary = f"Research findings for: {query.query}\n\n"
        if sources:
            summary += f"Found {len(sources)} sources.\n\n"
            if llm_service:
                try:
                    gen_result = await generate_text_tool(
                        prompt=f"Summarize these research findings concisely:\n\n{formatted}",
                        llm_service=llm_service,
                    )
                    summary = gen_result.generated_text
                except Exception as e:
                    logger.error(f"Error generating summary: {e}")
                    summary += formatted
            else:
                summary += formatted
        else:
            summary += "No sources found."

        # Calculate confidence based on source quality and quantity
        confidence = min(1.0, len(sources) / query.max_results * 0.8 + 0.2)

        return ResearchResult(
            query=query.query,
            sources=sources,
            summary=summary,
            confidence=confidence,
            search_type=search_type,
        )


class PlannerAgent(BaseAgent):
    """Agent specialized in creating execution plans."""

    def __init__(
        self,
        name: str = "Planner",
        llm_config: Optional[dict] = None,
        system_prompt: Optional[str] = None,
    ):
        super().__init__(
            name=name,
            role=AgentRole.PLANNER,
            llm_config=llm_config,
            system_prompt=system_prompt,
        )

    async def create_plan(
        self,
        goal: str,
        context: Optional[str] = None,
        available_tools: Optional[list[str]] = None,
        llm_service: Any = None,
    ) -> ExecutionPlan:
        """
        Create an execution plan for a given goal.

        Args:
            goal: The goal to achieve
            context: Additional context
            available_tools: List of available tool names
            llm_service: Optional LLM service for plan generation

        Returns:
            ExecutionPlan with steps
        """
        logger.info(f"PlannerAgent creating plan for: {goal}")

        plan_id = str(uuid.uuid4())[:8]
        steps = []

        # Use LLM to generate plan if available
        if llm_service:
            try:
                tools_str = ", ".join(available_tools) if available_tools else "web_search, analyze_prompt, generate_text"

                prompt = f"""Create a step-by-step execution plan for the following goal:

Goal: {goal}
{f'Context: {context}' if context else ''}
Available tools: {tools_str}

Provide 3-7 clear, actionable steps. For each step, specify:
1. The action to take
2. Which tool to use (if any)
3. Any dependencies on previous steps

Format each step as:
Step N: [Action] | Tool: [tool_name or none] | Depends on: [step numbers or none]
"""
                result = await generate_text_tool(
                    prompt=prompt,
                    llm_service=llm_service,
                )

                # Parse the generated plan
                lines = result.generated_text.strip().split("\n")
                step_num = 0
                for line in lines:
                    if line.strip().lower().startswith("step"):
                        step_num += 1
                        parts = line.split("|")
                        action = parts[0].split(":", 1)[-1].strip() if len(parts) > 0 else line
                        tool = None
                        deps = []

                        if len(parts) > 1:
                            tool_part = parts[1].lower()
                            if "tool:" in tool_part:
                                tool = parts[1].split(":")[-1].strip()
                                if tool.lower() == "none":
                                    tool = None

                        if len(parts) > 2:
                            dep_part = parts[2].lower()
                            if "depends" in dep_part:
                                dep_str = parts[2].split(":")[-1].strip()
                                if dep_str.lower() != "none":
                                    deps = [int(d.strip()) for d in dep_str.split(",") if d.strip().isdigit()]

                        steps.append(PlanStep(
                            step_number=step_num,
                            action=action,
                            description=action,
                            dependencies=deps,
                            tool_name=tool,
                        ))

            except Exception as e:
                logger.error(f"Error generating plan with LLM: {e}")

        # Fallback: create a basic plan
        if not steps:
            steps = [
                PlanStep(
                    step_number=1,
                    action="Analyze the goal",
                    description=f"Understand what needs to be done: {goal}",
                    dependencies=[],
                ),
                PlanStep(
                    step_number=2,
                    action="Research relevant information",
                    description="Gather necessary information and context",
                    dependencies=[1],
                    tool_name="web_search",
                ),
                PlanStep(
                    step_number=3,
                    action="Execute the main task",
                    description="Perform the primary work to achieve the goal",
                    dependencies=[1, 2],
                ),
                PlanStep(
                    step_number=4,
                    action="Review and validate",
                    description="Check that the goal has been achieved",
                    dependencies=[3],
                ),
            ]

        return ExecutionPlan(
            id=plan_id,
            goal=goal,
            steps=steps,
            metadata={"context": context, "available_tools": available_tools},
        )


class ExecutionAgent(BaseAgent):
    """Agent specialized in executing plans and tasks."""

    def __init__(
        self,
        name: str = "Executor",
        llm_config: Optional[dict] = None,
        system_prompt: Optional[str] = None,
    ):
        super().__init__(
            name=name,
            role=AgentRole.EXECUTOR,
            llm_config=llm_config,
            system_prompt=system_prompt,
        )

    async def execute_step(
        self,
        step: PlanStep,
        context: dict[str, Any],
        services: dict[str, Any] = None,
    ) -> dict[str, Any]:
        """
        Execute a single step from a plan.

        Args:
            step: The step to execute
            context: Execution context with previous results
            services: Dictionary of available services

        Returns:
            Result of the step execution
        """
        logger.info(f"ExecutionAgent executing step {step.step_number}: {step.action}")

        services = services or {}
        result = {"step": step.step_number, "success": False, "output": None, "error": None}

        try:
            # Execute based on tool
            if step.tool_name:
                tool_name = step.tool_name.lower().replace(" ", "_")

                if tool_name in ("web_search", "search"):
                    search_result = await web_search(
                        query=step.action,
                        max_results=5,
                    )
                    result["output"] = search_result
                    result["success"] = True

                elif tool_name in ("analyze_prompt", "analyze"):
                    prompt = step.tool_params.get("prompt", step.action)
                    analysis = await analyze_prompt_tool(
                        prompt=prompt,
                        instructor_service=services.get("instructor_service"),
                    )
                    result["output"] = analysis.model_dump()
                    result["success"] = True

                elif tool_name in ("refine_prompt", "refine"):
                    prompt = step.tool_params.get("prompt", step.action)
                    refinement = await refine_prompt_tool(
                        prompt=prompt,
                        instructor_service=services.get("instructor_service"),
                    )
                    result["output"] = refinement.model_dump()
                    result["success"] = True

                elif tool_name in ("generate_text", "generate"):
                    gen_result = await generate_text_tool(
                        prompt=step.action,
                        llm_service=services.get("llm_service"),
                    )
                    result["output"] = gen_result.model_dump()
                    result["success"] = True

                elif tool_name in ("execute_command", "command"):
                    cmd_result = await execute_command_tool(
                        command_name=step.tool_params.get("command", ""),
                        parameters=step.tool_params,
                        command_service=services.get("command_service"),
                    )
                    result["output"] = cmd_result.model_dump()
                    result["success"] = cmd_result.success

                else:
                    result["error"] = f"Unknown tool: {step.tool_name}"

            else:
                # No specific tool, just mark as completed
                result["output"] = f"Step completed: {step.action}"
                result["success"] = True

        except Exception as e:
            logger.error(f"Error executing step {step.step_number}: {e}")
            result["error"] = str(e)

        return result

    async def execute_plan(
        self,
        plan: ExecutionPlan,
        services: dict[str, Any] = None,
    ) -> AgentResult:
        """
        Execute a complete plan.

        Args:
            plan: The execution plan
            services: Dictionary of available services

        Returns:
            AgentResult with execution outcome
        """
        logger.info(f"ExecutionAgent executing plan: {plan.id}")

        import time
        start_time = time.time()

        services = services or {}
        plan.status = TaskStatus.IN_PROGRESS
        results = []
        context = {}

        for step in plan.steps:
            # Check dependencies
            deps_met = all(
                any(r["step"] == dep and r["success"] for r in results)
                for dep in step.dependencies
            )

            if not deps_met and step.dependencies:
                logger.warning(f"Step {step.step_number} dependencies not met, skipping")
                step.status = TaskStatus.FAILED
                continue

            step.status = TaskStatus.IN_PROGRESS
            plan.current_step = step.step_number

            step_result = await self.execute_step(step, context, services)
            results.append(step_result)

            if step_result["success"]:
                step.status = TaskStatus.COMPLETED
                step.result = step_result["output"]
                context[f"step_{step.step_number}"] = step_result["output"]
            else:
                step.status = TaskStatus.FAILED
                logger.error(f"Step {step.step_number} failed: {step_result.get('error')}")

        execution_time = (time.time() - start_time) * 1000

        # Determine overall success
        success = all(r["success"] for r in results)
        plan.status = TaskStatus.COMPLETED if success else TaskStatus.FAILED
        plan.completed_at = datetime.utcnow()

        return AgentResult(
            task_id=plan.id,
            agent_role=AgentRole.EXECUTOR,
            success=success,
            output={
                "plan_id": plan.id,
                "goal": plan.goal,
                "steps_completed": sum(1 for r in results if r["success"]),
                "total_steps": len(plan.steps),
                "results": results,
            },
            error=None if success else "Some steps failed",
            execution_time_ms=execution_time,
        )


class AgentOrchestrator:
    """
    Orchestrates multiple agents to accomplish complex tasks.

    Uses a Plan-and-Execute pattern:
    1. Planner creates an execution plan
    2. Researcher gathers necessary information
    3. Executor carries out the plan
    4. Results are synthesized and returned
    """

    def __init__(
        self,
        llm_config: Optional[dict] = None,
        services: dict[str, Any] = None,
    ):
        self.llm_config = llm_config
        self.services = services or {}

        # Initialize agents
        self.researcher = ResearchAgent(llm_config=llm_config)
        self.planner = PlannerAgent(llm_config=llm_config)
        self.executor = ExecutionAgent(llm_config=llm_config)

    async def run(
        self,
        task: AgentTask,
        with_research: bool = True,
    ) -> AgentResult:
        """
        Run the orchestration workflow for a task.

        Args:
            task: The task to accomplish
            with_research: Whether to perform research first

        Returns:
            AgentResult with the final outcome
        """
        logger.info(f"Orchestrator starting task: {task.description}")

        import time
        start_time = time.time()

        task.status = TaskStatus.IN_PROGRESS
        research_results = []
        llm_service = self.services.get("llm_service")

        # Step 1: Research (optional)
        if with_research:
            logger.info("Phase 1: Research")
            research_query = ResearchQuery(
                query=task.description,
                max_results=5,
                search_type="web",
            )
            research = await self.researcher.research(
                query=research_query,
                llm_service=llm_service,
            )
            research_results.append(research)
            task.context["research"] = research.model_dump()

        # Step 2: Planning
        logger.info("Phase 2: Planning")
        context = task.context.get("research", {}).get("summary", "")
        plan = await self.planner.create_plan(
            goal=task.description,
            context=context,
            available_tools=["web_search", "analyze_prompt", "refine_prompt", "generate_text"],
            llm_service=llm_service,
        )
        task.context["plan"] = plan.model_dump()

        # Step 3: Execution
        logger.info("Phase 3: Execution")
        execution_result = await self.executor.execute_plan(
            plan=plan,
            services=self.services,
        )

        execution_time = (time.time() - start_time) * 1000
        task.status = TaskStatus.COMPLETED if execution_result.success else TaskStatus.FAILED
        task.completed_at = datetime.utcnow()

        return AgentResult(
            task_id=task.id,
            agent_role=AgentRole.ORCHESTRATOR,
            success=execution_result.success,
            output={
                "task": task.description,
                "research": [r.model_dump() for r in research_results],
                "plan": plan.model_dump(),
                "execution": execution_result.output,
            },
            error=execution_result.error,
            execution_time_ms=execution_time,
            metadata={
                "phases_completed": ["research", "planning", "execution"] if with_research else ["planning", "execution"],
            },
        )

    async def research_only(self, query: str) -> ResearchResult:
        """Perform research only without planning/execution."""
        research_query = ResearchQuery(query=query, search_type="web")
        return await self.researcher.research(
            query=research_query,
            llm_service=self.services.get("llm_service"),
        )

    async def plan_only(self, goal: str, context: str = None) -> ExecutionPlan:
        """Create a plan only without execution."""
        return await self.planner.create_plan(
            goal=goal,
            context=context,
            llm_service=self.services.get("llm_service"),
        )
