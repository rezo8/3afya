FROM node:22-alpine AS builder

RUN corepack enable && corepack prepare pnpm@11.10.0 --activate

WORKDIR /app

COPY pnpm-workspace.yaml pnpm-lock.yaml package.json turbo.json ./
COPY packages/ packages/
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json

RUN pnpm install --frozen-lockfile

COPY apps/api/ apps/api/
COPY apps/web/ apps/web/

RUN pnpm --filter @afya/web build

FROM node:22-alpine AS runner

RUN corepack enable && corepack prepare pnpm@11.10.0 --activate

WORKDIR /app

COPY --from=builder /app/pnpm-workspace.yaml ./
COPY --from=builder /app/pnpm-lock.yaml ./
COPY --from=builder /app/package.json ./
COPY --from=builder /app/turbo.json ./
COPY --from=builder /app/packages/ packages/

COPY --from=builder /app/apps/api/ apps/api/
COPY --from=builder /app/node_modules/ node_modules/

COPY --from=builder /app/apps/web/dist/ web-dist/

ENV NODE_ENV=production
ENV PORT=3001
EXPOSE 3001

CMD ["apps/api/node_modules/.bin/tsx", "apps/api/src/server.ts"]
