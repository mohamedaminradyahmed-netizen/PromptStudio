"""
LLM Service using Mirascope for multi-provider support

Enhanced version with support for OpenAI, Anthropic, Google (Gemini), and Azure.
"""

import time
from typing import Optional, List, AsyncGenerator, Dict, Any
from mirascope.core import openai, anthropic, Messages
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


# Model pricing per 1M tokens (input/output)
MODEL_PRICING = {
    # OpenAI
    "gpt-4-turbo-preview": {"input": 10.0, "output": 30.0},
    "gpt-4-turbo": {"input": 10.0, "output": 30.0},
    "gpt-4o": {"input": 5.0, "output": 15.0},
    "gpt-4o-mini": {"input": 0.15, "output": 0.6},
    "gpt-4": {"input": 30.0, "output": 60.0},
    "gpt-3.5-turbo": {"input": 0.5, "output": 1.5},
    # Anthropic
    "claude-3-opus-20240229": {"input": 15.0, "output": 75.0},
    "claude-3-sonnet-20240229": {"input": 3.0, "output": 15.0},
    "claude-3-haiku-20240307": {"input": 0.25, "output": 1.25},
    "claude-3-5-sonnet-20241022": {"input": 3.0, "output": 15.0},
    # Google
    "gemini-1.5-pro": {"input": 3.5, "output": 10.5},
    "gemini-1.5-flash": {"input": 0.075, "output": 0.3},
    "gemini-pro": {"input": 0.5, "output": 1.5},
    # Azure (same as OpenAI pricing)
    "gpt-4-azure": {"input": 30.0, "output": 60.0},
}


class LLMService:
    """
    Multi-provider LLM service using Mirascope

    Mirascope provides a unified interface for multiple LLM providers
    with type-safe prompts and structured outputs.

    Supported providers:
    - OpenAI (GPT-4, GPT-3.5)
    - Anthropic (Claude 3)
    - Google (Gemini)
    - Azure OpenAI
    """

    def __init__(self):
        self.default_provider = LLMProvider(settings.default_llm_provider)
        self.default_model = settings.default_model
        self._clients: Dict[str, Any] = {}

    def _convert_messages(self, messages: List[Message]) -> List[dict]:
        """Convert internal message format to provider format"""
        converted = []
        for msg in messages:
            converted.append({
                "role": msg.role.value,
                "content": msg.content,
            })
        return converted

    def _get_openai_client(self):
        """Get or create OpenAI client"""
        if "openai" not in self._clients:
            from openai import AsyncOpenAI
            self._clients["openai"] = AsyncOpenAI(api_key=settings.openai_api_key)
        return self._clients["openai"]

    def _get_anthropic_client(self):
        """Get or create Anthropic client"""
        if "anthropic" not in self._clients:
            from anthropic import AsyncAnthropic
            self._clients["anthropic"] = AsyncAnthropic(api_key=settings.anthropic_api_key)
        return self._clients["anthropic"]

    def _get_google_client(self):
        """Get or create Google Generative AI client"""
        if "google" not in self._clients:
            try:
                import google.generativeai as genai
                genai.configure(api_key=settings.google_api_key)
                self._clients["google"] = genai
            except ImportError:
                raise ValueError("google-generativeai not installed. Run: pip install google-generativeai")
        return self._clients["google"]

    def _get_azure_client(self):
        """Get or create Azure OpenAI client"""
        if "azure" not in self._clients:
            from openai import AsyncAzureOpenAI
            self._clients["azure"] = AsyncAzureOpenAI(
                api_key=settings.azure_api_key,
                api_version=settings.azure_api_version,
                azure_endpoint=settings.azure_endpoint,
            )
        return self._clients["azure"]

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
            elif provider == LLMProvider.GOOGLE:
                response = await self._generate_google(messages, model, request)
            elif provider == LLMProvider.AZURE:
                response = await self._generate_azure(messages, model, request)
            else:
                raise ValueError(f"Unsupported provider: {provider}")

            latency_ms = (time.time() - start_time) * 1000

            # Calculate cost
            cost = self._calculate_cost(
                model,
                response["usage"]["prompt_tokens"],
                response["usage"]["completion_tokens"],
            )

            return LLMResponse(
                content=response["content"],
                model=model,
                provider=provider,
                usage={**response["usage"], "estimated_cost_usd": cost},
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
        client = self._get_openai_client()

        kwargs = {
            "model": model,
            "messages": messages,
            "temperature": request.temperature,
        }
        if request.max_tokens:
            kwargs["max_tokens"] = request.max_tokens
        if request.response_format:
            kwargs["response_format"] = request.response_format

        response = await client.chat.completions.create(**kwargs)

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
        client = self._get_anthropic_client()

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

    async def _generate_google(
        self,
        messages: List[dict],
        model: str,
        request: LLMRequest
    ) -> dict:
        """Generate using Google Gemini"""
        genai = self._get_google_client()

        # Convert messages to Gemini format
        gemini_messages = []
        system_instruction = None

        for msg in messages:
            if msg["role"] == "system":
                system_instruction = msg["content"]
            elif msg["role"] == "user":
                gemini_messages.append({"role": "user", "parts": [msg["content"]]})
            elif msg["role"] == "assistant":
                gemini_messages.append({"role": "model", "parts": [msg["content"]]})

        # Create model with configuration
        generation_config = {
            "temperature": request.temperature,
        }
        if request.max_tokens:
            generation_config["max_output_tokens"] = request.max_tokens

        gemini_model = genai.GenerativeModel(
            model_name=model,
            generation_config=generation_config,
            system_instruction=system_instruction,
        )

        # Generate response
        chat = gemini_model.start_chat(history=gemini_messages[:-1] if len(gemini_messages) > 1 else [])
        last_message = gemini_messages[-1]["parts"][0] if gemini_messages else ""
        response = await chat.send_message_async(last_message)

        # Estimate tokens (Gemini doesn't always provide usage)
        prompt_text = " ".join([m["parts"][0] for m in gemini_messages])
        estimated_prompt_tokens = len(prompt_text.split()) * 1.3
        estimated_completion_tokens = len(response.text.split()) * 1.3

        return {
            "content": response.text,
            "usage": {
                "prompt_tokens": int(estimated_prompt_tokens),
                "completion_tokens": int(estimated_completion_tokens),
                "total_tokens": int(estimated_prompt_tokens + estimated_completion_tokens),
            },
            "finish_reason": "stop",
        }

    async def _generate_azure(
        self,
        messages: List[dict],
        model: str,
        request: LLMRequest
    ) -> dict:
        """Generate using Azure OpenAI"""
        client = self._get_azure_client()

        # Azure uses deployment names instead of model names
        deployment = settings.azure_deployment or model

        kwargs = {
            "model": deployment,
            "messages": messages,
            "temperature": request.temperature,
        }
        if request.max_tokens:
            kwargs["max_tokens"] = request.max_tokens
        if request.response_format:
            kwargs["response_format"] = request.response_format

        response = await client.chat.completions.create(**kwargs)

        return {
            "content": response.choices[0].message.content,
            "usage": {
                "prompt_tokens": response.usage.prompt_tokens,
                "completion_tokens": response.usage.completion_tokens,
                "total_tokens": response.usage.total_tokens,
            },
            "finish_reason": response.choices[0].finish_reason,
        }

    def _calculate_cost(
        self,
        model: str,
        prompt_tokens: int,
        completion_tokens: int,
    ) -> float:
        """Calculate estimated cost for token usage"""
        pricing = MODEL_PRICING.get(model, {"input": 1.0, "output": 2.0})
        input_cost = (prompt_tokens / 1_000_000) * pricing["input"]
        output_cost = (completion_tokens / 1_000_000) * pricing["output"]
        return round(input_cost + output_cost, 6)

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
        elif provider == LLMProvider.GOOGLE:
            async for chunk in self._stream_google(messages, model, request):
                yield chunk
        elif provider == LLMProvider.AZURE:
            async for chunk in self._stream_azure(messages, model, request):
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
        client = self._get_openai_client()

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
        client = self._get_anthropic_client()

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

    async def _stream_google(
        self,
        messages: List[dict],
        model: str,
        request: LLMRequest
    ) -> AsyncGenerator[str, None]:
        """Stream from Google Gemini"""
        genai = self._get_google_client()

        gemini_messages = []
        system_instruction = None

        for msg in messages:
            if msg["role"] == "system":
                system_instruction = msg["content"]
            elif msg["role"] == "user":
                gemini_messages.append({"role": "user", "parts": [msg["content"]]})
            elif msg["role"] == "assistant":
                gemini_messages.append({"role": "model", "parts": [msg["content"]]})

        generation_config = {
            "temperature": request.temperature,
        }
        if request.max_tokens:
            generation_config["max_output_tokens"] = request.max_tokens

        gemini_model = genai.GenerativeModel(
            model_name=model,
            generation_config=generation_config,
            system_instruction=system_instruction,
        )

        chat = gemini_model.start_chat(history=gemini_messages[:-1] if len(gemini_messages) > 1 else [])
        last_message = gemini_messages[-1]["parts"][0] if gemini_messages else ""

        response = await chat.send_message_async(last_message, stream=True)
        async for chunk in response:
            if chunk.text:
                yield chunk.text

    async def _stream_azure(
        self,
        messages: List[dict],
        model: str,
        request: LLMRequest
    ) -> AsyncGenerator[str, None]:
        """Stream from Azure OpenAI"""
        client = self._get_azure_client()
        deployment = settings.azure_deployment or model

        stream = await client.chat.completions.create(
            model=deployment,
            messages=messages,
            temperature=request.temperature,
            max_tokens=request.max_tokens,
            stream=True,
        )

        async for chunk in stream:
            if chunk.choices[0].delta.content:
                yield chunk.choices[0].delta.content

    async def count_tokens(
        self,
        text: str,
        model: Optional[str] = None,
    ) -> int:
        """
        Count tokens in text for a specific model

        Args:
            text: Text to count tokens for
            model: Model to use for tokenization

        Returns:
            Token count
        """
        try:
            import tiktoken
            model = model or self.default_model

            # Get encoding for model
            try:
                encoding = tiktoken.encoding_for_model(model)
            except KeyError:
                encoding = tiktoken.get_encoding("cl100k_base")

            return len(encoding.encode(text))

        except ImportError:
            # Fallback: rough estimate
            return len(text.split()) * 4 // 3

    def get_model_info(self, model: str) -> Dict[str, Any]:
        """Get information about a model"""
        pricing = MODEL_PRICING.get(model, {"input": 0, "output": 0})

        return {
            "model": model,
            "pricing": pricing,
            "supported_features": self._get_model_features(model),
        }

    def _get_model_features(self, model: str) -> List[str]:
        """Get supported features for a model"""
        features = ["text-generation", "streaming"]

        if "gpt-4" in model or "claude-3" in model:
            features.extend(["vision", "function-calling", "json-mode"])
        elif "gemini" in model:
            features.extend(["vision", "function-calling"])

        return features

    def list_models(self, provider: Optional[LLMProvider] = None) -> List[str]:
        """List available models for a provider"""
        models = {
            LLMProvider.OPENAI: [
                "gpt-4-turbo-preview",
                "gpt-4-turbo",
                "gpt-4o",
                "gpt-4o-mini",
                "gpt-4",
                "gpt-3.5-turbo",
            ],
            LLMProvider.ANTHROPIC: [
                "claude-3-opus-20240229",
                "claude-3-sonnet-20240229",
                "claude-3-haiku-20240307",
                "claude-3-5-sonnet-20241022",
            ],
            LLMProvider.GOOGLE: [
                "gemini-1.5-pro",
                "gemini-1.5-flash",
                "gemini-pro",
            ],
            LLMProvider.AZURE: [
                "gpt-4-azure",
                "gpt-35-turbo",
            ],
        }

        if provider:
            return models.get(provider, [])

        # Return all models
        all_models = []
        for provider_models in models.values():
            all_models.extend(provider_models)
        return all_models
