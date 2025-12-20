"""
Commands API endpoints

Provides REST API for YAML-based command operations.
"""

from typing import Optional, List
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from ...services.command_service import CommandService
from ...services.yaml_loader import YAMLCommandLoader
from ...models.command_models import (
    Command,
    CommandExecutionRequest,
    CommandExecutionResult,
    CommandCategory,
)

router = APIRouter(prefix="/commands", tags=["Commands"])

# Service instances
yaml_loader = YAMLCommandLoader()
command_service = CommandService(yaml_loader=yaml_loader)


# API Models

class ExecuteRequest(BaseModel):
    """Request to execute a command"""
    command_name: str
    parameters: dict = Field(default_factory=dict)
    model: Optional[str] = None
    temperature: Optional[float] = None
    stream: bool = False


class CommandInfo(BaseModel):
    """Command information for listing"""
    name: str
    category: str
    description: str
    parameters: List[dict]


class CommandListResponse(BaseModel):
    """Response for command list"""
    commands: List[CommandInfo]
    total: int


class SearchRequest(BaseModel):
    """Request to search commands"""
    query: str


@router.get("", response_model=CommandListResponse)
async def list_commands(category: Optional[str] = None):
    """
    List all available commands

    Args:
        category: Optional filter by category

    Returns:
        List of command information
    """
    try:
        if category:
            commands = command_service.get_commands_by_category(
                CommandCategory(category)
            )
        else:
            command_names = command_service.list_commands()
            commands = [
                command_service.get_command(name)
                for name in command_names
            ]

        return CommandListResponse(
            commands=[
                CommandInfo(
                    name=cmd.name,
                    category=cmd.category.value,
                    description=cmd.description,
                    parameters=[p.model_dump() for p in cmd.parameters],
                )
                for cmd in commands if cmd
            ],
            total=len(commands),
        )

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{command_name}")
async def get_command(command_name: str):
    """
    Get details of a specific command

    Args:
        command_name: Name of the command

    Returns:
        Full command definition
    """
    command = command_service.get_command(command_name)
    if not command:
        raise HTTPException(status_code=404, detail=f"Command not found: {command_name}")

    return command.model_dump()


@router.post("/execute", response_model=CommandExecutionResult)
async def execute_command(request: ExecuteRequest):
    """
    Execute a command

    Args:
        request: Execution request with command name and parameters

    Returns:
        Execution result with output and metrics
    """
    try:
        exec_request = CommandExecutionRequest(
            command_name=request.command_name,
            parameters=request.parameters,
            override_model=request.model,
            override_temperature=request.temperature,
            stream=request.stream,
        )

        return await command_service.execute(exec_request)

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/search")
async def search_commands(request: SearchRequest):
    """
    Search commands by name, description, or tags

    Args:
        request: Search query

    Returns:
        List of matching commands
    """
    try:
        commands = command_service.search_commands(request.query)

        return {
            "results": [
                {
                    "name": cmd.name,
                    "category": cmd.category.value,
                    "description": cmd.description,
                    "tags": cmd.metadata.tags,
                }
                for cmd in commands
            ],
            "total": len(commands),
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/reload")
async def reload_commands():
    """
    Reload all commands from YAML files

    Use this after adding or modifying command files.
    """
    try:
        command_service.reload_commands()
        commands = command_service.list_commands()

        return {
            "success": True,
            "message": f"Reloaded {len(commands)} commands",
            "commands": commands,
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/categories/list")
async def list_categories():
    """
    List all command categories

    Returns:
        List of available categories
    """
    return {
        "categories": [cat.value for cat in CommandCategory]
    }
