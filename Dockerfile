# Stage 1: Build frontend
# WORKDIR is /build/frontend (not /build) because vite.config.js sets
# outDir: '../dist', which must resolve to /build/dist to match the
# COPY --from=frontend line below.
FROM node:20-alpine AS frontend
WORKDIR /build/frontend
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# Stage 2: Backend
FROM python:3.12-slim
WORKDIR /app/backend

# Node.js/npm are required to run npx-based MCP servers (filesystem, github, ...)
RUN apt-get update && apt-get install -y --no-install-recommends nodejs npm \
    && rm -rf /var/lib/apt/lists/*

COPY backend/requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY backend/ ./
COPY --from=frontend /build/dist /app/dist
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

EXPOSE 5000
ENTRYPOINT ["/entrypoint.sh"]
