# Synapse Web — multi-stage build.
#
# Stage 1: Node, builds the React app.
# Stage 2: Caddy, serves the built static assets and reverse-proxies
#          /v1/* + /v1/ws to the api container.

FROM node:22-alpine AS builder

WORKDIR /app

RUN corepack enable

COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

COPY tsconfig.json tsconfig.app.json tsconfig.node.json vite.config.ts index.html ./
COPY src ./src
COPY public ./public

RUN pnpm build

# ---

FROM caddy:2-alpine AS web

COPY --from=builder /app/dist /srv
COPY Caddyfile /etc/caddy/Caddyfile

EXPOSE 8080

CMD ["caddy", "run", "--config", "/etc/caddy/Caddyfile", "--adapter", "caddyfile"]
