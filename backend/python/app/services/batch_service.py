"""
Batch Processing Service

Process multiple prompts in parallel with rate limiting,
retry logic, progress tracking, and result aggregation.
"""

import asyncio
import uuid
import time
from datetime import datetime
from typing import Optional, List, Dict, Any, Callable, Awaitable, AsyncGenerator
from enum import Enum
from pydantic import BaseModel, Field
from loguru import logger

from .llm_service import LLMService
from .instructor_service import InstructorService
from ..models.llm_models import (
    LLMProvider,
    LLMRequest,
    LLMResponse,
    Message,
    MessageRole,
)


class BatchStatus(str, Enum):
    """Status of a batch job"""
    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"
    PARTIAL = "partial"


class BatchItemStatus(str, Enum):
    """Status of individual batch item"""
    PENDING = "pending"
    PROCESSING = "processing"
    COMPLETED = "completed"
    FAILED = "failed"
    SKIPPED = "skipped"


class BatchItem(BaseModel):
    """Single item in a batch"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4())[:8])
    prompt: str
    system_prompt: Optional[str] = None
    variables: Dict[str, Any] = Field(default_factory=dict)
    metadata: Dict[str, Any] = Field(default_factory=dict)


class BatchItemResult(BaseModel):
    """Result of processing a batch item"""
    item_id: str
    status: BatchItemStatus
    input_prompt: str
    output: Optional[str] = None
    structured_output: Optional[Dict[str, Any]] = None
    error: Optional[str] = None
    latency_ms: float = 0
    tokens_used: Dict[str, int] = Field(default_factory=dict)
    retry_count: int = 0


class BatchConfig(BaseModel):
    """Configuration for batch processing"""
    max_concurrency: int = Field(default=5, ge=1, le=50)
    rate_limit_per_minute: int = Field(default=60, ge=1)
    retry_attempts: int = Field(default=3, ge=0)
    retry_delay_seconds: float = Field(default=1.0, ge=0)
    timeout_seconds: float = Field(default=60.0, ge=1)
    stop_on_error: bool = False
    model: Optional[str] = None
    provider: Optional[LLMProvider] = None
    temperature: float = 0.7
    max_tokens: Optional[int] = None
    output_schema: Optional[str] = None


class BatchJob(BaseModel):
    """Batch processing job"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    status: BatchStatus = BatchStatus.PENDING
    items: List[BatchItem]
    config: BatchConfig = Field(default_factory=BatchConfig)
    results: List[BatchItemResult] = Field(default_factory=list)
    created_at: datetime = Field(default_factory=datetime.now)
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    progress: float = 0.0
    total_tokens: Dict[str, int] = Field(default_factory=dict)
    error: Optional[str] = None


class BatchProgress(BaseModel):
    """Progress update for batch job"""
    job_id: str
    status: BatchStatus
    progress: float
    completed_items: int
    total_items: int
    failed_items: int
    current_item: Optional[str] = None
    estimated_remaining_seconds: Optional[float] = None


class BatchService:
    """
    Service for batch processing of LLM requests

    Features:
    - Parallel processing with configurable concurrency
    - Rate limiting to respect API limits
    - Automatic retry with exponential backoff
    - Progress tracking and streaming updates
    - Result aggregation and export
    - Job persistence and resumption
    """

    def __init__(
        self,
        llm_service: Optional[LLMService] = None,
        instructor_service: Optional[InstructorService] = None,
    ):
        self.llm_service = llm_service or LLMService()
        self.instructor_service = instructor_service or InstructorService()
        self._jobs: Dict[str, BatchJob] = {}
        self._semaphore_map: Dict[str, asyncio.Semaphore] = {}
        self._cancel_flags: Dict[str, bool] = {}
        self._rate_limiters: Dict[str, 'TokenBucket'] = {}

    def create_job(
        self,
        name: str,
        items: List[BatchItem],
        config: Optional[BatchConfig] = None,
    ) -> BatchJob:
        """
        Create a new batch job

        Args:
            name: Job name
            items: Items to process
            config: Processing configuration

        Returns:
            Created BatchJob
        """
        job = BatchJob(
            name=name,
            items=items,
            config=config or BatchConfig(),
        )

        self._jobs[job.id] = job
        self._cancel_flags[job.id] = False

        logger.info(f"Created batch job: {job.id} with {len(items)} items")
        return job

    def get_job(self, job_id: str) -> Optional[BatchJob]:
        """Get a batch job by ID"""
        return self._jobs.get(job_id)

    def list_jobs(self) -> List[BatchJob]:
        """List all batch jobs"""
        return list(self._jobs.values())

    def cancel_job(self, job_id: str) -> bool:
        """Cancel a running batch job"""
        if job_id not in self._jobs:
            return False

        self._cancel_flags[job_id] = True
        job = self._jobs[job_id]
        if job.status == BatchStatus.RUNNING:
            job.status = BatchStatus.CANCELLED

        logger.info(f"Cancelled batch job: {job_id}")
        return True

    async def run_job(
        self,
        job_id: str,
        progress_callback: Optional[Callable[[BatchProgress], Awaitable[None]]] = None,
    ) -> BatchJob:
        """
        Run a batch job

        Args:
            job_id: ID of job to run
            progress_callback: Optional callback for progress updates

        Returns:
            Completed BatchJob
        """
        job = self.get_job(job_id)
        if not job:
            raise ValueError(f"Job not found: {job_id}")

        if job.status not in [BatchStatus.PENDING, BatchStatus.PARTIAL]:
            raise ValueError(f"Job cannot be started: status is {job.status}")

        job.status = BatchStatus.RUNNING
        job.started_at = datetime.now()

        # Setup concurrency control
        semaphore = asyncio.Semaphore(job.config.max_concurrency)
        self._semaphore_map[job_id] = semaphore

        # Setup rate limiter
        rate_limiter = TokenBucket(
            tokens_per_minute=job.config.rate_limit_per_minute
        )
        self._rate_limiters[job_id] = rate_limiter

        try:
            # Process items
            pending_items = [
                item for item in job.items
                if not any(r.item_id == item.id for r in job.results)
            ]

            tasks = [
                self._process_item(job, item, semaphore, rate_limiter, progress_callback)
                for item in pending_items
            ]

            results = await asyncio.gather(*tasks, return_exceptions=True)

            # Process results
            for item, result in zip(pending_items, results):
                if isinstance(result, Exception):
                    job.results.append(BatchItemResult(
                        item_id=item.id,
                        status=BatchItemStatus.FAILED,
                        input_prompt=item.prompt,
                        error=str(result),
                    ))
                else:
                    job.results.append(result)

            # Determine final status
            failed_count = sum(1 for r in job.results if r.status == BatchItemStatus.FAILED)
            if self._cancel_flags.get(job_id):
                job.status = BatchStatus.CANCELLED
            elif failed_count == 0:
                job.status = BatchStatus.COMPLETED
            elif failed_count == len(job.results):
                job.status = BatchStatus.FAILED
            else:
                job.status = BatchStatus.PARTIAL

            job.completed_at = datetime.now()
            job.progress = 1.0

            # Aggregate tokens
            for result in job.results:
                for key, value in result.tokens_used.items():
                    job.total_tokens[key] = job.total_tokens.get(key, 0) + value

            return job

        except Exception as e:
            job.status = BatchStatus.FAILED
            job.error = str(e)
            job.completed_at = datetime.now()
            logger.error(f"Batch job {job_id} failed: {e}")
            raise

        finally:
            # Cleanup
            if job_id in self._semaphore_map:
                del self._semaphore_map[job_id]
            if job_id in self._rate_limiters:
                del self._rate_limiters[job_id]

    async def _process_item(
        self,
        job: BatchJob,
        item: BatchItem,
        semaphore: asyncio.Semaphore,
        rate_limiter: 'TokenBucket',
        progress_callback: Optional[Callable[[BatchProgress], Awaitable[None]]],
    ) -> BatchItemResult:
        """Process a single batch item"""
        async with semaphore:
            # Check for cancellation
            if self._cancel_flags.get(job.id):
                return BatchItemResult(
                    item_id=item.id,
                    status=BatchItemStatus.SKIPPED,
                    input_prompt=item.prompt,
                    error="Job cancelled",
                )

            # Rate limiting
            await rate_limiter.acquire()

            start_time = time.time()
            last_error = None
            retry_count = 0

            for attempt in range(job.config.retry_attempts + 1):
                try:
                    # Render prompt with variables
                    prompt = item.prompt
                    for key, value in item.variables.items():
                        prompt = prompt.replace(f"{{{{{key}}}}}", str(value))

                    # Build messages
                    messages = []
                    if item.system_prompt:
                        messages.append(Message(role=MessageRole.SYSTEM, content=item.system_prompt))
                    messages.append(Message(role=MessageRole.USER, content=prompt))

                    # Execute request
                    if job.config.output_schema:
                        result = await self._process_structured(job, messages)
                        output = None
                        structured = result
                    else:
                        result = await self._process_regular(job, messages)
                        output = result["content"]
                        structured = None

                    latency_ms = (time.time() - start_time) * 1000

                    # Update progress
                    completed = len([r for r in job.results if r.status == BatchItemStatus.COMPLETED])
                    job.progress = (completed + 1) / len(job.items)

                    if progress_callback:
                        await progress_callback(BatchProgress(
                            job_id=job.id,
                            status=job.status,
                            progress=job.progress,
                            completed_items=completed + 1,
                            total_items=len(job.items),
                            failed_items=len([r for r in job.results if r.status == BatchItemStatus.FAILED]),
                            current_item=item.id,
                        ))

                    return BatchItemResult(
                        item_id=item.id,
                        status=BatchItemStatus.COMPLETED,
                        input_prompt=item.prompt,
                        output=output,
                        structured_output=structured,
                        latency_ms=latency_ms,
                        tokens_used=result.get("usage", {}),
                        retry_count=retry_count,
                    )

                except Exception as e:
                    last_error = str(e)
                    retry_count = attempt
                    logger.warning(f"Item {item.id} attempt {attempt + 1} failed: {e}")

                    if attempt < job.config.retry_attempts:
                        delay = job.config.retry_delay_seconds * (2 ** attempt)
                        await asyncio.sleep(delay)

                    if job.config.stop_on_error:
                        raise

            return BatchItemResult(
                item_id=item.id,
                status=BatchItemStatus.FAILED,
                input_prompt=item.prompt,
                error=last_error,
                latency_ms=(time.time() - start_time) * 1000,
                retry_count=retry_count,
            )

    async def _process_regular(
        self,
        job: BatchJob,
        messages: List[Message],
    ) -> Dict[str, Any]:
        """Process with regular LLM service"""
        request = LLMRequest(
            messages=messages,
            model=job.config.model,
            provider=job.config.provider,
            temperature=job.config.temperature,
            max_tokens=job.config.max_tokens,
        )

        response = await self.llm_service.generate(request)

        return {
            "content": response.content,
            "usage": response.usage,
        }

    async def _process_structured(
        self,
        job: BatchJob,
        messages: List[Message],
    ) -> Dict[str, Any]:
        """Process with structured output"""
        from ..models.llm_models import (
            PromptAnalysis,
            PromptRefinement,
            TranslationResult,
            SafetyCheck,
            CostPrediction,
        )

        schema_map = {
            "PromptAnalysis": PromptAnalysis,
            "PromptRefinement": PromptRefinement,
            "TranslationResult": TranslationResult,
            "SafetyCheck": SafetyCheck,
            "CostPrediction": CostPrediction,
        }

        model_class = schema_map.get(job.config.output_schema)
        if not model_class:
            raise ValueError(f"Unknown output schema: {job.config.output_schema}")

        result = await self.instructor_service.extract(
            response_model=model_class,
            messages=messages,
            model=job.config.model,
            temperature=job.config.temperature,
        )

        return result.model_dump()

    async def stream_progress(
        self,
        job_id: str,
    ) -> AsyncGenerator[BatchProgress, None]:
        """
        Stream progress updates for a job

        Yields:
            BatchProgress updates
        """
        job = self.get_job(job_id)
        if not job:
            return

        last_progress = -1

        while job.status == BatchStatus.RUNNING:
            if job.progress != last_progress:
                last_progress = job.progress
                completed = len([r for r in job.results if r.status == BatchItemStatus.COMPLETED])
                failed = len([r for r in job.results if r.status == BatchItemStatus.FAILED])

                yield BatchProgress(
                    job_id=job.id,
                    status=job.status,
                    progress=job.progress,
                    completed_items=completed,
                    total_items=len(job.items),
                    failed_items=failed,
                )

            await asyncio.sleep(0.5)

        # Final update
        yield BatchProgress(
            job_id=job.id,
            status=job.status,
            progress=1.0,
            completed_items=len([r for r in job.results if r.status == BatchItemStatus.COMPLETED]),
            total_items=len(job.items),
            failed_items=len([r for r in job.results if r.status == BatchItemStatus.FAILED]),
        )

    def export_results(
        self,
        job_id: str,
        format: str = "json",
    ) -> str:
        """
        Export batch results

        Args:
            job_id: Job ID
            format: Export format (json, csv)

        Returns:
            Exported data as string
        """
        import json
        import csv
        import io

        job = self.get_job(job_id)
        if not job:
            raise ValueError(f"Job not found: {job_id}")

        if format == "json":
            return json.dumps([r.model_dump() for r in job.results], indent=2)

        elif format == "csv":
            output = io.StringIO()
            writer = csv.DictWriter(output, fieldnames=[
                "item_id", "status", "input_prompt", "output", "error", "latency_ms"
            ])
            writer.writeheader()
            for result in job.results:
                writer.writerow({
                    "item_id": result.item_id,
                    "status": result.status.value,
                    "input_prompt": result.input_prompt[:100],
                    "output": (result.output or "")[:200],
                    "error": result.error or "",
                    "latency_ms": result.latency_ms,
                })
            return output.getvalue()

        else:
            raise ValueError(f"Unknown export format: {format}")

    def get_statistics(self, job_id: str) -> Dict[str, Any]:
        """Get statistics for a batch job"""
        job = self.get_job(job_id)
        if not job:
            raise ValueError(f"Job not found: {job_id}")

        completed = [r for r in job.results if r.status == BatchItemStatus.COMPLETED]
        failed = [r for r in job.results if r.status == BatchItemStatus.FAILED]

        latencies = [r.latency_ms for r in completed]
        avg_latency = sum(latencies) / len(latencies) if latencies else 0

        return {
            "job_id": job.id,
            "name": job.name,
            "status": job.status.value,
            "total_items": len(job.items),
            "completed_items": len(completed),
            "failed_items": len(failed),
            "success_rate": len(completed) / len(job.results) if job.results else 0,
            "avg_latency_ms": avg_latency,
            "total_tokens": job.total_tokens,
            "duration_seconds": (
                (job.completed_at - job.started_at).total_seconds()
                if job.started_at and job.completed_at else 0
            ),
        }


class TokenBucket:
    """Token bucket rate limiter"""

    def __init__(self, tokens_per_minute: int):
        self.tokens_per_minute = tokens_per_minute
        self.tokens = tokens_per_minute
        self.last_refill = time.time()
        self._lock = asyncio.Lock()

    async def acquire(self) -> None:
        """Acquire a token, waiting if necessary"""
        async with self._lock:
            self._refill()

            while self.tokens < 1:
                wait_time = 60 / self.tokens_per_minute
                await asyncio.sleep(wait_time)
                self._refill()

            self.tokens -= 1

    def _refill(self) -> None:
        """Refill tokens based on elapsed time"""
        now = time.time()
        elapsed = now - self.last_refill
        new_tokens = elapsed * (self.tokens_per_minute / 60)
        self.tokens = min(self.tokens_per_minute, self.tokens + new_tokens)
        self.last_refill = now
