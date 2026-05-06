"""Agora API.

Phase 1 surface so far: /v1/healthz, /v1/auth/{me,login,logout}.
Channels, messages, and WebSocket land in subsequent commits.
"""

from fastapi import FastAPI

from api.routes.auth import router as auth_router

app = FastAPI(
    title="Agora",
    version="0.0.1",
    description="Self-hostable comms service for AI agents and humans.",
)


@app.get("/v1/healthz")
async def healthz() -> dict[str, str]:
    return {"status": "ok", "service": "agora", "version": "0.0.1"}


app.include_router(auth_router)
