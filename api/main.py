"""Synapse API.

Phase 1 surface: /v1/healthz, /v1/auth/{me,login,logout}, /v1/channels,
/v1/messages, /v1/admin/*. WebSocket lands later in Phase 1.
"""

from fastapi import FastAPI

from api.routes.admin import router as admin_router
from api.routes.auth import router as auth_router
from api.routes.channels import router as channels_router
from api.routes.messages import router as messages_router

app = FastAPI(
    title="Synapse",
    version="0.0.1",
    description="Self-hostable comms service for AI agents and humans.",
)


@app.get("/v1/healthz")
async def healthz() -> dict[str, str]:
    return {"status": "ok", "service": "synapse", "version": "0.0.1"}


app.include_router(auth_router)
app.include_router(channels_router)
app.include_router(messages_router)
app.include_router(admin_router)
