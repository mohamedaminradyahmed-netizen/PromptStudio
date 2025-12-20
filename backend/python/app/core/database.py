"""
Database connection and session management with pgvector support
"""

from contextlib import asynccontextmanager
from typing import AsyncGenerator
from sqlalchemy.ext.asyncio import (
    AsyncSession,
    create_async_engine,
    async_sessionmaker,
    AsyncEngine
)
from sqlalchemy import text
from loguru import logger

from .config import settings


class Database:
    """Database connection manager with pgvector support"""

    def __init__(self):
        self._engine: AsyncEngine | None = None
        self._session_factory: async_sessionmaker[AsyncSession] | None = None

    async def init(self) -> None:
        """Initialize database connection and pgvector extension"""
        self._engine = create_async_engine(
            settings.database_url,
            echo=settings.debug,
            pool_size=10,
            max_overflow=20,
            pool_pre_ping=True,
        )

        self._session_factory = async_sessionmaker(
            bind=self._engine,
            class_=AsyncSession,
            expire_on_commit=False,
            autoflush=False,
        )

        # Verify connection and pgvector extension
        await self._verify_pgvector()
        logger.info("Database initialized with pgvector support")

    async def _verify_pgvector(self) -> None:
        """Verify pgvector extension is available"""
        async with self.session() as session:
            try:
                # Check if pgvector extension exists
                result = await session.execute(
                    text("SELECT 1 FROM pg_extension WHERE extname = 'vector'")
                )
                if result.scalar() is None:
                    logger.warning("pgvector extension not found, attempting to create...")
                    await session.execute(text("CREATE EXTENSION IF NOT EXISTS vector"))
                    await session.commit()
                    logger.info("pgvector extension created successfully")
                else:
                    logger.info("pgvector extension verified")
            except Exception as e:
                logger.error(f"Failed to verify pgvector: {e}")
                raise

    @asynccontextmanager
    async def session(self) -> AsyncGenerator[AsyncSession, None]:
        """Get an async database session"""
        if self._session_factory is None:
            raise RuntimeError("Database not initialized. Call init() first.")

        session = self._session_factory()
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()

    async def close(self) -> None:
        """Close database connection"""
        if self._engine:
            await self._engine.dispose()
            logger.info("Database connection closed")


# Global database instance
database = Database()


async def get_session() -> AsyncGenerator[AsyncSession, None]:
    """Dependency for getting database session"""
    async with database.session() as session:
        yield session
