"""
Batch Processing API endpoints

Process multiple prompts in parallel with rate limiting,
retry logic, and progress tracking.
"""

from typing import Optional, List, Dict, Any
from fastapi import APIRouter, HTTPException, BackgroundTasks
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
import json
import asyncio

from ...services.batch_service import (
    BatchService,
    BatchJob,
    BatchItem,
    BatchConfig,
    BatchStatus,
    BatchProgress,
)

router = APIRouter(prefix="/batch", tags=["Batch Processing"])

# Service instance
batch_service = BatchService()


# Request/Response models

class BatchItemRequest(BaseModel):
    """Single item in a batch request"""
    id: Optional[str] = None
    prompt: str
    system_prompt: Optional[str] = None
    variables: Dict[str, Any] = Field(default_factory=dict)
    metadata: Dict[str, Any] = Field(default_factory=dict)


class BatchConfigRequest(BaseModel):
    """Configuration for batch processing"""
    max_concurrency: int = Field(default=5, ge=1, le=50)
    rate_limit_per_minute: int = Field(default=60, ge=1)
    retry_attempts: int = Field(default=3, ge=0)
    retry_delay_seconds: float = Field(default=1.0, ge=0)
    timeout_seconds: float = Field(default=60.0, ge=1)
    stop_on_error: bool = False
    model: Optional[str] = None
    provider: Optional[str] = None
    temperature: float = 0.7
    max_tokens: Optional[int] = None
    output_schema: Optional[str] = None


class CreateBatchRequest(BaseModel):
    """Request to create a batch job"""
    name: str
    items: List[BatchItemRequest]
    config: Optional[BatchConfigRequest] = None


class RunBatchRequest(BaseModel):
    """Request to run a batch job"""
    job_id: str


@router.post("/create", response_model=Dict[str, Any])
async def create_batch_job(request: CreateBatchRequest):
    """
    Create a new batch processing job

    The job is created but not started. Use /run to start processing.
    """
    try:
        items = [
            BatchItem(
                id=item.id,
                prompt=item.prompt,
                system_prompt=item.system_prompt,
                variables=item.variables,
                metadata=item.metadata,
            )
            for item in request.items
        ]

        config = None
        if request.config:
            config = BatchConfig(
                max_concurrency=request.config.max_concurrency,
                rate_limit_per_minute=request.config.rate_limit_per_minute,
                retry_attempts=request.config.retry_attempts,
                retry_delay_seconds=request.config.retry_delay_seconds,
                timeout_seconds=request.config.timeout_seconds,
                stop_on_error=request.config.stop_on_error,
                model=request.config.model,
                temperature=request.config.temperature,
                max_tokens=request.config.max_tokens,
                output_schema=request.config.output_schema,
            )

        job = batch_service.create_job(
            name=request.name,
            items=items,
            config=config,
        )

        return {
            "status": "created",
            "job_id": job.id,
            "name": job.name,
            "item_count": len(job.items),
            "config": job.config.model_dump(),
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/run", response_model=Dict[str, Any])
async def run_batch_job(
    request: RunBatchRequest,
    background_tasks: BackgroundTasks,
):
    """
    Start running a batch job

    The job runs in the background. Use /status to check progress.
    """
    try:
        job = batch_service.get_job(request.job_id)
        if not job:
            raise HTTPException(status_code=404, detail=f"Job not found: {request.job_id}")

        if job.status not in [BatchStatus.PENDING, BatchStatus.PARTIAL]:
            raise HTTPException(
                status_code=400,
                detail=f"Job cannot be started: status is {job.status.value}"
            )

        # Run in background
        async def run_job():
            await batch_service.run_job(request.job_id)

        background_tasks.add_task(asyncio.create_task, run_job())

        return {
            "status": "started",
            "job_id": job.id,
            "message": f"Job '{job.name}' started with {len(job.items)} items",
        }

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/run/sync")
async def run_batch_job_sync(request: RunBatchRequest):
    """
    Run a batch job synchronously

    Waits for the job to complete before returning.
    """
    try:
        job = await batch_service.run_job(request.job_id)
        return {
            "status": job.status.value,
            "job_id": job.id,
            "completed_items": len([r for r in job.results if r.status.value == "completed"]),
            "failed_items": len([r for r in job.results if r.status.value == "failed"]),
            "total_tokens": job.total_tokens,
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/status/{job_id}")
async def get_job_status(job_id: str):
    """Get the current status of a batch job"""
    job = batch_service.get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail=f"Job not found: {job_id}")

    completed = len([r for r in job.results if r.status.value == "completed"])
    failed = len([r for r in job.results if r.status.value == "failed"])

    return {
        "job_id": job.id,
        "name": job.name,
        "status": job.status.value,
        "progress": job.progress,
        "total_items": len(job.items),
        "completed_items": completed,
        "failed_items": failed,
        "created_at": job.created_at.isoformat() if job.created_at else None,
        "started_at": job.started_at.isoformat() if job.started_at else None,
        "completed_at": job.completed_at.isoformat() if job.completed_at else None,
        "error": job.error,
    }


@router.get("/results/{job_id}")
async def get_job_results(job_id: str):
    """Get the results of a completed batch job"""
    job = batch_service.get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail=f"Job not found: {job_id}")

    return {
        "job_id": job.id,
        "status": job.status.value,
        "results": [r.model_dump() for r in job.results],
        "total_tokens": job.total_tokens,
    }


@router.get("/stream/{job_id}")
async def stream_job_progress(job_id: str):
    """
    Stream progress updates for a running job

    Returns Server-Sent Events with progress updates.
    """
    job = batch_service.get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail=f"Job not found: {job_id}")

    async def generate():
        async for progress in batch_service.stream_progress(job_id):
            yield f"data: {json.dumps(progress.model_dump())}\n\n"
        yield "data: [DONE]\n\n"

    return StreamingResponse(generate(), media_type="text/event-stream")


@router.post("/cancel/{job_id}")
async def cancel_job(job_id: str):
    """Cancel a running batch job"""
    success = batch_service.cancel_job(job_id)
    if not success:
        raise HTTPException(status_code=404, detail=f"Job not found: {job_id}")

    return {"status": "cancelled", "job_id": job_id}


@router.get("/export/{job_id}")
async def export_results(job_id: str, format: str = "json"):
    """
    Export batch results in various formats

    Supported formats: json, csv
    """
    try:
        data = batch_service.export_results(job_id, format)

        media_type = "application/json" if format == "json" else "text/csv"
        filename = f"batch_{job_id}.{format}"

        return StreamingResponse(
            iter([data]),
            media_type=media_type,
            headers={"Content-Disposition": f"attachment; filename={filename}"},
        )

    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/statistics/{job_id}")
async def get_job_statistics(job_id: str):
    """Get detailed statistics for a batch job"""
    try:
        stats = batch_service.get_statistics(job_id)
        return stats

    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/list")
async def list_jobs():
    """List all batch jobs"""
    jobs = batch_service.list_jobs()
    return [
        {
            "job_id": j.id,
            "name": j.name,
            "status": j.status.value,
            "item_count": len(j.items),
            "progress": j.progress,
            "created_at": j.created_at.isoformat() if j.created_at else None,
        }
        for j in jobs
    ]


@router.delete("/{job_id}")
async def delete_job(job_id: str):
    """Delete a batch job"""
    if job_id not in batch_service._jobs:
        raise HTTPException(status_code=404, detail=f"Job not found: {job_id}")

    job = batch_service._jobs[job_id]
    if job.status == BatchStatus.RUNNING:
        raise HTTPException(
            status_code=400,
            detail="Cannot delete running job. Cancel it first."
        )

    del batch_service._jobs[job_id]
    return {"status": "deleted", "job_id": job_id}
