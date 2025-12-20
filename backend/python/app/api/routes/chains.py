"""
Prompt Chain API endpoints

Execute multi-step prompt chains with dependency resolution
and context passing.
"""

from typing import Optional, List, Dict, Any
from fastapi import APIRouter, HTTPException, BackgroundTasks
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
import json

from ...services.prompt_chain_service import (
    PromptChainService,
    ChainDefinition,
    ChainStepDefinition,
    ChainExecutionResult,
    ChainExecutionMode,
)

router = APIRouter(prefix="/chains", tags=["Prompt Chains"])

# Service instance
chain_service = PromptChainService()


# Request/Response models

class ChainStepRequest(BaseModel):
    """Request model for a chain step"""
    id: str
    name: str
    prompt_template: str
    system_prompt: Optional[str] = None
    dependencies: List[str] = Field(default_factory=list)
    condition: Optional[str] = None
    output_key: str
    output_schema: Optional[str] = None
    model: Optional[str] = None
    temperature: float = 0.7
    max_tokens: Optional[int] = None
    retry_count: int = 2


class CreateChainRequest(BaseModel):
    """Request to create a new chain"""
    id: str
    name: str
    description: str
    steps: List[ChainStepRequest]
    execution_mode: str = "sequential"
    variables: Dict[str, Any] = Field(default_factory=dict)
    metadata: Dict[str, Any] = Field(default_factory=dict)


class ExecuteChainRequest(BaseModel):
    """Request to execute a chain"""
    chain_id: Optional[str] = None
    chain: Optional[CreateChainRequest] = None
    variables: Dict[str, Any] = Field(default_factory=dict)
    stream: bool = False


@router.post("/create", response_model=Dict[str, str])
async def create_chain(request: CreateChainRequest):
    """
    Create and register a new prompt chain

    The chain can be executed later by its ID.
    """
    try:
        steps = [
            ChainStepDefinition(
                id=step.id,
                name=step.name,
                prompt_template=step.prompt_template,
                system_prompt=step.system_prompt,
                dependencies=step.dependencies,
                condition=step.condition,
                output_key=step.output_key,
                output_schema=step.output_schema,
                model=step.model,
                temperature=step.temperature,
                max_tokens=step.max_tokens,
                retry_count=step.retry_count,
            )
            for step in request.steps
        ]

        chain = ChainDefinition(
            id=request.id,
            name=request.name,
            description=request.description,
            steps=steps,
            execution_mode=ChainExecutionMode(request.execution_mode),
            variables=request.variables,
            metadata=request.metadata,
        )

        chain_service.register_chain(chain)

        return {
            "status": "created",
            "chain_id": chain.id,
            "message": f"Chain '{chain.name}' created with {len(steps)} steps",
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/execute", response_model=ChainExecutionResult)
async def execute_chain(request: ExecuteChainRequest):
    """
    Execute a prompt chain

    You can either:
    - Provide a chain_id to execute a registered chain
    - Provide a chain definition inline
    """
    try:
        if request.chain_id:
            # Execute registered chain
            result = await chain_service.execute(
                chain_id=request.chain_id,
                variables=request.variables,
            )
        elif request.chain:
            # Execute inline chain
            steps = [
                ChainStepDefinition(
                    id=step.id,
                    name=step.name,
                    prompt_template=step.prompt_template,
                    system_prompt=step.system_prompt,
                    dependencies=step.dependencies,
                    condition=step.condition,
                    output_key=step.output_key,
                    output_schema=step.output_schema,
                    model=step.model,
                    temperature=step.temperature,
                    max_tokens=step.max_tokens,
                    retry_count=step.retry_count,
                )
                for step in request.chain.steps
            ]

            chain = ChainDefinition(
                id=request.chain.id,
                name=request.chain.name,
                description=request.chain.description,
                steps=steps,
                execution_mode=ChainExecutionMode(request.chain.execution_mode),
                variables={**request.chain.variables, **request.variables},
                metadata=request.chain.metadata,
            )

            result = await chain_service.execute_chain(chain, request.variables)
        else:
            raise HTTPException(
                status_code=400,
                detail="Either chain_id or chain must be provided"
            )

        return result

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/execute/stream")
async def execute_chain_stream(request: ExecuteChainRequest):
    """
    Execute a chain with streaming step results

    Returns Server-Sent Events with progress updates.
    """
    async def generate():
        try:
            if request.chain:
                steps = [
                    ChainStepDefinition(
                        id=step.id,
                        name=step.name,
                        prompt_template=step.prompt_template,
                        system_prompt=step.system_prompt,
                        dependencies=step.dependencies,
                        condition=step.condition,
                        output_key=step.output_key,
                        output_schema=step.output_schema,
                        model=step.model,
                        temperature=step.temperature,
                        max_tokens=step.max_tokens,
                        retry_count=step.retry_count,
                    )
                    for step in request.chain.steps
                ]

                chain = ChainDefinition(
                    id=request.chain.id,
                    name=request.chain.name,
                    description=request.chain.description,
                    steps=steps,
                    execution_mode=ChainExecutionMode(request.chain.execution_mode),
                    variables={**request.chain.variables, **request.variables},
                    metadata=request.chain.metadata,
                )

                async for step_result in chain_service.stream_execute(chain, request.variables):
                    yield f"data: {json.dumps(step_result.model_dump())}\n\n"
            else:
                yield f"data: {json.dumps({'error': 'Chain definition required for streaming'})}\n\n"

        except Exception as e:
            yield f"data: {json.dumps({'error': str(e)})}\n\n"

        yield "data: [DONE]\n\n"

    return StreamingResponse(generate(), media_type="text/event-stream")


@router.get("/list", response_model=List[str])
async def list_chains():
    """List all registered chain IDs"""
    return chain_service.list_chains()


@router.get("/{chain_id}", response_model=Dict[str, Any])
async def get_chain(chain_id: str):
    """Get a chain definition by ID"""
    chain = chain_service.get_chain(chain_id)
    if not chain:
        raise HTTPException(status_code=404, detail=f"Chain not found: {chain_id}")

    return chain.model_dump()


@router.delete("/{chain_id}")
async def delete_chain(chain_id: str):
    """Delete a registered chain"""
    if chain_id not in chain_service._chains:
        raise HTTPException(status_code=404, detail=f"Chain not found: {chain_id}")

    del chain_service._chains[chain_id]
    return {"status": "deleted", "chain_id": chain_id}
