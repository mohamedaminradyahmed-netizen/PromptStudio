"""
Command Service

Executes commands loaded from YAML with structured outputs using Instructor.
"""

import time
from typing import Dict, Any, Optional, Type
from pydantic import BaseModel
from loguru import logger

from .yaml_loader import YAMLCommandLoader
from .instructor_service import InstructorService
from .llm_service import LLMService
from ..models.command_models import (
    Command,
    CommandExecutionRequest,
    CommandExecutionResult,
    CommandCategory,
)
from ..models.llm_models import (
    LLMRequest,
    Message,
    MessageRole,
    PromptAnalysis,
    PromptRefinement,
    TranslationResult,
    SafetyCheck,
    CostPrediction,
)


# Map of output schema names to Pydantic models
OUTPUT_SCHEMA_MAP: Dict[str, Type[BaseModel]] = {
    "PromptAnalysis": PromptAnalysis,
    "PromptRefinement": PromptRefinement,
    "TranslationResult": TranslationResult,
    "SafetyCheck": SafetyCheck,
    "CostPrediction": CostPrediction,
}


class CommandService:
    """
    Service for executing YAML-defined commands

    Combines YAMLCommandLoader for command definitions
    and InstructorService for structured outputs.
    """

    def __init__(
        self,
        yaml_loader: Optional[YAMLCommandLoader] = None,
        instructor_service: Optional[InstructorService] = None,
        llm_service: Optional[LLMService] = None,
    ):
        self.yaml_loader = yaml_loader or YAMLCommandLoader()
        self.instructor_service = instructor_service or InstructorService()
        self.llm_service = llm_service or LLMService()

        # Load commands
        self.yaml_loader.load_all()

    async def execute(
        self,
        request: CommandExecutionRequest
    ) -> CommandExecutionResult:
        """
        Execute a command

        Args:
            request: Command execution request with name and parameters

        Returns:
            CommandExecutionResult with output and metrics
        """
        start_time = time.time()

        # Get command definition
        command = self.yaml_loader.get_command(request.command_name)
        if not command:
            return CommandExecutionResult(
                command_name=request.command_name,
                success=False,
                output=None,
                usage={},
                latency_ms=0,
                error=f"Command not found: {request.command_name}"
            )

        try:
            # Render the template with parameters
            rendered_prompt = command.render(**request.parameters)

            # Build messages
            messages = []
            if command.system_prompt:
                messages.append(Message(
                    role=MessageRole.SYSTEM,
                    content=command.system_prompt
                ))
            messages.append(Message(
                role=MessageRole.USER,
                content=rendered_prompt
            ))

            # Determine execution method based on output schema
            if command.output_schema and command.output_schema in OUTPUT_SCHEMA_MAP:
                # Use Instructor for structured output
                result = await self._execute_structured(
                    command, messages, request
                )
            else:
                # Use LLM service for unstructured output
                result = await self._execute_unstructured(
                    command, messages, request
                )

            latency_ms = (time.time() - start_time) * 1000

            return CommandExecutionResult(
                command_name=request.command_name,
                success=True,
                output=result["output"],
                structured_output=result.get("structured_output"),
                usage=result["usage"],
                latency_ms=latency_ms,
            )

        except Exception as e:
            logger.error(f"Command execution failed: {e}")
            latency_ms = (time.time() - start_time) * 1000
            return CommandExecutionResult(
                command_name=request.command_name,
                success=False,
                output=None,
                usage={},
                latency_ms=latency_ms,
                error=str(e)
            )

    async def _execute_structured(
        self,
        command: Command,
        messages: list[Message],
        request: CommandExecutionRequest,
    ) -> Dict[str, Any]:
        """Execute with structured output using Instructor"""
        output_model = OUTPUT_SCHEMA_MAP[command.output_schema]

        result = await self.instructor_service.extract(
            response_model=output_model,
            messages=messages,
            model=request.override_model or command.model,
            temperature=request.override_temperature or command.temperature,
        )

        return {
            "output": result.model_dump(),
            "structured_output": result.model_dump(),
            "usage": {"estimated_tokens": len(str(result.model_dump())) // 4},
        }

    async def _execute_unstructured(
        self,
        command: Command,
        messages: list[Message],
        request: CommandExecutionRequest,
    ) -> Dict[str, Any]:
        """Execute with unstructured output using LLM service"""
        llm_request = LLMRequest(
            messages=messages,
            model=request.override_model or command.model,
            temperature=request.override_temperature or command.temperature,
            max_tokens=command.max_tokens,
            stream=request.stream,
        )

        response = await self.llm_service.generate(llm_request)

        return {
            "output": response.content,
            "usage": response.usage,
        }

    def get_command(self, name: str) -> Optional[Command]:
        """Get a command by name"""
        return self.yaml_loader.get_command(name)

    def list_commands(self) -> list[str]:
        """List all available commands"""
        return self.yaml_loader.list_commands()

    def get_commands_by_category(self, category: CommandCategory) -> list[Command]:
        """Get commands by category"""
        return self.yaml_loader.get_commands_by_category(category)

    def search_commands(self, query: str) -> list[Command]:
        """Search commands"""
        return self.yaml_loader.search_commands(query)

    def reload_commands(self) -> None:
        """Reload all commands from YAML files"""
        self.yaml_loader.reload()
