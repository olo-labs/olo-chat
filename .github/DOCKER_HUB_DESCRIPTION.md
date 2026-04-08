<!--
Copyright (c) 2026 Olo Labs
SPDX-License-Identifier: Apache-2.0
-->

# Olo Chat (frontend)

Chat UI for **Olo** — create sessions, send messages, and stream run events in real time. When the backend exposes **chat profiles**, pick a preset beside the composer; **run again** offers other presets (emoji + name) under user messages. Run events can persist locally (last 200 per run) and the UI dedupes replay after refresh. This image serves the frontend; it expects an **Olo backend** for API and WebSocket.

## Quick run

```bash
docker run -p 3000:80 <your-dockerhub-username>/olo-chat:latest
```

Open **http://localhost:3000**. The app will call the backend at the URL baked in at build time (default `http://localhost:7080`). For a remote backend you must use an image built with the correct `VITE_API_BASE` (see below).

## Port

The container serves the app on **port 80**. Map it to the host (e.g. `-p 3000:80`) as in the example above.

## Backend URL (build-time)

The backend base URL is set when the image is **built**, not at run time. Default is `http://localhost:7080`. To point at your API:

- **Option A** — Use an image built with a build arg, e.g.:
  ```bash
  docker build -t olo-chat --build-arg VITE_API_BASE=https://api.yourdomain.com .
  ```
- **Option B** — Use the image from this repo's GitHub Actions; set the **VITE_API_BASE** variable in the repo before the workflow runs.

The app uses this URL for REST (`/api`) and derives the WebSocket URL from it.

## Optional build args

| Build arg | Default | Description |
|-----------|---------|-------------|
| `VITE_API_BASE` | `http://localhost:7080` | Backend base URL (no trailing slash). |
| `VITE_WS_PING_INTERVAL_SEC` | `10` | WebSocket ping interval (seconds). |
| `VITE_WS_ACCESS_TOKEN` | _(empty)_ | Optional WebSocket token (usually leave unset). |
| `VITE_CAPABILITY_SOURCE_OPTIONS` | _(empty)_ | Comma-separated capability source ids for Documents upload (preferred). |
| `VITE_RAG_OPTIONS` | _(empty)_ | Legacy alias for capability source ids if `VITE_CAPABILITY_SOURCE_OPTIONS` is unset. |
| `VITE_RESOURCE_UPLOAD_QUEUE` | _(empty)_ | Optional task queue after resource upload (legacy: `VITE_RAG_QUEUE`). |
| `VITE_RESOURCE_UPLOAD_PIPELINE` | _(empty)_ | Optional pipeline id after upload (legacy: `VITE_RAG_PIPELINE`). |

## CORS and WebSocket

Ensure your Olo backend allows the origin where this frontend is served (scheme + host + port). WebSocket URL is derived from `VITE_API_BASE` (e.g. `wss://api.yourdomain.com` when base is `https://api.yourdomain.com`).

## Full documentation

- **Docker**: [docs/DOCKER.md](https://github.com/YOUR_ORG/olo-chat/blob/main/docs/DOCKER.md) — build, env vars, Docker Compose, GitHub Actions.
- **Project**: [README](https://github.com/YOUR_ORG/olo-chat) and [docs/README.md](https://github.com/YOUR_ORG/olo-chat/blob/main/docs/README.md) for overview and run instructions.

Replace `YOUR_ORG` and `olo-chat` with your GitHub org/repo if different.
