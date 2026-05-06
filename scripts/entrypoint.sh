#!/bin/sh
# Container entrypoint — runs migrations to head, then starts uvicorn.
# Idempotent: alembic upgrade head is safe on already-current DBs.
set -e

echo "[entrypoint] running migrations…"
alembic upgrade head

echo "[entrypoint] starting uvicorn…"
exec uvicorn api.main:app --host 0.0.0.0 --port 8000 --proxy-headers --forwarded-allow-ips='*'
