"""
Health check endpoints
"""

from fastapi import APIRouter
from pydantic import BaseModel

from ...core.config import settings

router = APIRouter(prefix="/health", tags=["Health"])


class HealthResponse(BaseModel):
    """Health check response"""
    status: str
    version: str
    environment: str


class ReadinessResponse(BaseModel):
    """Readiness check response"""
    ready: bool
    services: dict


@router.get("", response_model=HealthResponse)
async def health_check():
    """Basic health check"""
    return HealthResponse(
        status="healthy",
        version=settings.app_version,
        environment=settings.environment,
    )


@router.get("/ready", response_model=ReadinessResponse)
async def readiness_check():
    """
    Readiness check for Kubernetes/Docker

    Checks if all required services are available.
    """
    services = {
        "openai": settings.openai_api_key is not None,
        "anthropic": settings.anthropic_api_key is not None,
    }

    return ReadinessResponse(
        ready=any(services.values()),
        services=services,
    )


@router.get("/live")
async def liveness_check():
    """Liveness check for Kubernetes"""
    return {"alive": True}
