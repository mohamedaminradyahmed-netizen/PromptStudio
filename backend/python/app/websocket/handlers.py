"""
WebSocket Handlers for LLM operations

Handles incoming WebSocket messages and routes them to appropriate services.
"""

from typing import Dict, Any
from loguru import logger

from .bridge import WebSocketBridge
from ..services.llm_service import LLMService
from ..services.instructor_service import InstructorService
from ..services.command_service import CommandService
from ..models.llm_models import (
    LLMRequest,
    Message,
    MessageRole,
    LLMProvider,
)
from ..models.command_models import CommandExecutionRequest


class WebSocketHandlers:
    """
    Registers and manages WebSocket message handlers

    Connects services to the WebSocket bridge for handling
    LLM requests from both Node.js and direct clients.
    """

    def __init__(
        self,
        bridge: WebSocketBridge,
        llm_service: LLMService,
        instructor_service: InstructorService,
        command_service: CommandService,
    ):
        self.bridge = bridge
        self.llm_service = llm_service
        self.instructor_service = instructor_service
        self.command_service = command_service

        self._register_handlers()

    def _register_handlers(self):
        """Register all message handlers with the bridge"""
        # LLM operations
        self.bridge.register_handler("generate", self.handle_generate)
        self.bridge.register_handler("stream", self.handle_stream)

        # Structured output operations
        self.bridge.register_handler("analyze_prompt", self.handle_analyze_prompt)
        self.bridge.register_handler("refine_prompt", self.handle_refine_prompt)
        self.bridge.register_handler("translate", self.handle_translate)
        self.bridge.register_handler("safety_check", self.handle_safety_check)
        self.bridge.register_handler("predict_cost", self.handle_predict_cost)

        # Command operations
        self.bridge.register_handler("execute_command", self.handle_execute_command)
        self.bridge.register_handler("list_commands", self.handle_list_commands)
        self.bridge.register_handler("search_commands", self.handle_search_commands)

    async def handle_generate(self, data: Dict[str, Any]) -> Dict[str, Any]:
        """Handle LLM generation request"""
        try:
            messages = [
                Message(
                    role=MessageRole(msg["role"]),
                    content=msg["content"]
                )
                for msg in data.get("messages", [])
            ]

            request = LLMRequest(
                messages=messages,
                model=data.get("model"),
                provider=LLMProvider(data["provider"]) if data.get("provider") else None,
                temperature=data.get("temperature", 0.7),
                max_tokens=data.get("max_tokens"),
            )

            response = await self.llm_service.generate(request)

            return {
                "content": response.content,
                "model": response.model,
                "provider": response.provider.value,
                "usage": response.usage,
                "finish_reason": response.finish_reason,
                "latency_ms": response.latency_ms,
            }

        except Exception as e:
            logger.error(f"Generate error: {e}")
            raise

    async def handle_stream(self, data: Dict[str, Any]) -> Dict[str, Any]:
        """Handle streaming LLM request"""
        try:
            messages = [
                Message(
                    role=MessageRole(msg["role"]),
                    content=msg["content"]
                )
                for msg in data.get("messages", [])
            ]

            request = LLMRequest(
                messages=messages,
                model=data.get("model"),
                provider=LLMProvider(data["provider"]) if data.get("provider") else None,
                temperature=data.get("temperature", 0.7),
                max_tokens=data.get("max_tokens"),
                stream=True,
            )

            # Get the request ID for streaming
            request_id = data.get("request_id")
            client_id = data.get("client_id")

            # Stream the response
            if request_id:
                # Stream to Node.js
                await self.bridge.stream_to_nodejs(
                    request_id,
                    self.llm_service.stream(request)
                )
            elif client_id:
                # Stream to direct client
                await self.bridge.stream_to_client(
                    client_id,
                    self.llm_service.stream(request)
                )

            return {"status": "streaming_started"}

        except Exception as e:
            logger.error(f"Stream error: {e}")
            raise

    async def handle_analyze_prompt(self, data: Dict[str, Any]) -> Dict[str, Any]:
        """Handle prompt analysis request"""
        try:
            result = await self.instructor_service.analyze_prompt(
                prompt=data["prompt"],
                context=data.get("context"),
            )
            return result.model_dump()
        except Exception as e:
            logger.error(f"Analyze prompt error: {e}")
            raise

    async def handle_refine_prompt(self, data: Dict[str, Any]) -> Dict[str, Any]:
        """Handle prompt refinement request"""
        try:
            result = await self.instructor_service.refine_prompt(
                prompt=data["prompt"],
                goals=data.get("goals"),
            )
            return result.model_dump()
        except Exception as e:
            logger.error(f"Refine prompt error: {e}")
            raise

    async def handle_translate(self, data: Dict[str, Any]) -> Dict[str, Any]:
        """Handle translation request"""
        try:
            result = await self.instructor_service.translate_prompt(
                text=data["text"],
                source_language=data["source_language"],
                target_language=data["target_language"],
            )
            return result.model_dump()
        except Exception as e:
            logger.error(f"Translate error: {e}")
            raise

    async def handle_safety_check(self, data: Dict[str, Any]) -> Dict[str, Any]:
        """Handle safety check request"""
        try:
            result = await self.instructor_service.check_safety(
                prompt=data["prompt"],
            )
            return result.model_dump()
        except Exception as e:
            logger.error(f"Safety check error: {e}")
            raise

    async def handle_predict_cost(self, data: Dict[str, Any]) -> Dict[str, Any]:
        """Handle cost prediction request"""
        try:
            result = await self.instructor_service.predict_cost(
                prompt=data["prompt"],
                expected_output_length=data.get("expected_output_length", "medium"),
                model=data.get("model"),
            )
            return result.model_dump()
        except Exception as e:
            logger.error(f"Predict cost error: {e}")
            raise

    async def handle_execute_command(self, data: Dict[str, Any]) -> Dict[str, Any]:
        """Handle command execution request"""
        try:
            request = CommandExecutionRequest(
                command_name=data["command"],
                parameters=data.get("parameters", {}),
                override_model=data.get("model"),
                override_temperature=data.get("temperature"),
                stream=data.get("stream", False),
            )

            result = await self.command_service.execute(request)

            return {
                "command_name": result.command_name,
                "success": result.success,
                "output": result.output,
                "structured_output": result.structured_output,
                "usage": result.usage,
                "latency_ms": result.latency_ms,
                "error": result.error,
            }
        except Exception as e:
            logger.error(f"Execute command error: {e}")
            raise

    async def handle_list_commands(self, data: Dict[str, Any]) -> Dict[str, Any]:
        """Handle list commands request"""
        try:
            commands = self.command_service.list_commands()
            return {"commands": commands}
        except Exception as e:
            logger.error(f"List commands error: {e}")
            raise

    async def handle_search_commands(self, data: Dict[str, Any]) -> Dict[str, Any]:
        """Handle search commands request"""
        try:
            query = data.get("query", "")
            commands = self.command_service.search_commands(query)
            return {
                "commands": [
                    {
                        "name": cmd.name,
                        "description": cmd.description,
                        "category": cmd.category.value,
                    }
                    for cmd in commands
                ]
            }
        except Exception as e:
            logger.error(f"Search commands error: {e}")
            raise
