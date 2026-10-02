#!/bin/sh
# Runs inside the nom-nom-api container on every start.
#
# 1. Applies any pending Prisma migrations against the Postgres container.
#    - Uses the LOCAL prisma binary from node_modules/.bin (installed with
#      --shamefully-hoist so it sits at the flat root, not inside .pnpm/).
#    - Never uses `npx prisma` — that downloads the latest CLI version which
#      may be a completely different major (e.g. v7 vs v5) and breaks the schema.
# 2. Starts the compiled Node server.

set -e

echo "[entrypoint] Running Prisma migrations..."
/app/node_modules/.bin/prisma migrate deploy

echo "[entrypoint] Starting API server..."
exec node dist/index.js
