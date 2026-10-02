# ─── Stage 1: Build ──────────────────────────────────────────────────────────
# Installs ALL dependencies (dev + prod) and compiles TypeScript.
# Podman note: runs rootless by default — no privileged instructions used here.
FROM node:20-alpine AS builder

WORKDIR /app

# Install pnpm globally
RUN npm install -g pnpm

# Copy workspace manifests first (layer-cache friendly)
COPY package.json pnpm-workspace.yaml ./
COPY apps/api/package.json ./apps/api/

# Install all deps (dev included — needed for tsc + prisma generate).
# No --frozen-lockfile: project does not commit a lockfile.
RUN pnpm install

# Copy the full API source
COPY apps/api ./apps/api

# Generate Prisma client (must run after source copy so schema.prisma is present)
RUN pnpm --filter api db:generate

# Compile TypeScript → dist/
RUN pnpm --filter api build

# ─── Stage 2: Production ─────────────────────────────────────────────────────
# Lean image — only the compiled output, Prisma client, and production node_modules.
FROM node:20-alpine AS runner

# Non-root user — aligns with Podman's rootless model and is a security best-practice.
RUN addgroup -S appgroup && adduser -S appuser -G appgroup

WORKDIR /app

# Copy workspace manifests (needed so pnpm workspace resolution works at runtime)
COPY package.json pnpm-workspace.yaml ./
COPY apps/api/package.json ./apps/api/

# Copy the full node_modules from the builder stage instead of re-running pnpm install.
# This is faster, avoids a second network fetch inside the container, and works
# reliably in rootless Podman where home-dir write permissions can vary.
COPY --from=builder /app/node_modules ./node_modules

# Copy compiled JS output
COPY --from=builder /app/apps/api/dist ./apps/api/dist

# Copy Prisma schema + generated client (both needed at runtime for migrate & query)
COPY --from=builder /app/apps/api/prisma ./apps/api/prisma
COPY --from=builder /app/node_modules/.pnpm ./node_modules/.pnpm

# Entrypoint script: runs pending migrations then starts the server.
# Using a shell script lets podman-compose restart the container cleanly on failure.
COPY apps/api/docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

# Hand everything over to the non-root user
RUN chown -R appuser:appgroup /app

USER appuser

WORKDIR /app/apps/api

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
  CMD wget -qO- http://localhost:3000/health || exit 1

ENTRYPOINT ["docker-entrypoint.sh"]
