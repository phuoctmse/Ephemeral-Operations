# ========================================
# Multi-Stage Dockerfile for NestJS + Prisma
# EphOps Application
# ========================================

ARG NODE_VERSION=22-alpine
FROM node:${NODE_VERSION} AS base

# Set working directory
WORKDIR /app

# Image metadata
LABEL org.opencontainers.image.title="EphOps"
LABEL org.opencontainers.image.description="NestJS + Prisma application image"
LABEL org.opencontainers.image.version="0.0.1"

# Install OpenSSL for Prisma (required in Alpine)
RUN apk add --no-cache openssl

# Create non-root user for security
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001 -G nodejs && \
    true

# ========================================
# Production Dependencies Stage
# ========================================
FROM base AS deps

# Copy package files
COPY --chown=nodejs:nodejs package*.json ./

# Install production dependencies
RUN --mount=type=cache,target=/root/.npm,sharing=locked \
    npm ci --omit=dev --ignore-scripts && \
    npm cache clean --force

# ========================================
# Build Dependencies Stage
# ========================================
FROM base AS build-deps

# Copy package files
COPY --chown=nodejs:nodejs package*.json ./

# Install all dependencies
RUN --mount=type=cache,target=/root/.npm,sharing=locked \
    npm ci --no-audit --no-fund && \
    npm cache clean --force

# ========================================
# Build Stage
# ========================================
FROM build-deps AS build

# Copy Prisma schema and config (needed for generation)
COPY --chown=nodejs:nodejs prisma ./prisma/
COPY --chown=nodejs:nodejs prisma.config.ts ./

# Generate Prisma Client
RUN npx prisma generate

# Copy source files
COPY --chown=nodejs:nodejs . .

# Build the NestJS application
RUN npm run build

# ========================================
# Development Stage
# ========================================
FROM build-deps AS development

# Set environment
ENV NODE_ENV=development \
    NPM_CONFIG_LOGLEVEL=warn

# Copy Prisma files and generate client
COPY --chown=nodejs:nodejs prisma ./prisma/
COPY --chown=nodejs:nodejs prisma.config.ts ./
RUN npx prisma generate

# Copy source files
COPY --chown=nodejs:nodejs . .

# Switch to non-root user
USER nodejs

# Expose port
EXPOSE 3000

# Start development server with hot reload
CMD ["npm", "run", "start:dev"]

# ========================================
# Production Stage
# ========================================
FROM base AS production

# Set optimized environment variables
ENV NODE_ENV=production \
    NODE_OPTIONS="--max-old-space-size=512 --no-warnings" \
    NPM_CONFIG_LOGLEVEL=silent

# Copy production dependencies
COPY --from=deps --chown=nodejs:nodejs /app/node_modules ./node_modules
COPY --from=deps --chown=nodejs:nodejs /app/package*.json ./

# Copy generated Prisma Client from build stage
COPY --from=build --chown=nodejs:nodejs /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=build --chown=nodejs:nodejs /app/node_modules/@prisma ./node_modules/@prisma

# Copy built application
COPY --from=build --chown=nodejs:nodejs /app/dist ./dist

# Copy Prisma schema for runtime migrations/introspection if needed
COPY --from=build --chown=nodejs:nodejs /app/prisma ./prisma
COPY --from=build --chown=nodejs:nodejs /app/prisma.config.ts ./

# Switch to non-root user
USER nodejs

# Expose port
EXPOSE 3000

# Start production server
CMD ["node", "dist/src/main"]

# ========================================
# Test Stage
# ========================================
FROM build-deps AS test

# Set environment
ENV NODE_ENV=test \
    CI=true

# Copy Prisma files and generate client
COPY --chown=nodejs:nodejs prisma ./prisma/
COPY --chown=nodejs:nodejs prisma.config.ts ./
RUN npx prisma generate

# Copy source files
COPY --chown=nodejs:nodejs . .

# Switch to non-root user
USER nodejs

# Run tests with coverage
CMD ["npm", "run", "test:cov"]
