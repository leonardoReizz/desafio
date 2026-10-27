# syntax=docker/dockerfile:1.7
# Imagem de produção: build no GitHub Actions, CapRover só puxa e roda.
# Um container com os dois processos: app web (porta 3000, pública) e serviço de chamados
# (127.0.0.1:4001, só interno). Bancos SQLite em /data — mapeie como diretório persistente.

FROM node:22-bookworm-slim AS base
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH NEXT_TELEMETRY_DISABLED=1
RUN corepack enable
WORKDIR /repo

# Dependências do monorepo (better-sqlite3 é nativo: toolchain caso não haja binário pronto)
FROM base AS deps
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/web/package.json apps/web/
COPY services/tickets/package.json services/tickets/
COPY packages/contracts/package.json packages/contracts/
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile

FROM deps AS builder
COPY . .
RUN NEXT_OUTPUT=standalone pnpm --filter @nexo/web build
# Serviço de chamados com só as dependências de produção (inclui @nexo/contracts)
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm --filter @nexo/tickets deploy --prod --legacy /out/tickets

FROM node:22-bookworm-slim AS runner
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    APP_DB_PATH=/data/app.db \
    TICKETS_DB_PATH=/data/tickets.db \
    TICKETS_HOST=127.0.0.1 \
    TICKETS_PORT=4001 \
    TICKETS_SERVICE_URL=http://127.0.0.1:4001
WORKDIR /app
COPY --from=builder --chown=node:node /repo/apps/web/.next/standalone ./web
COPY --from=builder --chown=node:node /repo/apps/web/.next/static ./web/apps/web/.next/static
COPY --from=builder --chown=node:node /out/tickets ./tickets
COPY --chown=node:node docker/start.mjs ./start.mjs
RUN mkdir -p /data && chown node:node /data
USER node
VOLUME /data
EXPOSE 3000
CMD ["node", "start.mjs"]
