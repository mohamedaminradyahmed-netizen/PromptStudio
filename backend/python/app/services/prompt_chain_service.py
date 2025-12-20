"""
Prompt Chain Service

Execute multi-step prompt chains with dependencies, context passing,
and structured outputs using Mirascope and Instructor.
"""

import asyncio
import time
from typing import Optional, List, Dict, Any, AsyncGenerator
from enum import Enum
from pydantic import BaseModel, Field
from loguru import logger

from .llm_service import LLMService
from .instructor_service import InstructorService
from ..models.llm_models import (
    LLMProvider,
    Message,
    MessageRole,
    LLMRequest,
)


class ChainStepStatus(str, Enum):
    """Status of a chain step execution"""
    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"
    SKIPPED = "skipped"


class ChainExecutionMode(str, Enum):
    """Execution mode for chain steps"""
    SEQUENTIAL = "sequential"
    PARALLEL = "parallel"
    CONDITIONAL = "conditional"


class ChainStepDefinition(BaseModel):
    """Definition of a single step in a prompt chain"""
    id: str = Field(description="Unique step identifier")
    name: str = Field(description="Human-readable step name")
    prompt_template: str = Field(description="Prompt template with {variable} placeholders")
    system_prompt: Optional[str] = None
    dependencies: List[str] = Field(default_factory=list, description="IDs of steps this depends on")
    condition: Optional[str] = Field(default=None, description="Python expression for conditional execution")
    output_key: str = Field(description="Key to store output in context")
    output_schema: Optional[str] = Field(default=None, description="Pydantic model for structured output")
    model: Optional[str] = None
    temperature: float = 0.7
    max_tokens: Optional[int] = None
    retry_count: int = 2
    timeout_seconds: int = 60


class ChainDefinition(BaseModel):
    """Complete chain definition"""
    id: str
    name: str
    description: str
    steps: List[ChainStepDefinition]
    execution_mode: ChainExecutionMode = ChainExecutionMode.SEQUENTIAL
    variables: Dict[str, Any] = Field(default_factory=dict)
    metadata: Dict[str, Any] = Field(default_factory=dict)


class ChainStepResult(BaseModel):
    """Result of a single chain step"""
    step_id: str
    step_name: str
    status: ChainStepStatus
    output: Optional[Any] = None
    structured_output: Optional[Dict[str, Any]] = None
    error: Optional[str] = None
    latency_ms: float = 0
    tokens_used: Dict[str, int] = Field(default_factory=dict)


class ChainExecutionResult(BaseModel):
    """Result of complete chain execution"""
    chain_id: str
    chain_name: str
    success: bool
    steps: List[ChainStepResult]
    final_output: Optional[Any] = None
    context: Dict[str, Any] = Field(default_factory=dict)
    total_latency_ms: float = 0
    total_tokens: Dict[str, int] = Field(default_factory=dict)
    error: Optional[str] = None


class PromptChainService:
    """
    Service for executing multi-step prompt chains

    Features:
    - Sequential and parallel execution modes
    - Dependency resolution between steps
    - Context passing between steps
    - Structured outputs with Instructor
    - Conditional step execution
    - Retry logic with exponential backoff
    - Streaming support for long-running chains
    """

    def __init__(
        self,
        llm_service: Optional[LLMService] = None,
        instructor_service: Optional[InstructorService] = None,
    ):
        self.llm_service = llm_service or LLMService()
        self.instructor_service = instructor_service or InstructorService()
        self._chains: Dict[str, ChainDefinition] = {}

    def register_chain(self, chain: ChainDefinition) -> None:
        """Register a chain definition"""
        self._chains[chain.id] = chain
        logger.info(f"Registered chain: {chain.name} ({chain.id})")

    def get_chain(self, chain_id: str) -> Optional[ChainDefinition]:
        """Get a chain by ID"""
        return self._chains.get(chain_id)

    def list_chains(self) -> List[str]:
        """List all registered chains"""
        return list(self._chains.keys())

    async def execute(
        self,
        chain_id: str,
        variables: Optional[Dict[str, Any]] = None,
        stream_updates: bool = False,
    ) -> ChainExecutionResult:
        """
        Execute a registered chain

        Args:
            chain_id: ID of the chain to execute
            variables: Input variables for the chain
            stream_updates: Whether to yield updates during execution

        Returns:
            ChainExecutionResult with all step results
        """
        chain = self.get_chain(chain_id)
        if not chain:
            return ChainExecutionResult(
                chain_id=chain_id,
                chain_name="Unknown",
                success=False,
                steps=[],
                error=f"Chain not found: {chain_id}",
            )

        return await self.execute_chain(chain, variables or {})

    async def execute_chain(
        self,
        chain: ChainDefinition,
        variables: Dict[str, Any],
    ) -> ChainExecutionResult:
        """
        Execute a chain definition

        Args:
            chain: Chain definition to execute
            variables: Input variables for the chain

        Returns:
            ChainExecutionResult with all step results
        """
        start_time = time.time()
        context = {**chain.variables, **variables}
        step_results: List[ChainStepResult] = []
        total_tokens = {"prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0}

        try:
            if chain.execution_mode == ChainExecutionMode.SEQUENTIAL:
                step_results = await self._execute_sequential(chain.steps, context)
            elif chain.execution_mode == ChainExecutionMode.PARALLEL:
                step_results = await self._execute_parallel(chain.steps, context)
            elif chain.execution_mode == ChainExecutionMode.CONDITIONAL:
                step_results = await self._execute_conditional(chain.steps, context)

            # Aggregate results
            success = all(r.status == ChainStepStatus.COMPLETED for r in step_results)
            for result in step_results:
                for key, value in result.tokens_used.items():
                    total_tokens[key] = total_tokens.get(key, 0) + value

            # Get final output from last successful step
            final_output = None
            for result in reversed(step_results):
                if result.status == ChainStepStatus.COMPLETED:
                    final_output = result.structured_output or result.output
                    break

            total_latency = (time.time() - start_time) * 1000

            return ChainExecutionResult(
                chain_id=chain.id,
                chain_name=chain.name,
                success=success,
                steps=step_results,
                final_output=final_output,
                context=context,
                total_latency_ms=total_latency,
                total_tokens=total_tokens,
            )

        except Exception as e:
            logger.error(f"Chain execution failed: {e}")
            return ChainExecutionResult(
                chain_id=chain.id,
                chain_name=chain.name,
                success=False,
                steps=step_results,
                error=str(e),
                total_latency_ms=(time.time() - start_time) * 1000,
            )

    async def _execute_sequential(
        self,
        steps: List[ChainStepDefinition],
        context: Dict[str, Any],
    ) -> List[ChainStepResult]:
        """Execute steps sequentially"""
        results = []

        for step in steps:
            # Check dependencies
            if not self._check_dependencies(step, results):
                results.append(ChainStepResult(
                    step_id=step.id,
                    step_name=step.name,
                    status=ChainStepStatus.SKIPPED,
                    error="Dependencies not met",
                ))
                continue

            # Execute step
            result = await self._execute_step(step, context)
            results.append(result)

            # Update context with output
            if result.status == ChainStepStatus.COMPLETED:
                context[step.output_key] = result.structured_output or result.output

        return results

    async def _execute_parallel(
        self,
        steps: List[ChainStepDefinition],
        context: Dict[str, Any],
    ) -> List[ChainStepResult]:
        """Execute independent steps in parallel"""
        # Group steps by dependency level
        levels = self._group_by_dependency_level(steps)
        results = []

        for level_steps in levels:
            # Execute all steps in this level in parallel
            tasks = [self._execute_step(step, context) for step in level_steps]
            level_results = await asyncio.gather(*tasks, return_exceptions=True)

            for step, result in zip(level_steps, level_results):
                if isinstance(result, Exception):
                    results.append(ChainStepResult(
                        step_id=step.id,
                        step_name=step.name,
                        status=ChainStepStatus.FAILED,
                        error=str(result),
                    ))
                else:
                    results.append(result)
                    if result.status == ChainStepStatus.COMPLETED:
                        context[step.output_key] = result.structured_output or result.output

        return results

    async def _execute_conditional(
        self,
        steps: List[ChainStepDefinition],
        context: Dict[str, Any],
    ) -> List[ChainStepResult]:
        """Execute steps with conditional logic"""
        results = []

        for step in steps:
            # Evaluate condition if present
            if step.condition:
                try:
                    should_execute = eval(step.condition, {"__builtins__": {}}, context)
                    if not should_execute:
                        results.append(ChainStepResult(
                            step_id=step.id,
                            step_name=step.name,
                            status=ChainStepStatus.SKIPPED,
                            error="Condition not met",
                        ))
                        continue
                except Exception as e:
                    logger.warning(f"Condition evaluation failed for {step.id}: {e}")

            # Execute step
            result = await self._execute_step(step, context)
            results.append(result)

            if result.status == ChainStepStatus.COMPLETED:
                context[step.output_key] = result.structured_output or result.output

        return results

    async def _execute_step(
        self,
        step: ChainStepDefinition,
        context: Dict[str, Any],
    ) -> ChainStepResult:
        """Execute a single chain step with retry logic"""
        start_time = time.time()
        last_error = None

        for attempt in range(step.retry_count + 1):
            try:
                # Render prompt template
                prompt = self._render_template(step.prompt_template, context)

                # Build messages
                messages = []
                if step.system_prompt:
                    rendered_system = self._render_template(step.system_prompt, context)
                    messages.append(Message(role=MessageRole.SYSTEM, content=rendered_system))
                messages.append(Message(role=MessageRole.USER, content=prompt))

                # Execute with structured output if schema specified
                if step.output_schema:
                    result = await self.instructor_service.extract(
                        response_model=self._get_output_model(step.output_schema),
                        messages=messages,
                        model=step.model,
                        temperature=step.temperature,
                    )
                    output = result.model_dump() if hasattr(result, 'model_dump') else str(result)
                    structured = output if isinstance(output, dict) else None
                else:
                    # Use regular LLM call
                    llm_request = LLMRequest(
                        messages=messages,
                        model=step.model,
                        temperature=step.temperature,
                        max_tokens=step.max_tokens,
                    )
                    response = await self.llm_service.generate(llm_request)
                    output = response.content
                    structured = None

                latency_ms = (time.time() - start_time) * 1000

                return ChainStepResult(
                    step_id=step.id,
                    step_name=step.name,
                    status=ChainStepStatus.COMPLETED,
                    output=output if not structured else None,
                    structured_output=structured,
                    latency_ms=latency_ms,
                )

            except Exception as e:
                last_error = str(e)
                logger.warning(f"Step {step.id} attempt {attempt + 1} failed: {e}")
                if attempt < step.retry_count:
                    await asyncio.sleep(2 ** attempt)  # Exponential backoff

        return ChainStepResult(
            step_id=step.id,
            step_name=step.name,
            status=ChainStepStatus.FAILED,
            error=last_error,
            latency_ms=(time.time() - start_time) * 1000,
        )

    def _render_template(self, template: str, context: Dict[str, Any]) -> str:
        """Render a prompt template with context variables"""
        result = template
        for key, value in context.items():
            placeholder = f"{{{key}}}"
            if placeholder in result:
                result = result.replace(placeholder, str(value))
        return result

    def _check_dependencies(
        self,
        step: ChainStepDefinition,
        completed_results: List[ChainStepResult],
    ) -> bool:
        """Check if all dependencies for a step are met"""
        completed_ids = {
            r.step_id for r in completed_results
            if r.status == ChainStepStatus.COMPLETED
        }
        return all(dep in completed_ids for dep in step.dependencies)

    def _group_by_dependency_level(
        self,
        steps: List[ChainStepDefinition],
    ) -> List[List[ChainStepDefinition]]:
        """Group steps by their dependency level for parallel execution"""
        levels: List[List[ChainStepDefinition]] = []
        remaining = list(steps)
        resolved_ids = set()

        while remaining:
            # Find steps with all dependencies resolved
            current_level = []
            for step in remaining:
                if all(dep in resolved_ids for dep in step.dependencies):
                    current_level.append(step)

            if not current_level:
                # Circular dependency or missing dependency
                logger.warning("Could not resolve all dependencies")
                current_level = remaining
                remaining = []
            else:
                for step in current_level:
                    remaining.remove(step)
                    resolved_ids.add(step.id)

            levels.append(current_level)

        return levels

    def _get_output_model(self, schema_name: str):
        """Get Pydantic model by name"""
        from ..models.llm_models import (
            PromptAnalysis,
            PromptRefinement,
            TranslationResult,
            SafetyCheck,
            CostPrediction,
        )

        models = {
            "PromptAnalysis": PromptAnalysis,
            "PromptRefinement": PromptRefinement,
            "TranslationResult": TranslationResult,
            "SafetyCheck": SafetyCheck,
            "CostPrediction": CostPrediction,
        }

        return models.get(schema_name)

    async def stream_execute(
        self,
        chain: ChainDefinition,
        variables: Dict[str, Any],
    ) -> AsyncGenerator[ChainStepResult, None]:
        """
        Execute chain and yield step results as they complete

        Useful for long-running chains where you want to
        show progress to the user.
        """
        context = {**chain.variables, **variables}

        for step in chain.steps:
            # Check dependencies from context
            deps_met = all(
                dep in context for dep in step.dependencies
            )

            if not deps_met:
                result = ChainStepResult(
                    step_id=step.id,
                    step_name=step.name,
                    status=ChainStepStatus.SKIPPED,
                    error="Dependencies not met",
                )
                yield result
                continue

            result = await self._execute_step(step, context)
            yield result

            if result.status == ChainStepStatus.COMPLETED:
                context[step.output_key] = result.structured_output or result.output
