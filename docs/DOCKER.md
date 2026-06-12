<!--
Copyright (c) 2026 Olo Labs
SPDX-License-Identifier: Apache-2.0
-->

# Docker for olo-chat (frontend)

This document describes how to build and run the olo-chat frontend as a Docker container: environment variables, Docker Compose variants, local build/run, and GitHub Actions (ghcr.io and Docker Hub).

---

## Overview

- **Dockerfile** — Multi-stage: stage 1 uses Node to build the Vite app (`npm ci`, `npm run build`); stage 2 uses Nginx to serve the static `dist` on **port 80**. No runtime env; all config is baked in at build time.
- **Environment variables** — All `VITE_*` values are **baked in at build time** by Vite. You pass them as Docker build args (or Compose `args` / CI variables). Changing the backend URL or Documents upload options requires a rebuild.
- **GitHub Actions** — Workflow (`.github/workflows/docker-build.yml`) runs on push to `main`/`master` and on manual `workflow_dispatch`. Builds the image and pushes to GitHub Container Registry (ghcr.io). If repository secrets `DOCKERHUB_USERNAME` and `DOCKERHUB_TOKEN` are set, also pushes to Docker Hub as `docker.io/<DOCKERHUB_USERNAME>/olo-chat`. Manual run has a **push** input (default: true) to control whether to push to registries.

---

## Environment variable definitions

These are the only environment variables the frontend uses. They must be set at **build time** (Docker build args or CI variables).

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| **VITE_API_BASE** | Yes (for API/WS) | `http://localhost:7080` | Base URL of the olo backend. The app will call `{VITE_API_BASE}/api` for REST and `ws://...` derived from this for WebSocket. No trailing slash. Examples: `http://localhost:7080`, `https://api.example.com`. |
| **VITE_WS_ACCESS_TOKEN** | No | _(empty)_ | Optional WebSocket access token. If set, it is used when the app has no token in `sessionStorage` (e.g. before login). Prefer setting the token at runtime via login and `sessionStorage.accessToken`. |
| **VITE_WS_PING_INTERVAL_SEC** | No | `10` | WebSocket ping interval (and reconnect delay) in seconds. Used for liveness checks. |
| **VITE_CAPABILITY_SOURCE_OPTIONS** | No | _(empty)_ | Comma-separated **capability source** ids for the Documents upload dropdown (e.g. `product-docs,legal`). Preferred over `VITE_RAG_OPTIONS`. |
| **VITE_RAG_OPTIONS** | No | _(empty)_ | Legacy alias for `VITE_CAPABILITY_SOURCE_OPTIONS` if the new variable is unset. |
| **VITE_RESOURCE_UPLOAD_QUEUE** | No | _(empty)_ | Optional workflow task queue after resource upload (e.g. indexing). Preferred over `VITE_RAG_QUEUE`. |
| **VITE_RESOURCE_UPLOAD_PIPELINE** | No | _(empty)_ | Optional pipeline id for that post-upload workflow. Preferred over `VITE_RAG_PIPELINE`. |
| **VITE_RAG_QUEUE** | No | _(empty)_ | Legacy: used if `VITE_RESOURCE_UPLOAD_QUEUE` is unset. |
| **VITE_RAG_PIPELINE** | No | _(empty)_ | Legacy: used if `VITE_RESOURCE_UPLOAD_PIPELINE` is unset. |

**Where used** — `VITE_API_BASE`, `VITE_WS_ACCESS_TOKEN`, `VITE_WS_PING_INTERVAL_SEC` in `api/chatApi.ts`, `lib/wsUrl.ts`, `hooks/useWebSocketLiveness.ts`. Upload / capability-source vars in `api/documentsUploadApi.ts` and Documents UI.

### Dockerfile build args today

The checked-in **`Dockerfile`** declares **ARG/ENV** only for:

- `VITE_API_BASE`
- `VITE_WS_ACCESS_TOKEN`
- `VITE_WS_PING_INTERVAL_SEC`

Upload-related `VITE_*` variables are documented above but **not** passed through the Dockerfile unless you add matching `ARG`/`ENV` lines and rebuild. For Documents upload defaults in Docker, extend the Dockerfile or set capability sources in the UI without build-time ids.

### Notes

- **CORS**: The backend must allow requests from the origin where the frontend is served (e.g. the domain or port of the Docker host).
- **Build-time only**: Vite replaces `import.meta.env.VITE_*` during `vite build`. To change these values you must rebuild the image with new build args.
- **Chat profiles**: Not a frontend env var. The **olo backend** must serve `GET /api/ui/context` with `chatProfiles` from **`olo.configuration.dir`** (workflow JSON under e.g. `olo-mono/olo-definition/olo-configuration/default/`). Without that, the chat UI shows “No chat profiles configured.”

---

## Docker Compose

Sample Compose files are provided for local development and production.

### Development (`docker-compose.dev.yml`)

Uses fixed build args pointing at a backend on the host at `http://localhost:7080`. Run the olo backend on your machine (e.g. port 7080) before starting the frontend.

```bash
# Ensure backend is running at http://localhost:7080, then:
docker compose -f docker-compose.dev.yml up --build
```

- Frontend: **http://localhost:3000**
- Build args: `VITE_API_BASE=http://localhost:7080`, `VITE_WS_PING_INTERVAL_SEC=10`

### Demo (`docker-compose.demo.yml`)

For a quick demo: frontend only, with default backend URL `http://localhost:7080`. You can override with env (e.g. a remote demo API). Optionally add a backend service in the same file for an all-in-one demo.

```bash
# Backend on host at 7080:
docker compose -f docker-compose.demo.yml up --build

# Or point at a remote demo API (rebuild so the URL is baked in):
VITE_API_BASE=https://demo-api.example.com docker compose -f docker-compose.demo.yml up --build
```

- Frontend: **http://localhost:3000**
- `VITE_API_BASE` defaults to `http://localhost:7080`; set in env to override.
- To run frontend + backend in one stack, uncomment the `backend` service in `docker-compose.demo.yml`, set the backend image (e.g. your olo backend image), then run the same command. The browser will use port 7080 on the host for the API.

### Production (`docker-compose.prod.yml`)

Build args come from the environment. Create a `.env` from `.env.example`, set `VITE_API_BASE` (and optionally the others), then run.

```bash
cp .env.example .env
# Edit .env and set VITE_API_BASE (e.g. https://api.myolo.com)

docker compose -f docker-compose.prod.yml up --build -d
```

- Frontend: **http://localhost:80** (or map another port in the compose file).
- `VITE_API_BASE` is **required** (Compose will error if unset). Use the URL that the **browser** should use to reach the API (e.g. `https://api.myolo.com`).
- Optional: `VITE_WS_ACCESS_TOKEN`, `VITE_WS_PING_INTERVAL_SEC` (default `10`).
- Container runs with `restart: unless-stopped`.

| File | Purpose |
|------|---------|
| **docker-compose.dev.yml** | Dev: frontend only, backend on host at 7080, port 3000. |
| **docker-compose.demo.yml** | Demo: frontend only (or add backend service); port 3000, optional env override for backend URL. |
| **docker-compose.prod.yml** | Prod: frontend with build args from `.env`, port 80, restart policy. |
| **.env.example** | Template for production `.env` (VITE_API_BASE, etc.). |

---

## Building the Docker image locally

### With defaults (backend at `http://localhost:7080`)

```bash
docker build -t olo-chat .
```

### With custom backend URL (and optional env)

```bash
docker build -t olo-chat \
  --build-arg VITE_API_BASE=https://api.myolo.com \
  --build-arg VITE_WS_PING_INTERVAL_SEC=15 \
  .
```

### With WebSocket token (optional, usually not needed for production)

```bash
docker build -t olo-chat \
  --build-arg VITE_API_BASE=https://api.myolo.com \
  --build-arg VITE_WS_ACCESS_TOKEN=your-token \
  .
```

---

## Running the container

The image serves the app on **port 80** inside the container.

### Map port to host (e.g. 3000)

```bash
docker run -p 3000:80 olo-chat
```

Open `http://localhost:3000`.

### Example with name and restart policy

```bash
docker run -d --name olo-chat-ui -p 3000:80 --restart unless-stopped olo-chat
```

---

## GitHub Actions: build and push

### Trigger

- **Push** to branches `main` or `master`: workflow runs, builds the image, and pushes to GitHub Container Registry (ghcr.io). If Docker Hub secrets are set, it also pushes to Docker Hub.
- **Manual**: Run the workflow from the **Actions** tab (**Build and push Docker image** → **Run workflow**). Use the **push** input to choose whether to push to registries (default: true).

### Where to set build configuration

- **Repository variables** (Settings → Secrets and variables → Actions → Variables):
  - **VITE_API_BASE**: Backend base URL used at build time (e.g. `https://api.myolo.com`). If not set, defaults to `http://localhost:7080`.
  - **VITE_WS_PING_INTERVAL_SEC**: Optional; default `10`.
- **Repository secrets** (Settings → Secrets and variables → Actions → Secrets):
  - **VITE_WS_ACCESS_TOKEN**: Optional; only if you want a token baked in for WebSocket (usually leave unset).
  - **DOCKERHUB_USERNAME**: Your Docker Hub username. If set, the workflow also pushes the image to Docker Hub as `docker.io/<DOCKERHUB_USERNAME>/olo-chat`.
  - **DOCKERHUB_TOKEN**: Docker Hub access token (Settings → Security → Access tokens in Docker Hub). Required for push when **DOCKERHUB_USERNAME** is set.

### Image location and tags

- **GitHub Container Registry**: `ghcr.io/<owner>/<repo>` (e.g. `ghcr.io/myorg/olo-chat`).
- **Docker Hub** (when secrets are set): `docker.io/<DOCKERHUB_USERNAME>/olo-chat`.
- **Tags**: branch name, Git SHA, and `latest` (only for `main`/`master`).

### Pull and run (after workflow has run)

**From GitHub Container Registry:**

```bash
docker pull ghcr.io/<owner>/<repo>:latest
docker run -p 3000:80 ghcr.io/<owner>/<repo>:latest
```

**From Docker Hub:**

```bash
docker pull <DOCKERHUB_USERNAME>/olo-chat:latest
docker run -p 3000:80 <DOCKERHUB_USERNAME>/olo-chat:latest
```

For a private ghcr.io repo, create a PAT with `read:packages` and:

```bash
echo <PAT> | docker login ghcr.io -u <user> --password-stdin
```

---

## File reference

| File | Purpose |
|------|---------|
| **Dockerfile** | Multi-stage build: Node build, then Nginx serving `dist`. |
| **nginx.conf** | Nginx config: SPA fallback to `index.html`, static asset caching. |
| **.dockerignore** | Excludes `node_modules`, `dist`, `.git`, env files, tests, etc. |
| **docker-compose.dev.yml** | Development: frontend only, backend on host at 7080. |
| **docker-compose.demo.yml** | Demo: frontend with optional backend; port 3000, env override for API URL. |
| **docker-compose.prod.yml** | Production: frontend with build args from `.env`. |
| **.env.example** | Example env vars for production Compose. |
| **.github/workflows/docker-build.yml** | Builds and (on main/master) pushes the image to ghcr.io and optionally to Docker Hub when **DOCKERHUB_USERNAME** and **DOCKERHUB_TOKEN** are set. |

---

## Troubleshooting

- **Blank page or wrong API URL** — Rebuild the image with the correct `VITE_API_BASE` for the environment where the app is served. The browser must be able to reach that URL for REST and WebSocket.
- **CORS errors** — Configure the olo backend to allow the origin of the frontend (scheme + host + port). The origin is where the user opens the app (e.g. `http://localhost:3000` or your production domain).
- **WebSocket fails** — Ensure `VITE_API_BASE` uses the same host/port the browser should use for WebSocket (e.g. `wss://` in production). The app derives the WebSocket URL from `VITE_API_BASE` (e.g. `https://api.example.com` → `wss://api.example.com/ws`).
- **Documents upload dropdown empty** — Set `VITE_CAPABILITY_SOURCE_OPTIONS` or `VITE_RAG_OPTIONS` at build time (comma-separated capability source ids) and rebuild.

---

## Related docs

- [README.md](./README.md) — Overview and run instructions.
- [ARCHITECTURE.md](./ARCHITECTURE.md) — App architecture and build-time env.
- [DOCKER_HUB_DESCRIPTION.md](./DOCKER_HUB_DESCRIPTION.md) — Copy-paste description for Docker Hub image page.
