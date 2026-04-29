# ========================================
# packages/web/Dockerfile
# Build context: repo root (for pnpm workspace)
# ========================================

ARG NODE_VERSION=22-alpine
ARG PNPM_VERSION=9

# ── Base ────────────────────────────────
FROM node:${NODE_VERSION} AS base
ARG PNPM_VERSION
RUN corepack enable && corepack prepare pnpm@${PNPM_VERSION} --activate
RUN addgroup -g 1001 -S nodejs && adduser -S nodejs -u 1001 -G nodejs
WORKDIR /app

# ── Install deps (cached layer) ──────────
FROM base AS deps
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY packages/web/package.json          packages/web/
COPY packages/shared-types/package.json packages/shared-types/
RUN pnpm install --frozen-lockfile

# ── Build ────────────────────────────────
FROM deps AS build
COPY packages/shared-types packages/shared-types/
COPY packages/web           packages/web/
RUN pnpm --filter @ephops/web run build

# ── Production (nginx) ───────────────────
FROM nginx:1.28-alpine AS production

COPY --from=build /app/packages/web/dist /usr/share/nginx/html
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
