import asyncio
import json
import os
import uuid
from datetime import datetime, timedelta
from enum import Enum

import httpx
from fastapi import FastAPI, HTTPException

app = FastAPI(title="Pipeline Webhook Server")

BASE_DIR = os.path.dirname(os.path.abspath(__file__))

ALLOWED_PIPELINES = ("p2m", "i2v")

CONFIG_PATH = os.path.join(BASE_DIR, "config.json")

def load_config():
    with open(CONFIG_PATH, "r", encoding="utf-8") as f:
        return json.load(f)


class TaskStatus(str, Enum):
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"


tasks: dict[str, dict] = {}
pipeline_locks: dict[str, asyncio.Lock] = {}


@app.on_event("startup")
async def startup():
    for p in ALLOWED_PIPELINES:
        pipeline_locks[p] = asyncio.Lock()


def cleanup_old_tasks():
    cutoff = datetime.utcnow() - timedelta(hours=24)
    expired = [
        tid for tid, t in tasks.items()
        if t["status"] != TaskStatus.RUNNING
        and datetime.fromisoformat(t["started_at"]) < cutoff
    ]
    for tid in expired:
        del tasks[tid]


async def run_pipeline(task_id: str, pipeline: str):
    try:
        async with pipeline_locks[pipeline]:
            cwd = os.path.join(BASE_DIR, f"{pipeline}-pipeline")
            proc = await asyncio.create_subprocess_exec(
                "node", "index.js",
                cwd=cwd,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.STDOUT,
            )

            output_lines = []
            async for line in proc.stdout:
                decoded = line.decode("utf-8", errors="replace")
                output_lines.append(decoded)
                tasks[task_id]["logs"] = "".join(output_lines)

            await proc.wait()

            tasks[task_id]["return_code"] = proc.returncode
            tasks[task_id]["status"] = (
                TaskStatus.COMPLETED if proc.returncode == 0
                else TaskStatus.FAILED
            )
            tasks[task_id]["finished_at"] = datetime.utcnow().isoformat()
    except Exception as e:
        tasks[task_id]["status"] = TaskStatus.FAILED
        tasks[task_id]["logs"] += f"\n[Server Error] {e}"
        tasks[task_id]["finished_at"] = datetime.utcnow().isoformat()

    # Notify n8n via webhook
    try:
        config = load_config()
        n8n_base = config.get("n8n", {}).get("base_url", "")
        if n8n_base:
            callback_url = f"{n8n_base.rstrip('/')}/webhook/{pipeline}-done"
            async with httpx.AsyncClient(timeout=30) as client:
                await client.post(callback_url, json={
                    "task_id": task_id,
                    "pipeline": pipeline,
                    "status": tasks[task_id]["status"],
                    "return_code": tasks[task_id]["return_code"],
                    "finished_at": tasks[task_id]["finished_at"],
                })
    except Exception as e:
        print(f"[Callback Error] {e}")


@app.post("/webhook/{pipeline}")
async def trigger_pipeline(pipeline: str):
    if pipeline not in ALLOWED_PIPELINES:
        raise HTTPException(404, "Unknown pipeline")

    if pipeline_locks[pipeline].locked():
        running = next(
            (t for t in tasks.values()
             if t["pipeline"] == pipeline and t["status"] == TaskStatus.RUNNING),
            None,
        )
        raise HTTPException(409, detail={
            "error": f"{pipeline} pipeline is already running",
            "running_task_id": running["task_id"] if running else None,
        })

    cleanup_old_tasks()

    task_id = str(uuid.uuid4())
    tasks[task_id] = {
        "task_id": task_id,
        "pipeline": pipeline,
        "status": TaskStatus.RUNNING,
        "started_at": datetime.utcnow().isoformat(),
        "finished_at": None,
        "logs": "",
        "return_code": None,
    }

    asyncio.create_task(run_pipeline(task_id, pipeline))

    return {"task_id": task_id, "status": "started"}


@app.get("/status/{task_id}")
async def get_status(task_id: str):
    if task_id not in tasks:
        raise HTTPException(404, "Task not found")
    return tasks[task_id]


@app.get("/tasks")
async def list_tasks(limit: int = 20):
    sorted_tasks = sorted(
        tasks.values(),
        key=lambda t: t["started_at"],
        reverse=True,
    )
    return sorted_tasks[:limit]


@app.get("/health")
async def health():
    return {
        "status": "ok",
        "p2m_busy": pipeline_locks.get("p2m", asyncio.Lock()).locked(),
        "i2v_busy": pipeline_locks.get("i2v", asyncio.Lock()).locked(),
    }
