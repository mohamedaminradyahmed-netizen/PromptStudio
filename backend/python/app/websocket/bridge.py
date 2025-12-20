"""
WebSocket Bridge between Python FastAPI and Node.js Backend

This bridge enables real-time communication between:
- Python FastAPI (LLM processing with Mirascope/Instructor)
- Node.js Express (main backend with Socket.IO)

The bridge uses Socket.IO client to connect to the Node.js backend
and exposes a FastAPI WebSocket endpoint for direct client connections.
"""

import asyncio
import json
from typing import Optional, Dict, Any, Callable, Awaitable
from contextlib import asynccontextmanager
import socketio
from fastapi import WebSocket, WebSocketDisconnect
from loguru import logger

from ..core.config import settings


class WebSocketBridge:
    """
    Bidirectional WebSocket bridge between Python and Node.js

    Features:
    - Connect to Node.js Socket.IO server as a client
    - Forward LLM requests from Node.js to Python
    - Stream LLM responses back to Node.js
    - Handle direct WebSocket connections from clients
    """

    def __init__(self):
        # Socket.IO client to connect to Node.js
        self.sio = socketio.AsyncClient(
            reconnection=True,
            reconnection_attempts=5,
            reconnection_delay=1,
            reconnection_delay_max=5,
        )

        # Active WebSocket connections from clients
        self.active_connections: Dict[str, WebSocket] = {}

        # Message handlers
        self.handlers: Dict[str, Callable[..., Awaitable[Any]]] = {}

        # Connection state
        self.connected_to_nodejs = False

        # Setup event handlers
        self._setup_handlers()

    def _setup_handlers(self):
        """Setup Socket.IO event handlers"""

        @self.sio.event
        async def connect():
            logger.info("Connected to Node.js backend")
            self.connected_to_nodejs = True
            # Register as Python LLM service
            await self.sio.emit("register_service", {
                "service": "python_llm",
                "capabilities": [
                    "structured_output",
                    "prompt_analysis",
                    "prompt_refinement",
                    "translation",
                    "safety_check",
                    "cost_prediction",
                    "streaming",
                ]
            })

        @self.sio.event
        async def disconnect():
            logger.warning("Disconnected from Node.js backend")
            self.connected_to_nodejs = False

        @self.sio.event
        async def connect_error(error):
            logger.error(f"Connection error to Node.js: {error}")

        @self.sio.event
        async def llm_request(data):
            """Handle LLM request from Node.js"""
            logger.debug(f"Received LLM request: {data.get('type')}")
            await self._handle_llm_request(data)

        @self.sio.event
        async def command_request(data):
            """Handle command execution request from Node.js"""
            logger.debug(f"Received command request: {data.get('command')}")
            await self._handle_command_request(data)

    async def connect_to_nodejs(self):
        """Connect to the Node.js backend"""
        if self.connected_to_nodejs:
            return

        try:
            nodejs_url = settings.nodejs_ws_url.replace("ws://", "http://").replace("wss://", "https://")
            # Add query parameter to identify as Python service
            if "?" in nodejs_url:
                nodejs_url += "&service=python_llm"
            else:
                nodejs_url += "?service=python_llm"
            logger.info(f"Connecting to Node.js backend at {nodejs_url}")
            await self.sio.connect(
                nodejs_url,
                transports=["websocket"],
                namespaces=["/"],
            )
        except Exception as e:
            logger.error(f"Failed to connect to Node.js: {e}")
            raise

    async def disconnect_from_nodejs(self):
        """Disconnect from the Node.js backend"""
        if self.connected_to_nodejs:
            await self.sio.disconnect()
            self.connected_to_nodejs = False

    def register_handler(
        self,
        event: str,
        handler: Callable[..., Awaitable[Any]]
    ):
        """Register a message handler"""
        self.handlers[event] = handler

    async def _handle_llm_request(self, data: Dict[str, Any]):
        """Process LLM request and send response to Node.js"""
        request_id = data.get("request_id")
        request_type = data.get("type")

        try:
            if request_type in self.handlers:
                handler = self.handlers[request_type]
                result = await handler(data)
                await self.sio.emit("llm_response", {
                    "request_id": request_id,
                    "success": True,
                    "result": result,
                })
            else:
                await self.sio.emit("llm_response", {
                    "request_id": request_id,
                    "success": False,
                    "error": f"Unknown request type: {request_type}",
                })
        except Exception as e:
            logger.error(f"Error handling LLM request: {e}")
            await self.sio.emit("llm_response", {
                "request_id": request_id,
                "success": False,
                "error": str(e),
            })

    async def _handle_command_request(self, data: Dict[str, Any]):
        """Process command execution request"""
        request_id = data.get("request_id")

        try:
            if "execute_command" in self.handlers:
                handler = self.handlers["execute_command"]
                result = await handler(data)
                await self.sio.emit("command_response", {
                    "request_id": request_id,
                    "success": True,
                    "result": result,
                })
            else:
                await self.sio.emit("command_response", {
                    "request_id": request_id,
                    "success": False,
                    "error": "Command handler not registered",
                })
        except Exception as e:
            logger.error(f"Error handling command request: {e}")
            await self.sio.emit("command_response", {
                "request_id": request_id,
                "success": False,
                "error": str(e),
            })

    async def emit_to_nodejs(self, event: str, data: Dict[str, Any]):
        """Emit an event to the Node.js backend"""
        if not self.connected_to_nodejs:
            logger.warning("Not connected to Node.js, cannot emit event")
            return

        await self.sio.emit(event, data)

    async def stream_to_nodejs(
        self,
        request_id: str,
        content_generator,
    ):
        """Stream content to Node.js backend"""
        try:
            async for chunk in content_generator:
                await self.sio.emit("llm_stream", {
                    "request_id": request_id,
                    "chunk": chunk,
                    "done": False,
                })

            await self.sio.emit("llm_stream", {
                "request_id": request_id,
                "chunk": "",
                "done": True,
            })
        except Exception as e:
            logger.error(f"Error streaming to Node.js: {e}")
            await self.sio.emit("llm_stream", {
                "request_id": request_id,
                "error": str(e),
                "done": True,
            })

    # Direct WebSocket handling for FastAPI clients

    async def handle_websocket(self, websocket: WebSocket, client_id: str):
        """Handle a direct WebSocket connection from a client"""
        await websocket.accept()
        self.active_connections[client_id] = websocket
        logger.info(f"Client connected: {client_id}")

        try:
            while True:
                data = await websocket.receive_json()
                await self._process_client_message(client_id, data)
        except WebSocketDisconnect:
            logger.info(f"Client disconnected: {client_id}")
        except Exception as e:
            logger.error(f"WebSocket error for {client_id}: {e}")
        finally:
            if client_id in self.active_connections:
                del self.active_connections[client_id]

    async def _process_client_message(
        self,
        client_id: str,
        data: Dict[str, Any]
    ):
        """Process message from a direct WebSocket client"""
        message_type = data.get("type")
        websocket = self.active_connections.get(client_id)

        if not websocket:
            return

        try:
            if message_type in self.handlers:
                handler = self.handlers[message_type]
                result = await handler(data)
                await websocket.send_json({
                    "type": f"{message_type}_response",
                    "success": True,
                    "result": result,
                })
            else:
                await websocket.send_json({
                    "type": "error",
                    "message": f"Unknown message type: {message_type}",
                })
        except Exception as e:
            logger.error(f"Error processing message from {client_id}: {e}")
            await websocket.send_json({
                "type": "error",
                "message": str(e),
            })

    async def send_to_client(self, client_id: str, data: Dict[str, Any]):
        """Send data to a specific client"""
        websocket = self.active_connections.get(client_id)
        if websocket:
            await websocket.send_json(data)

    async def broadcast(self, data: Dict[str, Any]):
        """Broadcast data to all connected clients"""
        for websocket in self.active_connections.values():
            try:
                await websocket.send_json(data)
            except Exception as e:
                logger.error(f"Error broadcasting: {e}")

    async def stream_to_client(
        self,
        client_id: str,
        content_generator,
    ):
        """Stream content to a specific client"""
        websocket = self.active_connections.get(client_id)
        if not websocket:
            return

        try:
            async for chunk in content_generator:
                await websocket.send_json({
                    "type": "stream",
                    "chunk": chunk,
                    "done": False,
                })

            await websocket.send_json({
                "type": "stream",
                "chunk": "",
                "done": True,
            })
        except Exception as e:
            logger.error(f"Error streaming to client {client_id}: {e}")


# Global bridge instance
bridge = WebSocketBridge()


@asynccontextmanager
async def lifespan_bridge():
    """Context manager for bridge lifecycle"""
    try:
        await bridge.connect_to_nodejs()
        yield bridge
    finally:
        await bridge.disconnect_from_nodejs()
