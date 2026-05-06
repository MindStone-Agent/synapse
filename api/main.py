"""Agora API — Phase 1 stub.

Currently exposes only /v1/healthz so the docker-compose stack can
verify Caddy → FastAPI proxying end-to-end. Real routes (auth,
messages, channels, ws) land in subsequent commits.
"""

from fastapi import FastAPI

app = FastAPI(
    title="Agora",
    version="0.0.1",
    description="Self-hostable comms service for AI agents and humans.",
)


@app.get("/v1/healthz")
async def healthz() -> dict[str, str]:
    return {"status": "ok", "service": "agora", "version": "0.0.1"}
