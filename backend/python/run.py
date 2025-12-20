#!/usr/bin/env python3
"""
Run script for PromptStudio Python Backend
"""

import uvicorn
from app.core.config import settings


def main():
    """Run the FastAPI application"""
    uvicorn.run(
        "app.main:app",
        host=settings.host,
        port=settings.port,
        reload=settings.debug,
        workers=1 if settings.debug else settings.workers,
        log_level=settings.log_level.lower(),
    )


if __name__ == "__main__":
    main()
