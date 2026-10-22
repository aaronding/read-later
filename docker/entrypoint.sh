#!/bin/sh
# One image, three jobs: `web` (the Next.js app), `worker` (background jobs)
# and `migrate` (apply database migrations). docker-compose.yml picks one.
set -e
cd /app/apps/web
case "$1" in
  web)
    exec node node_modules/next/dist/bin/next start -H 0.0.0.0 -p "${PORT:-3000}"
    ;;
  worker)
    exec node node_modules/tsx/dist/cli.mjs src/worker.ts
    ;;
  migrate)
    exec node node_modules/tsx/dist/cli.mjs src/db/migrate.ts
    ;;
  *)
    exec "$@"
    ;;
esac
