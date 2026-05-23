# syntax=docker/dockerfile:1

# ── Stage 1: install deps + build ────────────────────────────────────────────
FROM node:22-alpine AS builder
WORKDIR /app

# Install dependencies first (layer-cached unless package files change).
COPY package.json package-lock.json ./
RUN npm ci

# Copy source and build.
COPY . .

# DOCKER_BUILD=1 activates `output: 'standalone'` in next.config.ts,
# producing a self-contained server in .next/standalone.
RUN DOCKER_BUILD=1 npm run build

# ── Stage 2: minimal runtime image ───────────────────────────────────────────
FROM node:22-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# Create a non-root user for security.
RUN addgroup --system --gid 1001 nodejs && \
    adduser  --system --uid 1001 nextjs

# Copy only what Next.js standalone needs.
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static    ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public          ./public

# Persistent data directory (SQLite + backups).
RUN mkdir -p /app/data && chown nextjs:nodejs /app/data

USER nextjs
EXPOSE 3000

CMD ["node", "server.js"]
