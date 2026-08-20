"""Polled-job registry for long-running toolchain subprocesses.

A job wraps one subprocess (arduino-cli compile, esptool write_flash...).
Stdout/stderr lines are appended to the job record; the frontend polls
GET /devicelab/jobs/{id}?after=N for the tail. Mirrors the job pattern in
ash-mesh's sketch-routes.js / device-flash-routes.js, ported to Python.
"""

import subprocess
import threading
import time
import uuid
from dataclasses import dataclass, field
from typing import Any, Callable, Dict, List, Optional

MAX_LOG_LINES = 4000


@dataclass
class Job:
    id: str
    kind: str  # "build" | "flash"
    status: str = "queued"  # queued | running | ok | error | cancelled
    exit_code: Optional[int] = None
    lines: List[str] = field(default_factory=list)
    result: Dict[str, Any] = field(default_factory=dict)
    created: float = field(default_factory=time.time)
    finished: Optional[float] = None
    _proc: Optional[subprocess.Popen] = None
    _lock: threading.Lock = field(default_factory=threading.Lock)

    def append(self, line: str) -> None:
        with self._lock:
            self.lines.append(line)
            if len(self.lines) > MAX_LOG_LINES:
                del self.lines[: len(self.lines) - MAX_LOG_LINES]

    def snapshot(self, after: int = 0) -> Dict[str, Any]:
        with self._lock:
            return {
                "id": self.id,
                "kind": self.kind,
                "status": self.status,
                "exitCode": self.exit_code,
                "lineCount": len(self.lines),
                "lines": self.lines[after:],
                "result": self.result,
            }


JOBS: Dict[str, Job] = {}


def create_job(kind: str) -> Job:
    job = Job(id=uuid.uuid4().hex[:12], kind=kind)
    JOBS[job.id] = job
    return job


def get_job(job_id: str) -> Optional[Job]:
    return JOBS.get(job_id)


def cancel_job(job_id: str) -> bool:
    job = JOBS.get(job_id)
    if not job or job.status != "running" or job._proc is None:
        return False
    job._proc.kill()
    job.status = "cancelled"
    return True


def run_subprocess_job(
    job: Job,
    argv: List[str],
    cwd: Optional[str] = None,
    display_argv: Optional[List[str]] = None,
    on_success: Optional[Callable[[Job], None]] = None,
) -> None:
    """Run argv in a daemon thread, streaming output into the job record.

    `display_argv` is what gets echoed to the log — pass a redacted copy
    when argv carries secrets (e.g. -DWIFI_PSK compile defines).
    """

    def worker() -> None:
        job.status = "running"
        job.append("$ " + " ".join(display_argv or argv))
        try:
            # argv-only, never shell=True: nothing client-supplied reaches a shell.
            proc = subprocess.Popen(
                argv,
                cwd=cwd,
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                text=True,
                encoding="utf-8",
                errors="replace",
            )
            job._proc = proc
            assert proc.stdout is not None
            for line in proc.stdout:
                job.append(line.rstrip("\r\n"))
            proc.wait()
            job.exit_code = proc.returncode
            if job.status == "cancelled":
                pass
            elif proc.returncode == 0:
                if on_success:
                    on_success(job)
                job.status = "ok"
            else:
                job.status = "error"
        except FileNotFoundError:
            job.append(f"error: executable not found: {argv[0]}")
            job.status = "error"
        except Exception as exc:  # surface, don't crash the server
            job.append(f"error: {exc}")
            job.status = "error"
        finally:
            job.finished = time.time()

    threading.Thread(target=worker, daemon=True).start()
