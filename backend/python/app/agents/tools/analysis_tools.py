"""
Analysis tools for agents.

Provides prompt analysis and refinement capabilities
by integrating with the existing InstructorService.
"""

from typing import Any, Optional

from loguru import logger
from pydantic import BaseModel, Field


class PromptAnalysisResult(BaseModel):
    """Result of prompt analysis."""
    clarity_score: float = Field(..., ge=0.0, le=1.0)
    specificity_score: float = Field(..., ge=0.0, le=1.0)
    effectiveness_score: float = Field(..., ge=0.0, le=1.0)
    overall_score: float = Field(..., ge=0.0, le=1.0)
    strengths: list[str] = Field(default_factory=list)
    weaknesses: list[str] = Field(default_factory=list)
    suggestions: list[str] = Field(default_factory=list)


class PromptRefinementResult(BaseModel):
    """Result of prompt refinement."""
    original_prompt: str
    refined_prompt: str
    changes_made: list[str] = Field(default_factory=list)
    improvement_score: float = Field(..., ge=0.0, le=1.0)
    reasoning: str


async def analyze_prompt_tool(
    prompt: str,
    context: Optional[str] = None,
    instructor_service: Any = None,
) -> PromptAnalysisResult:
    """
    Analyze a prompt for clarity, specificity, and effectiveness.

    Args:
        prompt: The prompt to analyze
        context: Additional context about the prompt's purpose
        instructor_service: InstructorService instance (injected)

    Returns:
        PromptAnalysisResult with scores and suggestions
    """
    logger.info(f"Analyzing prompt: {prompt[:100]}...")

    if instructor_service is not None:
        try:
            # Use the existing InstructorService
            result = await instructor_service.analyze_prompt(prompt)
            return PromptAnalysisResult(
                clarity_score=result.clarity_score / 10.0,
                specificity_score=result.specificity_score / 10.0,
                effectiveness_score=result.effectiveness_score / 10.0,
                overall_score=result.overall_score / 10.0,
                strengths=result.strengths,
                weaknesses=result.weaknesses,
                suggestions=result.suggestions,
            )
        except Exception as e:
            logger.error(f"Error using InstructorService: {e}")

    # Fallback: basic heuristic analysis
    word_count = len(prompt.split())
    has_question = "?" in prompt
    has_context = context is not None

    clarity = min(1.0, word_count / 50) if word_count > 10 else 0.5
    specificity = 0.7 if has_context else 0.5
    effectiveness = (clarity + specificity) / 2

    return PromptAnalysisResult(
        clarity_score=clarity,
        specificity_score=specificity,
        effectiveness_score=effectiveness,
        overall_score=(clarity + specificity + effectiveness) / 3,
        strengths=["Clear structure"] if clarity > 0.6 else [],
        weaknesses=["Could be more specific"] if specificity < 0.7 else [],
        suggestions=["Add more context", "Be more specific about expected output"],
    )


async def refine_prompt_tool(
    prompt: str,
    target_task: Optional[str] = None,
    style: str = "concise",
    instructor_service: Any = None,
) -> PromptRefinementResult:
    """
    Refine a prompt to improve its effectiveness.

    Args:
        prompt: The prompt to refine
        target_task: The intended task for the prompt
        style: Refinement style (concise, detailed, creative)
        instructor_service: InstructorService instance (injected)

    Returns:
        PromptRefinementResult with refined prompt and changes
    """
    logger.info(f"Refining prompt: {prompt[:100]}...")

    if instructor_service is not None:
        try:
            # Use the existing InstructorService
            result = await instructor_service.refine_prompt(prompt)
            return PromptRefinementResult(
                original_prompt=prompt,
                refined_prompt=result.refined_prompt,
                changes_made=result.changes_made,
                improvement_score=result.improvement_score / 10.0,
                reasoning=result.reasoning,
            )
        except Exception as e:
            logger.error(f"Error using InstructorService: {e}")

    # Fallback: basic refinement
    refined = prompt.strip()
    changes = []

    # Add task context if missing
    if target_task and target_task.lower() not in prompt.lower():
        refined = f"Task: {target_task}\n\n{refined}"
        changes.append("Added task context")

    # Add structure if missing
    if ":" not in refined and len(refined) > 50:
        refined = f"Instructions:\n{refined}\n\nExpected Output:"
        changes.append("Added structure with sections")

    return PromptRefinementResult(
        original_prompt=prompt,
        refined_prompt=refined,
        changes_made=changes if changes else ["No changes needed"],
        improvement_score=0.7 if changes else 0.9,
        reasoning="Applied basic refinement heuristics" if changes else "Prompt is already well-structured",
    )
