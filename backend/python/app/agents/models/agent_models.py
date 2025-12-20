"""
Pydantic models for the Agent Framework.

Defines data structures for tasks, results, conversations,
and workflow states.
"""

from datetime import datetime
from enum import Enum
from typing import Any, Optional

from pydantic import BaseModel, Field


class AgentRole(str, Enum):
    """Agent roles in the system."""
    RESEARCHER = "researcher"
    PLANNER = "planner"
    EXECUTOR = "executor"
    CRITIC = "critic"
    ORCHESTRATOR = "orchestrator"


class TaskStatus(str, Enum):
    """Status of an agent task."""
    PENDING = "pending"
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"


class AgentTask(BaseModel):
    """A task to be performed by an agent."""
    id: str = Field(..., description="Unique task identifier")
    description: str = Field(..., description="Task description")
    agent_role: AgentRole = Field(..., description="Role of agent to handle this task")
    status: TaskStatus = Field(default=TaskStatus.PENDING)
    priority: int = Field(default=1, ge=1, le=10)
    context: dict[str, Any] = Field(default_factory=dict)
    created_at: datetime = Field(default_factory=datetime.utcnow)
    completed_at: Optional[datetime] = None


class AgentResult(BaseModel):
    """Result from an agent execution."""
    task_id: str = Field(..., description="ID of the completed task")
    agent_role: AgentRole = Field(..., description="Role of agent that produced this result")
    success: bool = Field(..., description="Whether the task succeeded")
    output: Any = Field(..., description="The result output")
    error: Optional[str] = Field(None, description="Error message if failed")
    execution_time_ms: float = Field(..., description="Execution time in milliseconds")
    metadata: dict[str, Any] = Field(default_factory=dict)


class ResearchQuery(BaseModel):
    """A research query for the research agent."""
    query: str = Field(..., description="The research query")
    max_results: int = Field(default=5, ge=1, le=20)
    search_type: str = Field(default="web", description="Type of search: web, semantic, or both")
    context: Optional[str] = Field(None, description="Additional context for the search")


class ResearchResult(BaseModel):
    """Result from a research operation."""
    query: str = Field(..., description="Original query")
    sources: list[dict[str, Any]] = Field(default_factory=list, description="List of sources found")
    summary: str = Field(..., description="Summarized findings")
    confidence: float = Field(..., ge=0.0, le=1.0, description="Confidence score")
    search_type: str = Field(..., description="Type of search performed")
    timestamp: datetime = Field(default_factory=datetime.utcnow)


class PlanStep(BaseModel):
    """A single step in an execution plan."""
    step_number: int = Field(..., ge=1)
    action: str = Field(..., description="Action to perform")
    description: str = Field(..., description="Detailed description of the step")
    dependencies: list[int] = Field(default_factory=list, description="Step numbers this depends on")
    estimated_duration_ms: Optional[int] = Field(None)
    tool_name: Optional[str] = Field(None, description="Tool to use for this step")
    tool_params: dict[str, Any] = Field(default_factory=dict)
    status: TaskStatus = Field(default=TaskStatus.PENDING)
    result: Optional[Any] = Field(None)


class ExecutionPlan(BaseModel):
    """A complete execution plan."""
    id: str = Field(..., description="Plan identifier")
    goal: str = Field(..., description="The goal to achieve")
    steps: list[PlanStep] = Field(default_factory=list)
    current_step: int = Field(default=0)
    status: TaskStatus = Field(default=TaskStatus.PENDING)
    created_at: datetime = Field(default_factory=datetime.utcnow)
    completed_at: Optional[datetime] = None
    metadata: dict[str, Any] = Field(default_factory=dict)


class AgentMessage(BaseModel):
    """A message in an agent conversation."""
    role: str = Field(..., description="Role: system, user, assistant, or tool")
    content: str = Field(..., description="Message content")
    name: Optional[str] = Field(None, description="Name of the agent")
    tool_calls: Optional[list[dict[str, Any]]] = Field(None)
    timestamp: datetime = Field(default_factory=datetime.utcnow)


class AgentConversation(BaseModel):
    """A conversation between agents."""
    id: str = Field(..., description="Conversation identifier")
    participants: list[AgentRole] = Field(default_factory=list)
    messages: list[AgentMessage] = Field(default_factory=list)
    task: Optional[AgentTask] = Field(None)
    status: TaskStatus = Field(default=TaskStatus.PENDING)
    started_at: datetime = Field(default_factory=datetime.utcnow)
    ended_at: Optional[datetime] = None


class WorkflowState(BaseModel):
    """State for LangGraph workflow."""
    messages: list[AgentMessage] = Field(default_factory=list)
    current_agent: Optional[AgentRole] = Field(None)
    task: Optional[AgentTask] = Field(None)
    plan: Optional[ExecutionPlan] = Field(None)
    research_results: list[ResearchResult] = Field(default_factory=list)
    intermediate_results: list[Any] = Field(default_factory=list)
    final_result: Optional[Any] = Field(None)
    error: Optional[str] = Field(None)
    iteration: int = Field(default=0)
    max_iterations: int = Field(default=10)


class AgentConfig(BaseModel):
    """Configuration for an agent."""
    name: str = Field(..., description="Agent name")
    role: AgentRole = Field(..., description="Agent role")
    model: str = Field(default="gpt-4-turbo", description="LLM model to use")
    temperature: float = Field(default=0.7, ge=0.0, le=2.0)
    max_tokens: int = Field(default=4096)
    system_prompt: Optional[str] = Field(None)
    tools: list[str] = Field(default_factory=list, description="List of tool names available")
    metadata: dict[str, Any] = Field(default_factory=dict)
