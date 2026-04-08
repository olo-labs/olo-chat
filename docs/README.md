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
| **[TECHNOLOGY_ARCHITECTURE.md](./TECHNOLOGY_ARCHITECTURE.md)** | **Details doc:** technology stack, logical architecture, UI design (panels, theming, chat progress), and communication (REST, SSE, WebSocket, event model, end-to-end flow). |
| **[UI_FEATURES.md](./UI_FEATURES.md)** | All UI features: panels, **profile vs legacy** chat, **preset pills**, **per-turn config** in history, **thinking** + **`displaySummary`**, **Run again** (per-message menu: **emoji + profile name**, **`run_again`**), **persisted run events** (last 200, **deduped** on replay), **worker progress** expand/height persist, **Events bell** (new workflow events while Events panel closed), **human-input** (store-backed timeline after reload), **health** polling, Events, URL/query, feature flags. |
| **[ARCHITECTURE.md](./ARCHITECTURE.md)** | Stack, routing, stores (**conversationPanel** profiles), **`useBackendReachable`**, API (**ui/context**, human-input), component tree, Chat data flow (profile + legacy). |
| **[CHAT_UI.md](./CHAT_UI.md)** | Chat in detail: APIs, queue vs pipeline, session/message/run flow, execution model, empty-response handling. |
| **[DOCKER.md](./DOCKER.md)** | Docker build/run, env vars, Docker Compose (dev/demo/prod), GitHub Actions, Docker Hub. |
| **[DOCKER_HUB_DESCRIPTION.md](./DOCKER_HUB_DESCRIPTION.md)** | Copy-paste description for the Docker Hub image page (Full Description). |

---

## Overview

### Sections

- **Chat** — Single sub-option **Conversation** (subtitle **→ Conversation with Olo AI**). Create a session, send messages, and see run events (PLANNER, MODEL, TOOL, HUMAN, SYSTEM, plus WebSocket PING/PONG liveness). **Legacy:** **Queue** + **Pipeline** in the **Conversation** tools panel. **Profile mode** when **`GET /api/ui/context`** returns **`chatProfiles`** (from regional pipeline / Redis: **`display_name`**, **`display_summary`**, **`emoji`**, **`queue`**, **`pipeline`**, optional **`run_again`** → API **`runAgain`**): preset **beside the composer**, **thinking** line + summary, **config pills** on messages, **Run again** icon under **user** messages — menu lists **emoji + profile name** for presets with **`runAgain: true`** (not on human-step replies); Tools panel **New chat** + sessions only. **Last 200** workflow run events are **persisted** and **deduped** on replay (`localStorage` per `runId`, **`sessionStorage`** active run per session). **Worker progress** strip **expanded/height** also **persist** (`olo:chat-progress-*`). Human steps: **buttons from worker `input.options`**. APIs: `POST /api/sessions`, `POST /api/sessions/{sessionId}/messages`, `GET /api/runs/{runId}/events` (SSE), optional WebSocket `/ws`, `POST /api/runs/{runId}/human-input`.
- **Knowledge** — Sub-options: **Sources**, **Create new**, **Status**. Main content and Tools panel list are placeholders until APIs are wired.
- **Documents** — **Upload / Manage Raw Files**: pick a **capability source** (from `VITE_CAPABILITY_SOURCE_OPTIONS` or `VITE_RAG_OPTIONS`), upload files to the **backend shared folder** (path from server config). Optional queue/pipeline env vars may start **indexing** after copy; **RAG** runs later when a **capability** uses that source—not during upload.

### Tenant context, queues, and chat profiles

- **Tenant** — **Not chosen in the UI.** The backend resolves `tenantId`; the app reads **`GET /api/ui/context`** for **tenant** / **user** labels, **oloVersion**, **`tenantId`**, and optional **`chatProfiles`**.
- **Legacy Queue & Pipeline** — When **`chatProfiles`** is empty, the **Conversation** tools panel shows **Queue** and **Pipeline** dropdowns; session list APIs pass **queue** (display name) and **pipeline**; **New chat** includes queue/pipeline in the body.
- **Profile mode** — When **`chatProfiles`** is non-empty, each **preset** carries **queue**, **pipeline**, and display fields. The user selects a preset **beside the message input**; **New chat** may use a **minimal** create body (`tenantId` only); **list sessions** is tenant-wide. **`conversationPanelStore`** holds **`selectedProfileId`** plus queue/pipeline derived from the preset.

The app defaults to **Chat → Conversation** and uses the **olo** backend as the source of truth for chat (sessions, messages, runs, execution events, queues).

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
- **[DEMO.md](../olo/docs/DEMO.md)** — How to build and run the backend, Temporal, and Temporal worker (olo-executor or olo-worker).

---

## Run the app

1. **Start the olo backend** (default port 7080), e.g. from the `olo` directory:
   ```bash
   ./gradlew bootRun
   ```
   See [olo/docs/DEMO.md](../olo/docs/DEMO.md) for full setup (Temporal, worker).

2. **Start olo-chat** (from this directory):
   ```bash
   npm install
   npm run dev
   ```
   The dev server runs on port **3000**. API calls use `VITE_API_BASE` (e.g. in `.env.development`: `VITE_API_BASE=http://localhost:7080`); the Vite proxy sends `/api` to that base URL.

3. Open **http://localhost:3000**. The app opens at **Chat → Conversation**. If the backend does not expose **chat profiles**, select **Queue** and **Pipeline** in the **Conversation** tools panel. If **chat profiles** are configured, choose a **preset** next to the composer instead. Tenant context comes from the backend, not from a selector in the UI.

---

## Chat flow (high level)

1. **Session** — **New chat** → `POST /api/sessions` (**profile:** often `{ tenantId }` only; **legacy:** includes queue/pipeline). Optimistic list update + selection.
2. **Send message** — `POST /api/sessions/{sessionId}/messages` with `content` and optional **`taskQueue`** from the selected preset or legacy queue. Backend returns **`runId`**; SSE or WebSocket streams events. **Human WAITING** → UI shows worker **options**; **`POST /api/runs/{runId}/human-input`** resumes the workflow. Assistant text from MODEL / response API; empty payload → fallback copy.
3. **Run events** — Streamed over SSE or WebSocket; **`runEventsStore`** persists the last **200** workflow events per **`runId`** and **dedupes** on replay after refresh. **`ChatView`** uses the store as the **only** in-chat event timeline (human card, progress) so WebSocket **`RUN_EVENT`** updates apply after reload. **`App`** sets **`runEventsBellUnread`** when new workflow events arrive while the **Events** panel is closed, and clears it when the panel opens. **Events** panel shows last **25** (liveness filtered). **`GET /api/health`** is polled so the main chat area can show a disconnected state when the backend is down.

For full flow details (planner → tool → model → human → final answer), see [olo/docs/DESIGN.md](../olo/docs/DESIGN.md) and [olo/docs/ARCHITECTURE.md](../olo/docs/ARCHITECTURE.md).

---

## Project layout (relevant to chat)

### API

| File | Purpose |
|------|---------|
| **api/chatApi.ts** | Chat API: health, **`GET /api/ui/context`** ( **`chatProfiles`**: **`displaySummary`**, **`emoji`**, queue, pipeline), tenants, queues, queue config, sessions, messages, send, runs (SSE, response). Base `VITE_API_BASE` + `/api`. List/delete: `queue`, `pipeline` (queue as display name). |
| **api/documentsUploadApi.ts** | **`POST /api/resource/upload`** — **BE-only** ingest; SPA never writes storage. Backend may use **local shared folder** or **object storage** (S3, Blob, etc.) via a server-side abstraction. Multipart **`capabilitySource`** = capability source. Optional `taskQueue` / `pipelineId` (`VITE_RESOURCE_UPLOAD_*` or legacy `VITE_RAG_*`). See [olo/docs/DOCUMENTS_UPLOAD.md](../../olo/docs/DOCUMENTS_UPLOAD.md). |
| **api/rest.ts** | Tenant configuration REST (save, update, delete tenant) used by the tenant config store. |

### Stores (`src/store/`)

| Store | Purpose |
|-------|---------|
| **ui.ts** (`useUIStore`) | Panel expanded state (left, tools, properties), panel widths (persisted to `localStorage`), theme (light/dark), navigation (sectionId, subId, runId, tenantId). URL sync in App pushes path/query into this store. |
| **chatSessions.ts** | List of session summaries and selected session ID. Updated when sessions are fetched or user selects/creates/deletes a session. |
| **documentUploadsStore.ts** | Document upload table rows (capability source, status, optional `runId`); persisted in `localStorage` (`olo:document-uploads`). |
| **conversationPanel.ts** | **selectedQueueId**, **selectedPipelineId**, and **selectedProfileId** (profile mode). Scopes sessions and send; read at action time. |
| **runEvents.ts** | Current run ID and list of run events. `setRun(runId)` / **`setRun(null)`** clears events for a new send or before `runId` is known. `addEvent()` appends workflow events with **dedupe**; **`setOnWorkflowEventAppended`** notifies **`App`** for the Events bell (workflow-only, not hydrate). Persists last **200** non-liveness events; `hydrate()`, `loadPersistedRunEvents`, `getActiveRunStorageKey`, **`RUN_EVENTS_PERSIST_MAX`**. `setOnRunEventCallback()` used by ChatView (also re-registered after rehydrate). **Not** cleared when user clicks Send. Liveness (PING/PONG) stored here; EventsList filters them out. |
| **sessionDisplay.ts** | Per-session display: custom title (user-edited), first-message preview. Persisted in `localStorage`; capped at 80 entries. Used for session list labels and delete cleanup. |
| **tenantConfig.ts** | Tenants list (from `GET /api/tenants`), loading, selected tenant for config form, “adding new”. Actions: loadTenants, selectTenant, startAddNew, saveTenant, deleteTenant. |

### Components

| File | Purpose |
|------|---------|
| **LeftPanel.tsx** | Section nav; Chat shows only **Conversation** submenu (queues in Conversation panel). |
| **ToolsPanel.tsx** | **Chat**: legacy Queue + Pipeline when no **chatProfiles**; **New chat**, sessions, deletes. **Knowledge**: sources list. Hidden for Documents. |
| **MainContent.tsx** | Renders **ChatView** or **DocumentsUploadView** (and other sections) with **`chatProfiles`** and **`backendReachable`** from App where applicable. |
| **ChatView.tsx** | Profile vs legacy; **preset** beside composer; **`profileByRunId`** + **sessionStorage** for **config pills**; **thinking** + **`displaySummary`**; **Run again** icon under user messages ( **`runAgain`** presets only); **collapsible bottom worker progress** (summarized `IN`/`OUT` from **`runEventsStore.events`**); restore **persisted** run events + **WebSocket** `SUBSCRIBE_RUN` after refresh; **`setOnRunEventCallback`** after rehydrate; **human-input** from **`input.options`** (timeline from store so reload + submit still advances); **`normalizeHumanStepHistoryContent`**; disconnected when **`backendReachable`** is false. |
| **DocumentsUploadView.tsx** | **Documents → Upload / Manage Raw Files**: capability-source toolbar, upload modal, table; **`documentUploadsStore`**; **`documentsUploadApi`** (`POST /api/resource/upload`). |
| **App.tsx** | **`getUiContext()`**, **`useBackendReachable()`**, passes context into **MainContent** and **ToolsPanel**. |
| **EventsList.tsx** | Run events from `runEventsStore`; last 25 shown; liveness excluded; expand for input/output/metadata; auto-scroll to bottom. |
| **PropertiesPanel.tsx** | Right panel: Events (Chat) or TenantConfigForm; independent scroll. |
| **TopBar.tsx** | Logo (home), theme toggle. |

### Lib and config

| File | Purpose |
|------|---------|
| **lib/queueDisplayName.ts** | Strips version suffix from queue name (e.g. `olo-chat-queue:1.0` → `olo-chat-queue`). Used for display and for list/delete API params. |
| **lib/chatProfileUi.ts** | **`emojiForProfile`**, **`formatProfileOptionLabel`** — uses API **`emoji`** when set, else heuristics. **`formatProfileOptionLabel`** = **“{emoji} {displayName}”** for preset `<select>` and **Run again** menu rows. |
| **lib/wsUrl.ts** | `getWebSocketUrl(accessToken?)` from `VITE_API_BASE`; `getWsAccessToken()` from sessionStorage or `VITE_WS_ACCESS_TOKEN`. |
| **lib/wsSingleton.ts** | Single shared WebSocket; `getSharedWebSocket()`, `getCurrentSocket()`, `subscribeToRun(runId)`. Does not call `close()` on a socket in `CONNECTING` state. |
| **hooks/useWebSocketLiveness.ts** | Connects to `/ws`, PING at `VITE_WS_PING_INTERVAL_SEC`, pushes PING/PONG into `runEventsStore`. |
| **hooks/useBackendReachable.ts** | Polls `GET /api/health` for Chat + Tools gating. |
| **types/layout.ts** | `SECTIONS`: Chat (conversation only), Knowledge (sources, create, status), Documents (upload). Drives left menu and valid sub-ids. |
| **config/features.ts** | Feature flags per section (chat, knowledge, documents). |
| **config/toolRegistry.ts** | Tool id → metadata; optional tool components; `getToolsForView(sectionId, subId, runSelected)`. |
| **routes.ts** | Path parsing (`parsePath`, `buildPath`), query (`parseQuery`, `buildQuery`), default path `/chat/conversation`, valid subIds from layout. |

---

## Configuration

- **Backend URL** — In development, set `VITE_API_BASE=http://localhost:7080` in `.env.development`. The Vite proxy sends `/api` to that base; see `vite.config.ts` and `server.proxy`.
- **Tenant** — Effective `tenantId` for API calls is provided by the **backend** (e.g. `GET /api/ui/context`, JWT). See [WEBSOCKET.md](../olo/docs/WEBSOCKET.md) for auth.
- **Documents upload** — Set `VITE_CAPABILITY_SOURCE_OPTIONS` (or legacy `VITE_RAG_OPTIONS`) for dropdown ids; optional `VITE_RESOURCE_UPLOAD_QUEUE`, `VITE_RESOURCE_UPLOAD_PIPELINE` (or legacy `VITE_RAG_*`) for post-upload workflows. See [DOCKER.md](./DOCKER.md).
- **Panels** — Left (sections), Conversation (Chat: Queue, Pipeline, New chat, sessions), Events (Chat run events). Panel state in URL: `menu`, `tools`, `props`. Widths in `localStorage` (`olo:panel-widths`).

---

## Requirements and scripts

- **Node.js 18+**, npm or pnpm.
- **Build**: `npm run build`; **preview**: `npm run preview`.
- **Storybook**: `npm run storybook` — UI components in isolation (mock data for TenantConfigurationList, TenantConfigForm, ToolsPanel). Stories in `src/**/*.stories.tsx`.
- **Store discipline**: One store per domain; see [src/store/README.md](../src/store/README.md) and [ARCHITECTURE.md](./ARCHITECTURE.md).
