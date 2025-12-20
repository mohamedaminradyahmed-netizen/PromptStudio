"""
Execution tools for agents.

Provides command execution and text generation capabilities
by integrating with existing services.
"""

from typing import Any, Optional

from loguru import logger
from pydantic import BaseModel, Field


class CommandExecutionResult(BaseModel):
    """Result of command execution."""
    command_name: str
    success: bool
    output: Any
    error: Optional[str] = None
    execution_time_ms: float
    tokens_used: Optional[int] = None


class TextGenerationResult(BaseModel):
    """Result of text generation."""
    prompt: str
    generated_text: str
    model: str
    tokens_used: int
    finish_reason: str
    latency_ms: float


async def execute_command_tool(
    command_name: str,
    parameters: dict[str, Any],
    command_service: Any = None,
) -> CommandExecutionResult:
    """
    Execute a YAML-defined command.

    Args:
        command_name: Name of the command to execute
        parameters: Parameters for the command
        command_service: CommandService instance (injected)

    Returns:
        CommandExecutionResult with output and metadata
    """
    logger.info(f"Executing command: {command_name} with params: {parameters}")

    import time
    start_time = time.time()

    if command_service is not None:
        try:
            result = await command_service.execute_command(command_name, parameters)
            execution_time = (time.time() - start_time) * 1000

            return CommandExecutionResult(
                command_name=command_name,
                success=True,
                output=result.get("result"),
                execution_time_ms=execution_time,
                tokens_used=result.get("usage", {}).get("total_tokens"),
            )
        except Exception as e:
            execution_time = (time.time() - start_time) * 1000
            logger.error(f"Command execution error: {e}")
            return CommandExecutionResult(
                command_name=command_name,
                success=False,
                output=None,
                error=str(e),
                execution_time_ms=execution_time,
            )

    # Fallback: return placeholder
    execution_time = (time.time() - start_time) * 1000
    return CommandExecutionResult(
        command_name=command_name,
        success=False,
        output=None,
        error="CommandService not available",
        execution_time_ms=execution_time,
    )


async def generate_text_tool(
    prompt: str,
    model: str = "gpt-4-turbo",
    temperature: float = 0.7,
    max_tokens: int = 1024,
    llm_service: Any = None,
) -> TextGenerationResult:
    """
    Generate text using an LLM.

    Args:
        prompt: The prompt for generation
        model: Model to use
        temperature: Sampling temperature
        max_tokens: Maximum tokens to generate
        llm_service: LLMService instance (injected)

    Returns:
        TextGenerationResult with generated text and metadata
    """
    logger.info(f"Generating text with model: {model}")

    import time
    start_time = time.time()

    if llm_service is not None:
        try:
            from app.models.llm_models import LLMRequest, Message

            request = LLMRequest(
                messages=[Message(role="user", content=prompt)],
                model=model,
                temperature=temperature,
                max_tokens=max_tokens,
            )

            response = await llm_service.generate(request)
            latency = (time.time() - start_time) * 1000

            return TextGenerationResult(
                prompt=prompt,
                generated_text=response.content,
                model=model,
                tokens_used=response.usage.get("total_tokens", 0) if response.usage else 0,
                finish_reason=response.finish_reason or "stop",
                latency_ms=latency,
            )
        except Exception as e:
            logger.error(f"Text generation error: {e}")

    # Fallback: return placeholder
    latency = (time.time() - start_time) * 1000
    return TextGenerationResult(
        prompt=prompt,
        generated_text="[Text generation unavailable - LLMService not configured]",
        model=model,
        tokens_used=0,
        finish_reason="error",
        latency_ms=latency,
    )


def create_tool_schema(tool_func: callable) -> dict[str, Any]:
    """
    Create an OpenAI-compatible function schema from a tool function.

    Args:
        tool_func: The tool function

    Returns:
        Function schema dictionary
    """
    import inspect

    sig = inspect.signature(tool_func)
    doc = tool_func.__doc__ or ""

    # Parse docstring for description
    description = doc.split("\n\n")[0].strip() if doc else tool_func.__name__

    # Build parameters schema
    properties = {}
    required = []

    for name, param in sig.parameters.items():
        if name in ("self", "llm_service", "command_service", "instructor_service"):
            continue

        param_type = "string"
        if param.annotation != inspect.Parameter.empty:
            if param.annotation == int:
                param_type = "integer"
            elif param.annotation == float:
                param_type = "number"
            elif param.annotation == bool:
                param_type = "boolean"
            elif param.annotation == dict or "dict" in str(param.annotation):
                param_type = "object"

        properties[name] = {
            "type": param_type,
            "description": f"Parameter: {name}",
        }

        if param.default == inspect.Parameter.empty:
            required.append(name)

    return {
        "name": tool_func.__name__,
        "description": description,
        "parameters": {
            "type": "object",
            "properties": properties,
            "required": required,
        },
    }
