# syntax=docker/dockerfile:1

# Node 24 runs TypeScript directly via type stripping, so this image has no
# build stage and ships no compiler. The only stage split is dependency
# installation, which keeps the npm layer cached across code changes.
FROM node:24-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm \
    npm ci --omit=dev --no-audit --no-fund

FROM node:24-alpine AS dev-deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm \
    npm ci --no-audit --no-fund

FROM node:24-alpine AS development
WORKDIR /app
ENV NODE_ENV=development
COPY --from=dev-deps --chown=node:node /app/node_modules ./node_modules
COPY --chown=node:node . .
# The `node` user is uid 1000, matching the typical host user, so files the
# container writes into the bind mount (drizzle migrations, generated schema)
# stay editable from the host instead of landing as root.
USER node
EXPOSE 3000
CMD ["npm", "run", "dev"]

FROM node:24-alpine AS production
WORKDIR /app
ENV NODE_ENV=production
# dumb-init reaps zombies and forwards SIGTERM so graceful shutdown works.
RUN apk add --no-cache dumb-init
COPY --from=deps /app/node_modules ./node_modules
COPY --chown=node:node . .
USER node
EXPOSE 3000
ENTRYPOINT ["dumb-init", "--"]
# Dependencies are baked into the image. Nothing is installed at runtime — the
# Rails setup ran `bundle install` on every container start, which is the single
# most expensive thing about the current deploys.
CMD ["node", "src/server.ts"]
