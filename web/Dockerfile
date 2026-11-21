# HQ (hq.ridwansharif.com) — one Dockerfile, two images:
#   target "runner" → the web app (small: Next.js standalone server only)
#   target "tools"  → migrations, seed, vault import (full node_modules + scripts)
# Debian slim (not Alpine) so Prisma's engines match glibc + OpenSSL 3 with no extra config.

FROM node:22-bookworm-slim AS base
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

# ── deps: install once, cached until package-lock.json changes ──────────────
FROM base AS deps
COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN npm ci --no-audit --no-fund

# ── build: compile the Next.js app ──────────────────────────────────────────
FROM deps AS build
COPY . .
RUN npx prisma generate && npm run build

# ── tools: one-shot jobs (docker compose run --rm tools …) ──────────────────
FROM build AS tools
ENV NODE_ENV=production
USER node
CMD ["npx", "prisma", "migrate", "deploy"]

# ── runner: what actually serves the site ───────────────────────────────────
FROM base AS runner
ENV NODE_ENV=production PORT=3000 HOSTNAME=0.0.0.0
COPY --from=build --chown=node:node /app/.next/standalone ./
COPY --from=build --chown=node:node /app/.next/static ./.next/static
COPY --from=build --chown=node:node /app/public ./public
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/login').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server.js"]
