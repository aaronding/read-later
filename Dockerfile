# syntax=docker/dockerfile:1
# The web app, the worker and the migrations in one image.
#   docker build -t read-later .
FROM node:24-slim AS base
ENV NEXT_TELEMETRY_DISABLED=1
RUN corepack enable
WORKDIR /app

# Dependencies first, so they are cached until the lockfile changes.
FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/web/package.json apps/web/
COPY apps/extension/package.json apps/extension/
COPY apps/cron-worker/package.json apps/cron-worker/
COPY packages/brand/package.json packages/brand/
RUN --mount=type=cache,id=pnpm-store,target=/root/.local/share/pnpm/store \
    corepack install && pnpm install --frozen-lockfile --filter "web..."

FROM deps AS build
COPY . .
RUN pnpm --filter web build

FROM base AS runtime
ENV NODE_ENV=production
COPY --from=build --chown=node:node /app /app
COPY --chmod=755 docker/entrypoint.sh /usr/local/bin/entrypoint
USER node
EXPOSE 3000
ENTRYPOINT ["entrypoint"]
CMD ["web"]
