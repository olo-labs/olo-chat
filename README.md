<!--
Copyright (c) 2026 Olo Labs
SPDX-License-Identifier: Apache-2.0
-->

# Olo Chat

A chat interface for **Olo** — start conversations, send messages, and follow run events in real time.

## For users

- **Chat** — Either pick a **preset** (when the backend exposes **chat profiles** from pipeline config: name, summary, optional emoji, optional **run again** flag) or a **queue** and **pipeline** in the Conversation panel, then create a session and chat. Subtitle **Conversation with Olo AI**. While the model runs, you see **who is thinking** and a short **summary** line; message history can show **which preset** was used per turn. **Run again** (under user messages) lists other presets by **emoji + name**. Run events in the **Events** sidebar; **human** steps show **buttons** from the worker.
- **Knowledge** — Manage knowledge sources and see status (sources, create, status).
- **Documents** — Upload files and run RAG workflows from the UI.

The app talks to the **Olo backend** for sessions, messages, and events. **Tenant** is determined by the backend (auth / context); you choose **queue** and **pipeline** in the Conversation panel.

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
