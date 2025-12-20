"""
Pydantic models for LLM interactions with Mirascope & Instructor

Enhanced models for structured outputs, chains, embeddings, and batch processing.
"""

from typing import Optional, List, Dict, Any, Union
from enum import Enum
from datetime import datetime
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
    FUNCTION = "function"
    TOOL = "tool"


class Message(BaseModel):
    """Single message in a conversation"""
    role: MessageRole
    content: str
    name: Optional[str] = None
    tool_calls: Optional[List[Dict[str, Any]]] = None
    tool_call_id: Optional[str] = None


class LLMRequest(BaseModel):
    """Request to LLM service"""
    messages: List[Message]
    model: Optional[str] = None
    provider: Optional[LLMProvider] = None
    temperature: float = Field(default=0.7, ge=0, le=2)
    max_tokens: Optional[int] = Field(default=None, ge=1, le=128000)
    stream: bool = False
    response_format: Optional[Dict[str, Any]] = None
    tools: Optional[List[Dict[str, Any]]] = None
    tool_choice: Optional[Union[str, Dict[str, Any]]] = None
    stop: Optional[List[str]] = None
    top_p: Optional[float] = Field(default=None, ge=0, le=1)
    frequency_penalty: Optional[float] = Field(default=None, ge=-2, le=2)
    presence_penalty: Optional[float] = Field(default=None, ge=-2, le=2)


class LLMResponse(BaseModel):
    """Response from LLM service"""
    content: str
    model: str
    provider: LLMProvider
    usage: Dict[str, Any]
    finish_reason: str
    latency_ms: float
    tool_calls: Optional[List[Dict[str, Any]]] = None


# Structured Analysis Models for Instructor

class PromptQuality(str, Enum):
    """Quality levels for prompts"""
    EXCELLENT = "excellent"
    GOOD = "good"
    FAIR = "fair"
    POOR = "poor"
    NEEDS_WORK = "needs_work"


class PromptAnalysis(BaseModel):
    """Structured analysis of a prompt - used with Instructor"""
    clarity_score: float = Field(ge=0, le=10, description="Clarity score from 0-10")
    specificity_score: float = Field(ge=0, le=10, description="Specificity score from 0-10")
    effectiveness_score: float = Field(ge=0, le=10, description="Effectiveness score from 0-10")
    completeness_score: float = Field(ge=0, le=10, default=5.0, description="How complete the instructions are")
    quality: PromptQuality = Field(default=PromptQuality.FAIR, description="Overall quality assessment")
    issues: List[str] = Field(default_factory=list, description="List of identified issues")
    strengths: List[str] = Field(default_factory=list, description="List of strengths")
    suggestions: List[str] = Field(default_factory=list, description="Improvement suggestions")
    overall_assessment: str = Field(description="Overall assessment summary")
    estimated_tokens: Optional[int] = Field(default=None, description="Estimated token usage")


class PromptSuggestion(BaseModel):
    """Suggested improvement for a prompt"""
    original_text: str
    suggested_text: str
    reason: str
    improvement_type: str = Field(description="Type: clarity, specificity, tone, structure")
    confidence: float = Field(ge=0, le=1)
    impact: str = Field(default="medium", description="low, medium, high")


class PromptRefinement(BaseModel):
    """Refined version of a prompt with Instructor"""
    refined_prompt: str = Field(description="The improved prompt")
    changes_made: List[str] = Field(description="List of changes made")
    improvement_percentage: float = Field(ge=0, le=100)
    preserved_intent: bool = Field(description="Whether original intent was preserved")
    suggestions: List[PromptSuggestion] = Field(default_factory=list)
    before_after_comparison: Optional[str] = None


class TranslationAlternative(BaseModel):
    """Alternative translation option"""
    text: str
    formality: str = Field(default="neutral", description="formal, neutral, informal")
    context: str = Field(default="", description="When to use this alternative")


class TranslationResult(BaseModel):
    """Translation result with quality metrics"""
    source_language: str
    target_language: str
    original_text: str
    translated_text: str
    confidence: float = Field(ge=0, le=1)
    alternative_translations: List[str] = Field(default_factory=list)
    cultural_notes: Optional[str] = None
    formality_level: str = Field(default="neutral", description="formal, neutral, informal")
    back_translation: Optional[str] = Field(default=None, description="Translation back to source language")
    terminology: List[Dict[str, str]] = Field(default_factory=list, description="Key term translations")


class SafetyCategory(str, Enum):
    """Safety check categories"""
    INJECTION = "injection"
    PII = "pii"
    HARMFUL_CONTENT = "harmful_content"
    BIAS = "bias"
    COPYRIGHT = "copyright"
    JAILBREAK = "jailbreak"
    MANIPULATION = "manipulation"
    MISINFORMATION = "misinformation"


class SafetySeverity(str, Enum):
    """Severity levels for safety issues"""
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    CRITICAL = "critical"


class SafetyIssue(BaseModel):
    """Individual safety issue"""
    category: SafetyCategory
    severity: str = Field(default="medium", description="low, medium, high, critical")
    description: str
    location: Optional[str] = None
    recommendation: str
    confidence: float = Field(ge=0, le=1, default=0.8)


class SafetyCheck(BaseModel):
    """Safety analysis result"""
    is_safe: bool
    overall_risk_level: str = Field(default="low", description="low, medium, high, critical")
    issues: List[SafetyIssue] = Field(default_factory=list)
    sanitized_prompt: Optional[str] = None
    confidence: float = Field(ge=0, le=1)
    categories_checked: List[SafetyCategory] = Field(default_factory=list)
    recommendations: List[str] = Field(default_factory=list)


class CostBreakdown(BaseModel):
    """Detailed cost breakdown"""
    input_tokens: int
    output_tokens: int
    input_cost_usd: float
    output_cost_usd: float
    total_cost_usd: float


class CostPrediction(BaseModel):
    """Pre-send cost prediction for LLM calls"""
    estimated_input_tokens: int
    estimated_output_tokens: int
    estimated_cost_usd: float
    model: str
    provider: str
    confidence: float = Field(ge=0, le=1)
    breakdown: Dict[str, float] = Field(default_factory=dict)
    alternative_models: List[Dict[str, Any]] = Field(default_factory=list, description="Cheaper alternatives")
    optimization_suggestions: List[str] = Field(default_factory=list)


# Chain Models

class ChainStep(BaseModel):
    """Single step in a prompt chain"""
    step_number: int
    name: str = Field(default="")
    prompt: str
    expected_output_type: str
    dependencies: List[int] = Field(default_factory=list)
    condition: Optional[str] = None
    model: Optional[str] = None
    temperature: float = 0.7


class PromptChain(BaseModel):
    """A chain of prompts for complex tasks"""
    name: str
    description: str
    steps: List[ChainStep]
    variables: Dict[str, Any] = Field(default_factory=dict)
    execution_mode: str = Field(default="sequential", description="sequential, parallel, conditional")
    estimated_cost: Optional[float] = None
    estimated_time_seconds: Optional[int] = None


# Embedding Models

class EmbeddingInput(BaseModel):
    """Input for embedding generation"""
    text: str
    id: Optional[str] = None
    metadata: Dict[str, Any] = Field(default_factory=dict)


class EmbeddingOutput(BaseModel):
    """Output from embedding generation"""
    id: str
    embedding: List[float]
    metadata: Dict[str, Any] = Field(default_factory=dict)


class SemanticMatch(BaseModel):
    """Result of semantic similarity search"""
    id: str
    text: str
    score: float
    metadata: Dict[str, Any] = Field(default_factory=dict)


# Comparison Models

class PromptComparison(BaseModel):
    """Comparison between two prompts"""
    prompt_a: str
    prompt_b: str
    better_prompt: str = Field(description="a or b")
    comparison_reasoning: str
    clarity_winner: str
    specificity_winner: str
    effectiveness_winner: str
    differences: List[str]
    recommendations: List[str]


class ABTestResult(BaseModel):
    """Result of A/B testing prompts"""
    prompt_a: str
    prompt_b: str
    winner: str
    confidence: float
    sample_size: int
    metrics: Dict[str, Dict[str, float]] = Field(default_factory=dict, description="Metrics for each prompt")
    statistical_significance: bool
    recommendations: List[str]


# Template Models

class TemplateVariableModel(BaseModel):
    """Variable in a prompt template"""
    name: str
    type: str = Field(default="string", description="string, number, boolean, list, object")
    description: Optional[str] = None
    required: bool = True
    default: Optional[Any] = None
    validation: Optional[str] = None


class PromptTemplateDefinition(BaseModel):
    """Definition of a prompt template"""
    id: str
    name: str
    description: str
    template: str
    variables: List[TemplateVariableModel]
    category: str
    tags: List[str] = Field(default_factory=list)
    examples: List[Dict[str, Any]] = Field(default_factory=list)
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None


# Intent Detection Models

class Intent(BaseModel):
    """Detected intent from user input"""
    name: str
    confidence: float = Field(ge=0, le=1)
    entities: Dict[str, Any] = Field(default_factory=dict)
    parameters: Dict[str, Any] = Field(default_factory=dict)


class IntentDetectionResult(BaseModel):
    """Result of intent detection"""
    primary_intent: Intent
    secondary_intents: List[Intent] = Field(default_factory=list)
    sentiment: str = Field(default="neutral", description="positive, negative, neutral")
    urgency: str = Field(default="normal", description="low, normal, high, critical")
    suggested_response_type: str = Field(default="text")


# Evaluation Models

class OutputEvaluation(BaseModel):
    """Evaluation of LLM output"""
    relevance_score: float = Field(ge=0, le=10)
    accuracy_score: float = Field(ge=0, le=10)
    completeness_score: float = Field(ge=0, le=10)
    coherence_score: float = Field(ge=0, le=10)
    overall_score: float = Field(ge=0, le=10)
    issues: List[str] = Field(default_factory=list)
    improvements: List[str] = Field(default_factory=list)
    factual_errors: List[str] = Field(default_factory=list)


class ConversationSummary(BaseModel):
    """Summary of a conversation"""
    main_topics: List[str]
    key_points: List[str]
    action_items: List[str]
    sentiment_trajectory: str
    conclusion: Optional[str] = None
    follow_up_needed: bool = False
    follow_up_suggestions: List[str] = Field(default_factory=list)


# Meta-Prompting Models

class MetaPromptSuggestion(BaseModel):
    """Suggestion from meta-prompting"""
    technique: str = Field(description="chain-of-thought, few-shot, role-play, etc.")
    description: str
    example_prompt: str
    expected_improvement: str
    confidence: float = Field(ge=0, le=1)


class MetaPromptResult(BaseModel):
    """Result of meta-prompting analysis"""
    original_prompt: str
    improved_prompt: str
    techniques_applied: List[str]
    suggestions: List[MetaPromptSuggestion]
    improvement_rationale: str
    expected_quality_improvement: float = Field(ge=0, le=100)
