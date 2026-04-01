<!--
Copyright (c) 2026 Olo Labs
SPDX-License-Identifier: Apache-2.0
-->

# olo-chat

Frontend for the **Olo** chat flow. It provides a chat UI that talks to the **olo** backend (REST + SSE + optional WebSocket) for sessions, messages, runs, and live execution events.

---

## Documentation index

| Doc | Description |
|-----|-------------|
| **[UI_FEATURES.md](./UI_FEATURES.md)** | All UI features: top bar, left panel (tenant, sections), main content (Chat, Knowledge, Documents), Tools panel (Conversation: Queue/Pipeline, sessions; Knowledge: sources), Properties panel (Events, tenant config), URL/query, resizable panels, feature flags. |
| **[ARCHITECTURE.md](./ARCHITECTURE.md)** | Technical architecture: stack, routing, Zustand stores, API layer, config, lib, component tree, and Chat data flow. |
| **[CHAT_UI.md](./CHAT_UI.md)** | Chat in detail: APIs, queue vs pipeline, session/message/run flow, execution model, empty-response handling. |
| **[DOCKER.md](./DOCKER.md)** | Docker build/run, env vars, Docker Compose (dev/demo/prod), GitHub Actions, Docker Hub. |
| **[DOCKER_HUB_DESCRIPTION.md](./DOCKER_HUB_DESCRIPTION.md)** | Copy-paste description for the Docker Hub image page (Full Description). |

---

## Overview

### Sections

- **Chat** — Single sub-option **Conversation**. Create a session, send messages, and see run events (PLANNER, MODEL, TOOL, HUMAN, SYSTEM, plus WebSocket PING/PONG liveness) streamed in real time. Queue and Pipeline are selected in the **Conversation panel** (Tools), not in the left menu. Session list is scoped by selected queue and pipeline. Backed by `POST /api/sessions`, `POST /api/sessions/{sessionId}/messages`, `GET /api/runs/{runId}/events` (SSE), and optional WebSocket `/ws`.
- **Knowledge** — Sub-options: **Sources**, **Create new**, **Status**. Main content and Tools panel list are placeholders until APIs are wired.
- **Documents** — **Upload / manage raw files**: select or enter a knowledge source (from `VITE_RAG_OPTIONS`), choose files or folder (drag-drop or browse), then **Start RAG** to trigger the upload workflow (queue/pipeline from `VITE_RAG_QUEUE`, `VITE_RAG_PIPELINE`).

### Tenant and queues

- **Tenant** — Top dropdown is populated from `GET /api/tenants`. Selected tenant is stored in URL query `tenant` and in the UI store.
- **Queue & Pipeline** — Under Chat, the **Conversation panel** (Tools) has a **Queue** dropdown (from `GET /api/tenants/{tenantId}/queues`) and a **Pipeline** dropdown (from `GET /api/tenants/{tenantId}/queues/{queueName}/config`). Queue names are shown as display names (version suffix stripped via `queueDisplayName()`). Session list, new session creation, and send message all use the currently selected queue and pipeline (read from the store at action time).

The app defaults to **Chat → Conversation** and uses the **olo** backend as the source of truth for chat (sessions, messages, runs, execution events, tenants, queues).

---

## Backend

The chat UI is designed to work with the **olo** backend:

| Repo path   | Role |
|------------|-------|
| **olo**    | Chat backend (Spring Boot). REST + SSE at `/api`. Default port **7080**. |
| **olo-chat** | This frontend (Vite + React). Proxies `/api` to the olo backend in development. |

**Relevant backend docs** (in `olo/docs/`, relative to repo root):

- **[ARCHITECTURE.md](../olo/docs/ARCHITECTURE.md)** — System overview, components, data flow (olo-chat → Chat BE → olo-sdk → Temporal).
- **[DESIGN.md](../olo/docs/DESIGN.md)** — Domain objects, execution model, API contracts, persistence.
- **[API_PAYLOADS.md](../olo/docs/API_PAYLOADS.md)** — Example request/response payloads for sessions, messages, runs, SSE, human-input.
- **[WEBSOCKET.md](../olo/docs/WEBSOCKET.md)** — WebSocket endpoint for run events (alternative to SSE).
- **[DEMO.md](../olo/docs/DEMO.md)** — How to build and run the backend, Temporal, and executor.

---

## Run the app

1. **Start the olo backend** (default port 7080), e.g. from the `olo` directory:
   ```bash
   ./gradlew bootRun
   ```
   See [olo/docs/DEMO.md](../olo/docs/DEMO.md) for full setup (Temporal, executor).

2. **Start olo-chat** (from this directory):
   ```bash
   npm install
   npm run dev
   ```
   The dev server runs on port **3000**. API calls use `VITE_API_BASE` (e.g. in `.env.development`: `VITE_API_BASE=http://localhost:7080`); the Vite proxy sends `/api` to that base URL.

3. Open **http://localhost:3000**. The app opens at **Chat → Conversation**. Use the top tenant dropdown; in the **Conversation panel** (right of main content) select a **Queue** and **Pipeline** to scope the session list and new chats.

---

## Chat flow (high level)

1. **Session** — On **New chat**, the app creates a session via `POST /api/sessions` with `tenantId`, and optionally `taskQueue`, `queueName`, `pipelineId` (from the Conversation panel, read from store at create time). The new session is added optimistically to the list and selected.
2. **Send message** — User types and sends; frontend reads queue from store and calls `POST /api/sessions/{sessionId}/messages` with `content` and `taskQueue` (display name). Backend creates the message and run, starts the Temporal workflow, and returns `messageId` and `runId`. Event history in the Events panel is **not** cleared when the user clicks Send; the app subscribes to run events (SSE or WebSocket) and appends them. When a MODEL node completes with output, that content is shown as the assistant reply; empty or metadata-only response shows: *"Apologise, Couldn't generate the response for your query."*
3. **Run events** — Frontend subscribes to `GET /api/runs/{runId}/events` (SSE) or WebSocket `SUBSCRIBE_RUN`; each event is appended to `runEventsStore`. Events list shows the last 25 run events (liveness PING/PONG excluded). On run completion, messages are refetched and Send is re-enabled.

For full flow details (planner → tool → model → human → final answer), see [olo/docs/DESIGN.md](../olo/docs/DESIGN.md) and [olo/docs/ARCHITECTURE.md](../olo/docs/ARCHITECTURE.md).

---

## Project layout (relevant to chat)

### API

| File | Purpose |
|------|---------|
| **api/chatApi.ts** | Chat API: health, tenants, queues, queue config, sessions (create, list, delete, delete all), messages (list), send message, runs (get, events SSE, response). Base URL is `VITE_API_BASE` + `/api`. List/delete use query params `queue`, `pipeline` (queue as display name). |
| **api/ragApi.ts** | Documents upload `POST /api/rag/upload` (FormData: ragId, files; optional taskQueue, pipelineId from env). `getExistingRAGOptions()` from `VITE_RAG_OPTIONS`. |
| **api/rest.ts** | Tenant configuration REST (save, update, delete tenant) used by the tenant config store. |

### Stores (`src/store/`)

| Store | Purpose |
|-------|---------|
| **ui.ts** (`useUIStore`) | Panel expanded state (left, tools, properties), panel widths (persisted to `localStorage`), theme (light/dark), navigation (sectionId, subId, runId, tenantId). URL sync in App pushes path/query into this store. |
| **chatSessions.ts** | List of session summaries and selected session ID. Updated when sessions are fetched or user selects/creates/deletes a session. |
| **conversationPanel.ts** | Selected queue ID and pipeline ID in the Conversation panel. Scopes session list, new-session creation, and send-message; read at action time to avoid stale values. |
| **runEvents.ts** | Current run ID and list of run events. `setRun(runId)` sets run and clears events (new run). `addEvent()` appends; `setOnRunEventCallback()` used by ChatView (e.g. to poll run response or refetch messages). **Not** cleared when user clicks Send. Liveness (PING/PONG) stored here; EventsList filters them out. |
| **sessionDisplay.ts** | Per-session display: custom title (user-edited), first-message preview. Persisted in `localStorage`; capped at 80 entries. Used for session list labels and delete cleanup. |
| **tenantConfig.ts** | Tenants list (from `GET /api/tenants`), loading, selected tenant for config form, “adding new”. Actions: loadTenants, selectTenant, startAddNew, saveTenant, deleteTenant. |

### Components

| File | Purpose |
|------|---------|
| **LeftPanel.tsx** | Section nav; tenant dropdown; Chat shows only **Conversation** submenu (queues in Conversation panel). |
| **ToolsPanel.tsx** | **Chat**: Queue dropdown, Pipeline dropdown, New chat, sessions list (scoped by queue+pipeline), delete one (optimistic remove), delete all. **Knowledge**: knowledge sources list. Hidden for Documents. |
| **MainContent.tsx** | Renders ChatView (Chat), KnowledgeView (Knowledge), RAGUploadView (Documents upload). Reads `selectedQueueId` from store at top level. |
| **ChatView.tsx** | Session/message/run: create session (taskQueue, queueName, pipelineId from store), fetch sessions (queue = display name), fetch messages, send message (taskQueue from store), subscribe to run events (SSE or WebSocket), format assistant content (empty → fallback message). Optimistic user message on Send; optimistic new session on New chat. |
| **EventsList.tsx** | Run events from `runEventsStore`; last 25 shown; liveness excluded; expand for input/output/metadata; auto-scroll to bottom. |
| **PropertiesPanel.tsx** | Right panel: Events (Chat) or TenantConfigForm; independent scroll. |
| **TopBar.tsx** | Logo (home), theme toggle. |

### Lib and config

| File | Purpose |
|------|---------|
| **lib/queueDisplayName.ts** | Strips version suffix from queue name (e.g. `olo-chat-queue:1.0` → `olo-chat-queue`). Used for display and for list/delete API params. |
| **lib/wsUrl.ts** | `getWebSocketUrl(accessToken?)` from `VITE_API_BASE`; `getWsAccessToken()` from sessionStorage or `VITE_WS_ACCESS_TOKEN`. |
| **lib/wsSingleton.ts** | Single shared WebSocket; `getSharedWebSocket()`, `getCurrentSocket()`, `subscribeToRun(runId)`. Does not call `close()` on a socket in `CONNECTING` state. |
| **hooks/useWebSocketLiveness.ts** | Connects to `/ws`, PING at `VITE_WS_PING_INTERVAL_SEC`, pushes PING/PONG into `runEventsStore`. |
| **types/layout.ts** | `SECTIONS`: Chat (conversation only), Knowledge (sources, create, status), Documents (upload). Drives left menu and valid sub-ids. |
| **config/features.ts** | Feature flags per section (chat, knowledge, documents). |
| **config/toolRegistry.ts** | Tool id → metadata; optional tool components; `getToolsForView(sectionId, subId, runSelected)`. |
| **routes.ts** | Path parsing (`parsePath`, `buildPath`), query (`parseQuery`, `buildQuery`), default path `/chat/conversation`, valid subIds from layout. |

---

## Configuration

- **Backend URL** — In development, set `VITE_API_BASE=http://localhost:7080` in `.env.development`. The Vite proxy sends `/api` to that base; see `vite.config.ts` and `server.proxy`.
- **Tenant** — Chat uses `tenantId` from the URL query (`?tenant=...`) or the backend’s default tenant (`GET /api/tenants`). See [WEBSOCKET.md](../olo/docs/WEBSOCKET.md) for auth.
- **Documents upload** — Set `VITE_RAG_OPTIONS` (comma-separated knowledge source ids), `VITE_RAG_QUEUE`, `VITE_RAG_PIPELINE`. See [DOCKER.md](./DOCKER.md).
- **Panels** — Left (tenant + sections), Conversation (Chat: Queue, Pipeline, New chat, sessions), Events (Chat run events). Panel state in URL: `menu`, `tools`, `props`. Widths in `localStorage` (`olo:panel-widths`).

---

## Requirements and scripts

- **Node.js 18+**, npm or pnpm.
- **Build**: `npm run build`; **preview**: `npm run preview`.
- **Storybook**: `npm run storybook` — UI components in isolation (mock data for TenantConfigurationList, TenantConfigForm, ToolsPanel). Stories in `src/**/*.stories.tsx`.
- **Store discipline**: One store per domain; see [src/store/README.md](../src/store/README.md) and [ARCHITECTURE.md](./ARCHITECTURE.md).
