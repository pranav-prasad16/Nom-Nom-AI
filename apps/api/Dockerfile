# ─── Stage 1: Build ──────────────────────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

# Build tools for native addons:
#   python3 + make + g++ → needed to compile bcrypt from source (no musl prebuilt)
#   openssl + openssl-dev → needed by @prisma/engines at install time
RUN apk add --no-cache python3 make g++ openssl openssl-dev

# Pin pnpm to 9.14 — the last version where onlyBuiltDependencies lives in
# package.json. v9.15+ moved it to pnpm-workspace.yaml which isn't reliably
# read inside Docker build layers.
RUN npm install -g pnpm@9.14

# Copy manifests before source for layer-cache efficiency.
COPY package.json pnpm-workspace.yaml .npmrc ./
COPY apps/api/package.json ./apps/api/

# --shamefully-hoist: writes ALL packages flat into node_modules/ (npm-style).
# Without this, pnpm uses symlinks into node_modules/.pnpm — those symlinks are
# not preserved when COPY transfers the directory to the runner stage.
RUN pnpm install --shamefully-hoist

# Copy source + schema, generate Prisma client, compile TypeScript
COPY apps/api ./apps/api
RUN pnpm --filter api db:generate
RUN pnpm --filter api build

# ─── Stage 2: Production ─────────────────────────────────────────────────────
FROM node:20-alpine AS runner

# openssl at runtime: @prisma/client needs it to talk to Postgres over TLS.
# Non-root user: aligns with Podman rootless and is a security best-practice.
RUN apk add --no-cache openssl && \
    addgroup -S appgroup && adduser -S appuser -G appgroup

WORKDIR /app

# Workspace manifests
COPY package.json pnpm-workspace.yaml .npmrc ./
COPY apps/api/package.json ./apps/api/

# Flat node_modules copied directly — no pnpm, no network, no symlink issues.
COPY --from=builder /app/node_modules         ./node_modules

# Compiled JS
COPY --from=builder /app/apps/api/dist        ./apps/api/dist

# Prisma schema + generated client (both needed at runtime)
COPY --from=builder /app/apps/api/prisma      ./apps/api/prisma

# Entrypoint: runs migrations, then starts the server
COPY apps/api/docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

RUN chown -R appuser:appgroup /app
USER appuser

WORKDIR /app/apps/api

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
  CMD wget -qO- http://localhost:3000/health || exit 1

ENTRYPOINT ["docker-entrypoint.sh"]
