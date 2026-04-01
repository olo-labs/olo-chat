<!--
Copyright (c) 2026 Olo Labs
SPDX-License-Identifier: Apache-2.0
-->

# Olo Chat

A chat interface for **Olo** — start conversations, send messages, and follow run events in real time.

## For users

- **Chat** — Pick a queue and pipeline, create a session, and chat. Run events (planner, model, tools) stream live in the sidebar.
- **Knowledge** — Manage knowledge sources and see status (sources, create, status).
- **Documents** — Upload files and run RAG workflows from the UI.

The app talks to the **Olo backend** for sessions, messages, and events. You choose your tenant, queue, and pipeline from the UI.

## Quick start

1. **Install** and **run** (ensure the Olo backend is running, e.g. on port 7080):

   ```bash
   npm install
   npm run dev
   ```

2. Open **http://localhost:3000** in your browser.

For backend setup, environment variables, Docker, and all technical details, see the **docs** below.

## Documentation

Everything technical lives in the **docs** folder:

| Doc | What’s inside |
|-----|----------------|
| **[docs/README.md](docs/README.md)** | Overview, backend requirements, run instructions, project layout. |
| **[docs/UI_FEATURES.md](docs/UI_FEATURES.md)** | All UI features: panels, navigation, Conversation, Events, feature flags. |
| **[docs/CHAT_UI.md](docs/CHAT_UI.md)** | Chat in detail: APIs, queue/pipeline, run events, WebSocket. |
| **[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)** | Technical architecture: stack, state, API, components. |
| **[docs/DOCKER.md](docs/DOCKER.md)** | Docker build/run, env vars, Docker Compose (dev/demo/prod), GitHub Actions, Docker Hub. |
| **[docs/DOCKER_HUB_DESCRIPTION.md](docs/DOCKER_HUB_DESCRIPTION.md)** | Copy-paste description for the Docker Hub image page. |

## Logo and assets

Logo and related assets are in **public/** (e.g. `logo-full.svg`). See project docs for usage.

---

*For developers: requirements (Node 18+), build (`npm run build`), Storybook (`npm run storybook`), and store discipline are described in [docs/README.md](docs/README.md) and [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).*
