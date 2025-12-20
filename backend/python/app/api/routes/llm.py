"""
LLM API endpoints

Provides REST API for LLM operations including generation,
analysis, refinement, translation, and safety checks.
"""

from typing import Optional, List
from fastapi import APIRouter, HTTPException, Depends
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from ...services.llm_service import LLMService
from ...services.instructor_service import InstructorService
from ...models.llm_models import (
    LLMRequest,
    LLMResponse,
    LLMProvider,
    Message,
    MessageRole,
    PromptAnalysis,
    PromptRefinement,
    TranslationResult,
    SafetyCheck,
    CostPrediction,
)

router = APIRouter(prefix="/llm", tags=["LLM"])

# Service instances
llm_service = LLMService()
instructor_service = InstructorService()


# Request/Response models for API

class GenerateRequest(BaseModel):
    """Request for text generation"""
    messages: List[dict] = Field(description="List of messages with role and content")
    model: Optional[str] = None
    provider: Optional[str] = None
    temperature: float = Field(default=0.7, ge=0, le=2)
    max_tokens: Optional[int] = None
    stream: bool = False


class AnalyzeRequest(BaseModel):
    """Request for prompt analysis"""
    prompt: str
    context: Optional[str] = None


class RefineRequest(BaseModel):
    """Request for prompt refinement"""
    prompt: str
    goals: Optional[List[str]] = None


class TranslateRequest(BaseModel):
    """Request for translation"""
    text: str
    source_language: str
    target_language: str


class SafetyRequest(BaseModel):
    """Request for safety check"""
    prompt: str


class CostRequest(BaseModel):
    """Request for cost prediction"""
    prompt: str
    expected_output_length: str = "medium"
    model: Optional[str] = None


@router.post("/generate", response_model=LLMResponse)
async def generate(request: GenerateRequest):
    """
    Generate text using LLM

    Args:
        request: Generation request with messages and settings

    Returns:
        LLM response with content and usage metrics
    """
    try:
        messages = [
            Message(
                role=MessageRole(msg["role"]),
                content=msg["content"]
            )
            for msg in request.messages
        ]

        llm_request = LLMRequest(
            messages=messages,
            model=request.model,
            provider=LLMProvider(request.provider) if request.provider else None,
            temperature=request.temperature,
            max_tokens=request.max_tokens,
            stream=request.stream,
        )

        if request.stream:
            return StreamingResponse(
                llm_service.stream(llm_request),
                media_type="text/event-stream",
            )

        return await llm_service.generate(llm_request)

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/analyze", response_model=PromptAnalysis)
async def analyze_prompt(request: AnalyzeRequest):
    """
    Analyze a prompt for quality metrics

    Returns structured analysis with scores and suggestions.
    """
    try:
        return await instructor_service.analyze_prompt(
            prompt=request.prompt,
            context=request.context,
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/refine", response_model=PromptRefinement)
async def refine_prompt(request: RefineRequest):
    """
    Refine and improve a prompt

    Returns improved version with change explanations.
    """
    try:
        return await instructor_service.refine_prompt(
            prompt=request.prompt,
            goals=request.goals,
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/translate", response_model=TranslationResult)
async def translate(request: TranslateRequest):
    """
    Translate a prompt between languages

    Returns translated text with quality metrics.
    """
    try:
        return await instructor_service.translate_prompt(
            text=request.text,
            source_language=request.source_language,
            target_language=request.target_language,
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/safety", response_model=SafetyCheck)
async def check_safety(request: SafetyRequest):
    """
    Check a prompt for safety issues

    Returns safety analysis with issues and recommendations.
    """
    try:
        return await instructor_service.check_safety(
            prompt=request.prompt,
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/cost", response_model=CostPrediction)
async def predict_cost(request: CostRequest):
    """
    Predict the cost of running a prompt

    Returns cost estimates with token breakdown.
    """
    try:
        return await instructor_service.predict_cost(
            prompt=request.prompt,
            expected_output_length=request.expected_output_length,
            model=request.model,
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
