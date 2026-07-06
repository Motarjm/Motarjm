"""
In-memory job store for long-running translation jobs.

Purpose: decouple the *translation work* from the *HTTP connection* that
kicked it off, so a browser refresh/tab-close no longer kills an in-flight
translation. Only an explicit cancel request should stop a job.

This is intentionally a simple single-process store (a plain dict). If you
later run multiple worker processes behind a load balancer, swap this for
Redis (or similar) using the same get/set/append interface — nothing above
this module needs to change.
"""

import time
import uuid
from typing import Any, Dict, List, Optional


class JobStore:
    def __init__(self):
        self._jobs: Dict[str, Dict[str, Any]] = {}

    def create_job(self) -> str:
        job_id = str(uuid.uuid4())
        self._jobs[job_id] = {
            "status": "running",       # running | done | error | cancelled
            "events": [],              # list of event dicts, in order
            "cancelled": False,
            "result": None,            # final payload once status == done
            "error": None,
            "created_at": time.time(),
        }
        return job_id

    def get(self, job_id: str) -> Optional[Dict[str, Any]]:
        return self._jobs.get(job_id)

    def append_event(self, job_id: str, event: Dict[str, Any]) -> None:
        job = self._jobs.get(job_id)
        if job is None:
            return
        job["events"].append(event)

    def events_from(self, job_id: str, offset: int) -> List[Dict[str, Any]]:
        """Return events after the given offset, plus the new offset."""
        job = self._jobs.get(job_id)
        if job is None:
            return []
        return job["events"][offset:]

    def mark_done(self, job_id: str, result: Dict[str, Any]) -> None:
        job = self._jobs.get(job_id)
        if job is None:
            return
        job["status"] = "done"
        job["result"] = result

    def mark_error(self, job_id: str, error: str) -> None:
        job = self._jobs.get(job_id)
        if job is None:
            return
        job["status"] = "error"
        job["error"] = error

    def request_cancel(self, job_id: str) -> bool:
        job = self._jobs.get(job_id)
        if job is None:
            return False
        job["cancelled"] = True
        job["status"] = "cancelled"
        return True

    def is_cancelled(self, job_id: str) -> bool:
        job = self._jobs.get(job_id)
        if job is None:
            return True  # unknown job => treat as cancelled, stop work
        return job["cancelled"]

    def status(self, job_id: str) -> Optional[str]:
        job = self._jobs.get(job_id)
        return job["status"] if job else None

    def cleanup_older_than(self, seconds: float = 3600) -> None:
        """Optional housekeeping: call from a periodic task to avoid unbounded growth."""
        now = time.time()
        stale = [jid for jid, j in self._jobs.items() if now - j["created_at"] > seconds]
        for jid in stale:
            del self._jobs[jid]


# Single shared instance for the app. Import this everywhere you need job state.
job_store = JobStore()