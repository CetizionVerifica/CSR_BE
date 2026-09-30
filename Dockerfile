# ResiliSense API image — runs as `api` (default) or `worker` (CMD override). Deployed with Kamal (ADR-011).
FROM node:24-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY prisma ./prisma
COPY prisma.config.ts ./
RUN npm ci
COPY . .
RUN npm run build

# Migration image: keeps the Prisma CLI (dev dependency). Kamal runs it before each deploy:
#   docker run --rm <image>:migrate  → prisma migrate deploy
FROM build AS migrate
CMD ["npx", "prisma", "migrate", "deploy"]

FROM build AS prod-deps
RUN npm prune --omit=dev

FROM node:24-bookworm-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends tini ca-certificates && rm -rf /var/lib/apt/lists/*
COPY --from=prod-deps --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
COPY --from=build --chown=node:node /app/prisma ./prisma
COPY --from=build --chown=node:node /app/prisma.config.ts /app/package.json ./
USER node
EXPOSE 4000
HEALTHCHECK --interval=15s --timeout=3s --retries=3 CMD node -e "fetch('http://localhost:4000/v1/health/live').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["node", "dist/src/main.js"]
