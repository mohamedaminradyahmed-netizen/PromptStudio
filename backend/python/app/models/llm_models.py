"""
Pydantic models for LLM interactions with Mirascope & Instructor
"""

from typing import Optional, List, Dict, Any
from enum import Enum
from pydantic import BaseModel, Field


class LLMProvider(str, Enum):
    """Supported LLM providers"""
    OPENAI = "openai"
    ANTHROPIC = "anthropic"
    GOOGLE = "google"
    AZURE = "azure"


class MessageRole(str, Enum):
    """Message roles in conversation"""
    SYSTEM = "system"
    USER = "user"
    ASSISTANT = "assistant"


class Message(BaseModel):
    """Single message in a conversation"""
    role: MessageRole
    content: str


class LLMRequest(BaseModel):
    """Request to LLM service"""
    messages: List[Message]
    model: Optional[str] = None
    provider: Optional[LLMProvider] = None
    temperature: float = Field(default=0.7, ge=0, le=2)
    max_tokens: Optional[int] = Field(default=None, ge=1, le=128000)
    stream: bool = False
    response_format: Optional[Dict[str, Any]] = None


class LLMResponse(BaseModel):
    """Response from LLM service"""
    content: str
    model: str
    provider: LLMProvider
    usage: Dict[str, int]
    finish_reason: str
    latency_ms: float


class PromptAnalysis(BaseModel):
    """Structured analysis of a prompt - used with Instructor"""
    clarity_score: float = Field(ge=0, le=10, description="Clarity score from 0-10")
    specificity_score: float = Field(ge=0, le=10, description="Specificity score from 0-10")
    effectiveness_score: float = Field(ge=0, le=10, description="Effectiveness score from 0-10")
    issues: List[str] = Field(default_factory=list, description="List of identified issues")
    strengths: List[str] = Field(default_factory=list, description="List of strengths")
    suggestions: List[str] = Field(default_factory=list, description="Improvement suggestions")
    overall_assessment: str = Field(description="Overall assessment summary")


class PromptSuggestion(BaseModel):
    """Suggested improvement for a prompt"""
    original_text: str
    suggested_text: str
    reason: str
    improvement_type: str = Field(description="Type: clarity, specificity, tone, structure")
    confidence: float = Field(ge=0, le=1)


class PromptRefinement(BaseModel):
    """Refined version of a prompt with Instructor"""
    refined_prompt: str = Field(description="The improved prompt")
    changes_made: List[str] = Field(description="List of changes made")
    improvement_percentage: float = Field(ge=0, le=100)
    preserved_intent: bool = Field(description="Whether original intent was preserved")


class TranslationResult(BaseModel):
    """Translation result with quality metrics"""
    source_language: str
    target_language: str
    original_text: str
    translated_text: str
    confidence: float = Field(ge=0, le=1)
    alternative_translations: List[str] = Field(default_factory=list)
    cultural_notes: Optional[str] = None


class SafetyCategory(str, Enum):
    """Safety check categories"""
    INJECTION = "injection"
    PII = "pii"
    HARMFUL_CONTENT = "harmful_content"
    BIAS = "bias"
    COPYRIGHT = "copyright"


class SafetyIssue(BaseModel):
    """Individual safety issue"""
    category: SafetyCategory
    severity: str = Field(description="low, medium, high, critical")
    description: str
    location: Optional[str] = None
    recommendation: str


class SafetyCheck(BaseModel):
    """Safety analysis result"""
    is_safe: bool
    overall_risk_level: str = Field(description="low, medium, high, critical")
    issues: List[SafetyIssue] = Field(default_factory=list)
    sanitized_prompt: Optional[str] = None
    confidence: float = Field(ge=0, le=1)


class CostPrediction(BaseModel):
    """Pre-send cost prediction for LLM calls"""
    estimated_input_tokens: int
    estimated_output_tokens: int
    estimated_cost_usd: float
    model: str
    provider: str
    confidence: float = Field(ge=0, le=1)
    breakdown: Dict[str, float] = Field(default_factory=dict)


class ChainStep(BaseModel):
    """Single step in a prompt chain"""
    step_number: int
    prompt: str
    expected_output_type: str
    dependencies: List[int] = Field(default_factory=list)


class PromptChain(BaseModel):
    """A chain of prompts for complex tasks"""
    name: str
    description: str
    steps: List[ChainStep]
    variables: Dict[str, Any] = Field(default_factory=dict)
