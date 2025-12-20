"""
Instructor Service for structured LLM outputs

Uses Instructor library for Pydantic-validated responses from LLMs.
"""

import time
from typing import Type, TypeVar, Optional, List, Dict, Any
import instructor
from openai import AsyncOpenAI
from anthropic import AsyncAnthropic
from pydantic import BaseModel
from loguru import logger

from ..core.config import settings
from ..models.llm_models import (
    LLMProvider,
    PromptAnalysis,
    PromptRefinement,
    PromptSuggestion,
    TranslationResult,
    SafetyCheck,
    CostPrediction,
    Message,
    MessageRole,
)

T = TypeVar("T", bound=BaseModel)


class InstructorService:
    """
    Service for extracting structured data from LLMs using Instructor

    Instructor patches the OpenAI/Anthropic clients to return Pydantic models
    instead of raw text, with automatic validation and retry logic.
    """

    def __init__(self):
        self.openai_client = None
        self.anthropic_client = None
        self._initialize_clients()

    def _initialize_clients(self):
        """Initialize instructor-patched clients"""
        if settings.openai_api_key:
            self.openai_client = instructor.from_openai(
                AsyncOpenAI(api_key=settings.openai_api_key)
            )

        if settings.anthropic_api_key:
            self.anthropic_client = instructor.from_anthropic(
                AsyncAnthropic(api_key=settings.anthropic_api_key)
            )

    async def extract(
        self,
        response_model: Type[T],
        messages: List[Message],
        provider: Optional[LLMProvider] = None,
        model: Optional[str] = None,
        temperature: float = 0.7,
        max_retries: int = 3,
    ) -> T:
        """
        Extract structured data from LLM response

        Args:
            response_model: Pydantic model class to extract
            messages: Conversation messages
            provider: LLM provider to use
            model: Model to use
            temperature: Sampling temperature
            max_retries: Number of retries on validation failure

        Returns:
            Instance of response_model with extracted data
        """
        provider = provider or LLMProvider(settings.default_llm_provider)
        model = model or settings.default_model

        # Convert messages to dict format
        formatted_messages = [
            {"role": msg.role.value, "content": msg.content}
            for msg in messages
        ]

        try:
            if provider == LLMProvider.OPENAI:
                return await self._extract_openai(
                    response_model,
                    formatted_messages,
                    model,
                    temperature,
                    max_retries,
                )
            elif provider == LLMProvider.ANTHROPIC:
                return await self._extract_anthropic(
                    response_model,
                    formatted_messages,
                    model,
                    temperature,
                    max_retries,
                )
            else:
                raise ValueError(f"Unsupported provider: {provider}")

        except Exception as e:
            logger.error(f"Instructor extraction failed: {e}")
            raise

    async def _extract_openai(
        self,
        response_model: Type[T],
        messages: List[dict],
        model: str,
        temperature: float,
        max_retries: int,
    ) -> T:
        """Extract using OpenAI with Instructor"""
        if not self.openai_client:
            raise ValueError("OpenAI client not initialized")

        return await self.openai_client.chat.completions.create(
            model=model,
            response_model=response_model,
            messages=messages,
            temperature=temperature,
            max_retries=max_retries,
        )

    async def _extract_anthropic(
        self,
        response_model: Type[T],
        messages: List[dict],
        model: str,
        temperature: float,
        max_retries: int,
    ) -> T:
        """Extract using Anthropic with Instructor"""
        if not self.anthropic_client:
            raise ValueError("Anthropic client not initialized")

        # Extract system message for Anthropic
        system_content = None
        filtered_messages = []
        for msg in messages:
            if msg["role"] == "system":
                system_content = msg["content"]
            else:
                filtered_messages.append(msg)

        return await self.anthropic_client.messages.create(
            model=model,
            response_model=response_model,
            messages=filtered_messages,
            system=system_content or "",
            temperature=temperature,
            max_tokens=4096,
            max_retries=max_retries,
        )

    async def analyze_prompt(
        self,
        prompt: str,
        context: Optional[str] = None,
    ) -> PromptAnalysis:
        """
        Analyze a prompt for quality metrics

        Args:
            prompt: The prompt to analyze
            context: Optional context about the prompt's purpose

        Returns:
            PromptAnalysis with scores and suggestions
        """
        system_message = Message(
            role=MessageRole.SYSTEM,
            content="""You are an expert prompt engineer. Analyze the given prompt
for clarity, specificity, and effectiveness. Provide actionable feedback."""
        )

        user_content = f"Analyze this prompt:\n\n{prompt}"
        if context:
            user_content += f"\n\nContext: {context}"

        user_message = Message(role=MessageRole.USER, content=user_content)

        return await self.extract(
            response_model=PromptAnalysis,
            messages=[system_message, user_message],
            temperature=0.3,
        )

    async def refine_prompt(
        self,
        prompt: str,
        goals: Optional[List[str]] = None,
    ) -> PromptRefinement:
        """
        Refine and improve a prompt

        Args:
            prompt: The prompt to refine
            goals: Optional list of improvement goals

        Returns:
            PromptRefinement with improved version
        """
        system_message = Message(
            role=MessageRole.SYSTEM,
            content="""You are an expert prompt engineer. Improve the given prompt
while preserving its original intent. Focus on clarity, specificity, and effectiveness."""
        )

        user_content = f"Improve this prompt:\n\n{prompt}"
        if goals:
            user_content += f"\n\nImprovement goals:\n" + "\n".join(f"- {g}" for g in goals)

        user_message = Message(role=MessageRole.USER, content=user_content)

        return await self.extract(
            response_model=PromptRefinement,
            messages=[system_message, user_message],
            temperature=0.5,
        )

    async def translate_prompt(
        self,
        text: str,
        source_language: str,
        target_language: str,
    ) -> TranslationResult:
        """
        Translate a prompt between languages

        Args:
            text: Text to translate
            source_language: Source language
            target_language: Target language

        Returns:
            TranslationResult with translated text
        """
        system_message = Message(
            role=MessageRole.SYSTEM,
            content=f"""You are an expert translator. Translate the text from
{source_language} to {target_language}. Preserve the meaning and tone."""
        )

        user_message = Message(
            role=MessageRole.USER,
            content=f"Translate this text:\n\n{text}"
        )

        return await self.extract(
            response_model=TranslationResult,
            messages=[system_message, user_message],
            temperature=0.3,
        )

    async def check_safety(
        self,
        prompt: str,
    ) -> SafetyCheck:
        """
        Check a prompt for safety issues

        Args:
            prompt: The prompt to check

        Returns:
            SafetyCheck with safety analysis
        """
        system_message = Message(
            role=MessageRole.SYSTEM,
            content="""You are a safety expert. Analyze the prompt for potential
safety issues including injection attacks, PII exposure, harmful content, bias,
and copyright concerns. Be thorough but balanced."""
        )

        user_message = Message(
            role=MessageRole.USER,
            content=f"Check this prompt for safety issues:\n\n{prompt}"
        )

        return await self.extract(
            response_model=SafetyCheck,
            messages=[system_message, user_message],
            temperature=0.2,
        )

    async def predict_cost(
        self,
        prompt: str,
        expected_output_length: str = "medium",
        model: Optional[str] = None,
    ) -> CostPrediction:
        """
        Predict the cost of running a prompt

        Args:
            prompt: The prompt to analyze
            expected_output_length: Expected output length (short/medium/long)
            model: Target model for cost calculation

        Returns:
            CostPrediction with cost estimates
        """
        model = model or settings.default_model

        system_message = Message(
            role=MessageRole.SYSTEM,
            content=f"""You are a cost analyst. Estimate the token usage and cost
for running this prompt on {model}. Consider the prompt complexity and expected
output length ({expected_output_length})."""
        )

        user_message = Message(
            role=MessageRole.USER,
            content=f"Predict cost for this prompt:\n\n{prompt}"
        )

        return await self.extract(
            response_model=CostPrediction,
            messages=[system_message, user_message],
            temperature=0.2,
        )
