# Agora API — multi-stage build.
# Phase 1 stub. Adds React build stage in a later commit (web/).

FROM python:3.12-slim AS api

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

WORKDIR /app

# System deps for argon2 + websockets
RUN apt-get update \
    && apt-get install -y --no-install-recommends build-essential \
    && rm -rf /var/lib/apt/lists/*

COPY pyproject.toml ./
RUN pip install --no-cache-dir \
    "fastapi>=0.115" \
    "uvicorn[standard]>=0.30" \
    "sqlalchemy>=2.0" \
    "alembic>=1.13" \
    "argon2-cffi>=23.1" \
    "pydantic>=2.7" \
    "pydantic-settings>=2.4" \
    "python-multipart>=0.0.9" \
    "websockets>=12" \
    "httpx>=0.27"

COPY api ./api
COPY migrations ./migrations
COPY alembic.ini ./alembic.ini
COPY scripts/entrypoint.sh ./entrypoint.sh
RUN chmod +x ./entrypoint.sh

EXPOSE 8000

CMD ["./entrypoint.sh"]
