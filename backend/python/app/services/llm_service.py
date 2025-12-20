"""
LLM Service using Mirascope for multi-provider support
"""

import time
from typing import Optional, List, AsyncGenerator, Type
from mirascope.core import openai, anthropic, Messages
from mirascope.core.base import BaseCallResponse
from pydantic import BaseModel
from loguru import logger

from ..core.config import settings
from ..models.llm_models import (
    LLMProvider,
    LLMRequest,
    LLMResponse,
    Message,
    MessageRole,
)


class LLMService:
    """
    Multi-provider LLM service using Mirascope

    Mirascope provides a unified interface for multiple LLM providers
    with type-safe prompts and structured outputs.
    """

    def __init__(self):
        self.default_provider = LLMProvider(settings.default_llm_provider)
        self.default_model = settings.default_model

    def _convert_messages(self, messages: List[Message]) -> Messages:
        """Convert internal message format to Mirascope format"""
        mirascope_messages = []
        for msg in messages:
            if msg.role == MessageRole.SYSTEM:
                mirascope_messages.append({"role": "system", "content": msg.content})
            elif msg.role == MessageRole.USER:
                mirascope_messages.append({"role": "user", "content": msg.content})
            elif msg.role == MessageRole.ASSISTANT:
                mirascope_messages.append({"role": "assistant", "content": msg.content})
        return mirascope_messages

    @openai.call(model="gpt-4-turbo-preview")
    def _call_openai(self, messages: List[dict]) -> openai.OpenAIDynamicConfig:
        """OpenAI call with Mirascope"""
        return {
            "messages": messages,
        }

    @anthropic.call(model="claude-3-opus-20240229")
    def _call_anthropic(self, messages: List[dict]) -> anthropic.AnthropicDynamicConfig:
        """Anthropic call with Mirascope"""
        return {
            "messages": messages,
        }

    async def generate(self, request: LLMRequest) -> LLMResponse:
        """
        Generate a response from the LLM

        Args:
            request: LLM request with messages and configuration

        Returns:
            LLMResponse with content and usage metrics
        """
        provider = request.provider or self.default_provider
        model = request.model or self.default_model

        start_time = time.time()
        messages = self._convert_messages(request.messages)

        try:
            if provider == LLMProvider.OPENAI:
                response = await self._generate_openai(messages, model, request)
            elif provider == LLMProvider.ANTHROPIC:
                response = await self._generate_anthropic(messages, model, request)
            else:
                raise ValueError(f"Unsupported provider: {provider}")

            latency_ms = (time.time() - start_time) * 1000

            return LLMResponse(
                content=response["content"],
                model=model,
                provider=provider,
                usage=response["usage"],
                finish_reason=response["finish_reason"],
                latency_ms=latency_ms,
            )

        except Exception as e:
            logger.error(f"LLM generation failed: {e}")
            raise

    async def _generate_openai(
        self,
        messages: List[dict],
        model: str,
        request: LLMRequest
    ) -> dict:
        """Generate using OpenAI"""
        from openai import AsyncOpenAI

        client = AsyncOpenAI(api_key=settings.openai_api_key)

        response = await client.chat.completions.create(
            model=model,
            messages=messages,
            temperature=request.temperature,
            max_tokens=request.max_tokens,
        )

        return {
            "content": response.choices[0].message.content,
            "usage": {
                "prompt_tokens": response.usage.prompt_tokens,
                "completion_tokens": response.usage.completion_tokens,
                "total_tokens": response.usage.total_tokens,
            },
            "finish_reason": response.choices[0].finish_reason,
        }

    async def _generate_anthropic(
        self,
        messages: List[dict],
        model: str,
        request: LLMRequest
    ) -> dict:
        """Generate using Anthropic"""
        from anthropic import AsyncAnthropic

        client = AsyncAnthropic(api_key=settings.anthropic_api_key)

        # Extract system message if present
        system_content = None
        filtered_messages = []
        for msg in messages:
            if msg["role"] == "system":
                system_content = msg["content"]
            else:
                filtered_messages.append(msg)

        response = await client.messages.create(
            model=model,
            messages=filtered_messages,
            system=system_content or "",
            temperature=request.temperature,
            max_tokens=request.max_tokens or 4096,
        )

        return {
            "content": response.content[0].text,
            "usage": {
                "prompt_tokens": response.usage.input_tokens,
                "completion_tokens": response.usage.output_tokens,
                "total_tokens": response.usage.input_tokens + response.usage.output_tokens,
            },
            "finish_reason": response.stop_reason,
        }

    async def stream(
        self,
        request: LLMRequest
    ) -> AsyncGenerator[str, None]:
        """
        Stream a response from the LLM

        Args:
            request: LLM request with messages and configuration

        Yields:
            Chunks of the response content
        """
        provider = request.provider or self.default_provider
        model = request.model or self.default_model
        messages = self._convert_messages(request.messages)

        if provider == LLMProvider.OPENAI:
            async for chunk in self._stream_openai(messages, model, request):
                yield chunk
        elif provider == LLMProvider.ANTHROPIC:
            async for chunk in self._stream_anthropic(messages, model, request):
                yield chunk
        else:
            raise ValueError(f"Unsupported provider for streaming: {provider}")

    async def _stream_openai(
        self,
        messages: List[dict],
        model: str,
        request: LLMRequest
    ) -> AsyncGenerator[str, None]:
        """Stream from OpenAI"""
        from openai import AsyncOpenAI

        client = AsyncOpenAI(api_key=settings.openai_api_key)

        stream = await client.chat.completions.create(
            model=model,
            messages=messages,
            temperature=request.temperature,
            max_tokens=request.max_tokens,
            stream=True,
        )

        async for chunk in stream:
            if chunk.choices[0].delta.content:
                yield chunk.choices[0].delta.content

    async def _stream_anthropic(
        self,
        messages: List[dict],
        model: str,
        request: LLMRequest
    ) -> AsyncGenerator[str, None]:
        """Stream from Anthropic"""
        from anthropic import AsyncAnthropic

        client = AsyncAnthropic(api_key=settings.anthropic_api_key)

        system_content = None
        filtered_messages = []
        for msg in messages:
            if msg["role"] == "system":
                system_content = msg["content"]
            else:
                filtered_messages.append(msg)

        async with client.messages.stream(
            model=model,
            messages=filtered_messages,
            system=system_content or "",
            temperature=request.temperature,
            max_tokens=request.max_tokens or 4096,
        ) as stream:
            async for text in stream.text_stream:
                yield text
