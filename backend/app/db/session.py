from typing import AsyncGenerator

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.config.config import *
import os

# Expects settings.DATABASE_URL like:
#   postgresql+asyncpg://user:password@localhost:5432/turjman
# Add DATABASE_URL to app/config/config.py (loaded from env), do not hardcode it here.
engine = create_async_engine(
    url=os.environ['DATABASE_URL'],
    pool_pre_ping=True,   # avoids "connection already closed" after DB idle/restart
    echo=False,
)

AsyncSessionLocal = async_sessionmaker(
    bind=engine,
    expire_on_commit=False,   # lets you keep using ORM objects after commit without refetch
    autoflush=False,
)


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    """FastAPI dependency: `db: AsyncSession = Depends(get_db)`.
    One session per request; rolls back on unhandled exceptions, always closes."""
    async with AsyncSessionLocal() as session:
        try:
            yield session
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()
