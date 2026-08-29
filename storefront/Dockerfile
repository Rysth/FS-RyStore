# Build stage
FROM oven/bun:1.2.17 AS build

WORKDIR /app

# PUBLIC_* vars are inlined into the client bundle at build time, so the API
# origin the browser talks to must be known here.
ARG PUBLIC_API_URL
ARG STOREFRONT_URL
ARG PUBLIC_APP_VERTICAL=store
ENV PUBLIC_API_URL=$PUBLIC_API_URL \
    STOREFRONT_URL=$STOREFRONT_URL \
    PUBLIC_APP_VERTICAL=$PUBLIC_APP_VERTICAL

COPY package.json bun.lock* ./
RUN bun install --frozen-lockfile

COPY . .
RUN bun run build

# Production stage — the Astro node adapter runs as a plain Node server.
FROM node:22-alpine AS runtime

RUN apk add --no-cache tzdata

WORKDIR /app

ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=4321

COPY --from=build /app/dist ./dist
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./package.json

EXPOSE 4321

CMD ["node", "./dist/server/entry.mjs"]
