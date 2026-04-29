# ========================================
# packages/api/Dockerfile
# Build context: repo root (for pnpm workspace)
# ========================================

ARG NODE_VERSION=22-alpine
ARG PNPM_VERSION=9

# ── Base ────────────────────────────────
FROM node:${NODE_VERSION} AS base
ARG PNPM_VERSION
RUN corepack enable && corepack prepare pnpm@${PNPM_VERSION} --activate
RUN apk add --no-cache openssl
RUN addgroup -g 1001 -S nodejs && adduser -S nodejs -u 1001 -G nodejs
WORKDIR /app

# ── Install all deps (cached layer) ─────
FROM base AS deps
COPY .npmrc pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY packages/api/package.json          packages/api/
COPY packages/shared-types/package.json packages/shared-types/
RUN pnpm install --frozen-lockfile

# ── Install prod deps only ───────────────
FROM base AS prod-deps
COPY .npmrc pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY packages/api/package.json          packages/api/
COPY packages/shared-types/package.json packages/shared-types/
RUN pnpm install --frozen-lockfile --prod

# ── Build ────────────────────────────────
FROM deps AS build
COPY prisma ./prisma/
COPY prisma.config.ts ./
COPY packages/shared-types packages/shared-types/
COPY packages/api           packages/api/
RUN pnpm --filter @ephops/api exec prisma generate --schema=/app/prisma/schema.prisma
RUN pnpm --filter @ephops/api run build

# ── Development ──────────────────────────
FROM deps AS development
ENV NODE_ENV=development
COPY prisma ./prisma/
COPY packages/shared-types packages/shared-types/
COPY packages/api           packages/api/
RUN pnpm --filter @ephops/api exec prisma generate --schema=/app/prisma/schema.prisma
USER nodejs
EXPOSE 3000
CMD ["pnpm", "--filter", "@ephops/api", "run", "start:dev"]

# ── Test ─────────────────────────────────
FROM deps AS test
ENV NODE_ENV=test CI=true
COPY prisma ./prisma/
COPY packages/shared-types packages/shared-types/
COPY packages/api           packages/api/
RUN pnpm --filter @ephops/api exec prisma generate --schema=/app/prisma/schema.prisma
RUN pnpm --filter @ephops/api run test:cov

# ── Production ───────────────────────────
FROM base AS production
ENV NODE_ENV=production \
    NODE_OPTIONS="--max-old-space-size=512 --no-warnings"

COPY --from=build --chown=nodejs:nodejs /app/node_modules       ./node_modules
COPY --from=build --chown=nodejs:nodejs /app/packages/api/dist  ./packages/api/dist
COPY --from=build --chown=nodejs:nodejs /app/packages/shared-types ./packages/shared-types
COPY --from=build --chown=nodejs:nodejs /app/prisma             ./prisma
COPY --from=build --chown=nodejs:nodejs /app/prisma.config.ts   ./
COPY --chown=nodejs:nodejs packages/api/package.json ./packages/api/
COPY --chown=nodejs:nodejs package.json ./

USER nodejs
EXPOSE 3000
CMD ["node", "packages/api/dist/main"]
