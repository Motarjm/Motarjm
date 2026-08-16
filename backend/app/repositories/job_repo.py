"""
Postgres-backed replacement for app.state.job_store.JobStore.

Function names/signatures deliberately mirror the old JobStore methods so the
router changes are mostly "add `db` param, add `await`" — see notes at the
bottom of this file for the exact diff needed in translation.py.

events_from(db, job_id, offset) is a stateless `WHERE seq > offset` query —
replay-safe across SSE reconnects AND server restarts, unlike the old
in-memory list (which is replay-safe across reconnects within the same
process, but gone entirely if the process restarts).
"""

from typing import Any, Optional

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models.job import JobEvent, TranslationJob


async def create_job(
    db: AsyncSession,
    *,
    file_type: str,
    source_lang: str,
    target_lang: str,
    file_name: Optional[str] = None,
    glossary_id: Optional[str] = None,
    tm_id: Optional[str] = None,
    user_id: Optional[str] = None,
) -> str:
    job = TranslationJob(
        file_type=file_type,
        file_name=file_name,
        source_lang=source_lang,
        target_lang=target_lang,
        glossary_id=glossary_id,
        tm_id=tm_id,
        user_id=user_id,
        status="running",
    )
    db.add(job)
    await db.commit()
    return job.id


async def get(db: AsyncSession, job_id: str) -> Optional[TranslationJob]:
    return await db.get(TranslationJob, job_id)


async def append_event(db: AsyncSession, job_id: str, event: dict[str, Any]) -> None:
    # next seq for this job — fine at current scale; move to a per-job
    # counter column with SELECT ... FOR UPDATE if job fan-out gets heavy
    # enough for this to race under concurrent writers.
    result = await db.execute(select(func.max(JobEvent.seq)).where(JobEvent.job_id == job_id))
    next_seq = (result.scalar() or 0) + 1
    db.add(JobEvent(job_id=job_id, seq=next_seq, type=event.get("type", "progress"), payload=event))
    await db.commit()


async def events_from(db: AsyncSession, job_id: str, offset: int) -> list[dict[str, Any]]:
    result = await db.execute(
        select(JobEvent).where(JobEvent.job_id == job_id, JobEvent.seq > offset).order_by(JobEvent.seq)
    )
    events = result.scalars().all()
    return [e.payload for e in events]


async def mark_done(db: AsyncSession, job_id: str, result: dict[str, Any]) -> None:
    job = await db.get(TranslationJob, job_id)
    if job is None:
        return
    job.status = "done"
    job.result = result
    await db.commit()


async def mark_error(db: AsyncSession, job_id: str, error: str) -> None:
    job = await db.get(TranslationJob, job_id)
    if job is None:
        return
    job.status = "error"
    job.error = error
    await db.commit()


async def request_cancel(db: AsyncSession, job_id: str) -> bool:
    job = await db.get(TranslationJob, job_id)
    if job is None:
        return False
    job.cancelled = True
    job.status = "cancelled"
    await db.commit()
    return True


async def is_cancelled(db: AsyncSession, job_id: str) -> bool:
    job = await db.get(TranslationJob, job_id)
    if job is None:
        return True  # unknown job => treat as cancelled, stop work
    return job.cancelled


async def status(db: AsyncSession, job_id: str) -> Optional[str]:
    job = await db.get(TranslationJob, job_id)
    return job.status if job else None

