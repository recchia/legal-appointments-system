FROM node:22-slim

# Install OpenSSL — required by Prisma on Debian slim
RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable

WORKDIR /app

# ── Dependency layer ──────────────────────────────────────────────────────────
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY apps/api/package.json ./apps/api/
COPY packages/shared/package.json ./packages/shared/

RUN pnpm install --frozen-lockfile

# ── Source layer ──────────────────────────────────────────────────────────────
COPY packages/shared ./packages/shared
COPY apps/api ./apps/api

RUN pnpm --filter api exec prisma generate

WORKDIR /app/apps/api

EXPOSE 3000

CMD ["sh", "-c", \
  "pnpm exec prisma migrate deploy && \
   pnpm exec tsx src/index.ts"]
