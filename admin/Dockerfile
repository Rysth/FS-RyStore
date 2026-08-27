# Build stage
FROM oven/bun:1.2.17 AS build

WORKDIR /app

# Accept build arguments
ARG VITE_API_URL
ENV VITE_API_URL=$VITE_API_URL

COPY package*.json ./
RUN bun install

COPY . .
RUN bun run build:prod

# Production stage
FROM nginx:alpine

ENV ADMIN_SERVER_NAME=admin.example.com \
    API_UPSTREAM_SCHEME=https \
    API_UPSTREAM_HOST=api.example.com \
    API_UPSTREAM_PORT=443

# Copy built files to nginx html directory
COPY --from=build /app/dist /usr/share/nginx/html

# Copy nginx template configuration
COPY nginx.conf /etc/nginx/templates/default.conf.template

EXPOSE 5173

# Start nginx
CMD ["nginx", "-g", "daemon off;"]