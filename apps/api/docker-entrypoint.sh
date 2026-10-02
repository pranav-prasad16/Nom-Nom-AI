#!/bin/sh
# docker-entrypoint.sh
# Runs inside the nom-nom-api container on every start.
#
# Steps:
#   1. Apply any pending Prisma migrations (safe to run on an already-migrated DB).
#   2. Start the Node server.
#
# Podman note: this script runs as appuser (non-root), which is fine because
# Prisma migrate deploy only writes to the DB (no filesystem root access needed).

set -e

echo "[entrypoint] Running Prisma migrations..."
npx prisma migrate deploy

echo "[entrypoint] Starting API server..."
exec node dist/index.js
