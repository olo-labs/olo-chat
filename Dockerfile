# Copyright (c) 2026 Olo Labs
# SPDX-License-Identifier: Apache-2.0

# Build stage: install deps and build the Vite app with env vars baked in
FROM node:20-alpine AS builder

WORKDIR /app

# Build-time args (passed at docker build --build-arg or from CI). Defaults for local build.
ARG VITE_API_BASE=http://localhost:7080
ARG VITE_WS_ACCESS_TOKEN=
ARG VITE_WS_PING_INTERVAL_SEC=10

ENV VITE_API_BASE=${VITE_API_BASE}
ENV VITE_WS_ACCESS_TOKEN=${VITE_WS_ACCESS_TOKEN}
ENV VITE_WS_PING_INTERVAL_SEC=${VITE_WS_PING_INTERVAL_SEC}

COPY package.json package-lock.json* ./
RUN if [ -f package-lock.json ]; then npm ci; else npm install; fi

COPY . .
RUN npm run build

# Production stage: serve static files with nginx
FROM nginx:alpine

# Copy built assets from builder
COPY --from=builder /app/dist /usr/share/nginx/html

# SPA: serve index.html for client-side routes
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
