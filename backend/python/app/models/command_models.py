"""
Command models for YAML-based command storage
"""

from typing import Optional, List, Dict, Any
from enum import Enum
from pydantic import BaseModel, Field


class ParameterType(str, Enum):
    """Supported parameter types"""
    STRING = "string"
    NUMBER = "number"
    BOOLEAN = "boolean"
    ARRAY = "array"
    OBJECT = "object"
    FILE = "file"


class CommandParameter(BaseModel):
    """Parameter definition for a command"""
    name: str
    type: ParameterType
    description: str
    required: bool = False
    default: Optional[Any] = None
    choices: Optional[List[Any]] = None
    validation_pattern: Optional[str] = None


class CommandCategory(str, Enum):
    """Command categories"""
    GENERATION = "generation"
    ANALYSIS = "analysis"
    TRANSLATION = "translation"
    REFINEMENT = "refinement"
    SAFETY = "safety"
    CHAIN = "chain"
    CUSTOM = "custom"


class CommandMetadata(BaseModel):
    """Metadata for a command"""
    author: Optional[str] = None
    version: str = "1.0.0"
    created_at: Optional[str] = None
    updated_at: Optional[str] = None
    tags: List[str] = Field(default_factory=list)
    language: str = "en"


class Command(BaseModel):
    """
    Command definition loaded from YAML

    Example YAML:
    ```yaml
    name: analyze_prompt
    category: analysis
    description: Analyze a prompt for clarity and effectiveness
    template: |
      Analyze the following prompt for clarity, specificity, and effectiveness:

      Prompt: {prompt}

      Provide a structured analysis.
    parameters:
      - name: prompt
        type: string
        description: The prompt to analyze
        required: true
    output_schema: PromptAnalysis
    metadata:
      author: PromptStudio
      version: "1.0.0"
      tags:
        - analysis
        - quality
    ```
    """
    name: str = Field(description="Unique command identifier")
    category: CommandCategory
    description: str
    template: str = Field(description="Prompt template with {variable} placeholders")
    parameters: List[CommandParameter] = Field(default_factory=list)
    output_schema: Optional[str] = Field(
        default=None,
        description="Pydantic model name for structured output"
    )
    system_prompt: Optional[str] = Field(
        default=None,
        description="Optional system prompt for the command"
    )
    examples: List[Dict[str, Any]] = Field(
        default_factory=list,
        description="Example inputs and outputs"
    )
    metadata: CommandMetadata = Field(default_factory=CommandMetadata)

    # Execution settings
    model: Optional[str] = None
    temperature: float = 0.7
    max_tokens: Optional[int] = None

    def render(self, **kwargs) -> str:
        """Render the template with provided parameters"""
        rendered = self.template
        for param in self.parameters:
            placeholder = f"{{{param.name}}}"
            value = kwargs.get(param.name, param.default)
            if value is not None:
                rendered = rendered.replace(placeholder, str(value))
            elif param.required:
                raise ValueError(f"Required parameter '{param.name}' not provided")
        return rendered


class CommandExecutionRequest(BaseModel):
    """Request to execute a command"""
    command_name: str
    parameters: Dict[str, Any] = Field(default_factory=dict)
    override_model: Optional[str] = None
    override_temperature: Optional[float] = None
    stream: bool = False


class CommandExecutionResult(BaseModel):
    """Result of command execution"""
    command_name: str
    success: bool
    output: Any
    structured_output: Optional[Dict[str, Any]] = None
    usage: Dict[str, int]
    latency_ms: float
    error: Optional[str] = None
