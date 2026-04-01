<!--
Copyright (c) 2026 Olo Labs
SPDX-License-Identifier: Apache-2.0
-->

# Architecture

This document describes the technical architecture of the olo-chat frontend: stack, routing, state, API layer, config, lib, and main data flows.

---

## High-level stack

| Layer | Technology |
|-------|------------|
| **Runtime** | Browser (React 18). |
| **Build** | Vite 5, TypeScript. |
| **UI** | React 18, React Router 7. |
| **State** | Zustand (global stores); no Redux. |
| **Backend** | olo backend (Spring Boot) at `VITE_API_BASE` (e.g. `http://localhost:7080`). All API and WebSocket URLs are derived from this base. |

The app is a single-page application (SPA). The backend is the source of truth for sessions, messages, runs, tenants, queues, and run events.

---

## Routing

- **Router** — React Router (`BrowserRouter`) with a single root route; navigation is path + search params.
- **Path format** — `/:sectionId/:subId` (e.g. `/chat/conversation`, `/knowledge/sources`, `/documents/upload`). Optional run-level routes `/:sectionId/run/:runId/:subId` are parsed in `routes.ts`; the app currently uses section + sub for the main views.
- **Path parsing** — `routes.ts`: `parsePath()`, `buildPath()`, `buildPathWithQuery()`, `parseQuery()`, `buildQuery()`. Valid section IDs from `types/layout.ts` (`SectionId`); invalid paths redirect to the default path or last stored path. Valid sub-ids come from each section’s `subOptions` (and `runSelectedOptions` for run-level).
- **Query params** — `tenant`, `menu`, `tools`, `props`. Drive tenant selection and panel expanded state. Synced from URL to store in `App.tsx` so that back/forward and deep links work.
- **Default path** — `DEFAULT_PATH = '/chat/conversation'`.

---

## State (Zustand stores)

All global UI and domain state lives in Zustand stores under `src/store/`. Components subscribe with `store((s) => s.x)` and call actions via `store.getState().action()`.

| Store | Export | Purpose |
|-------|--------|---------|
| **ui** | `useUIStore` | Panel expanded state (left, tools, properties), panel widths (persisted to `localStorage` key `olo:panel-widths`), theme (light/dark, key `olo-theme`), navigation (sectionId, subId, runId, tenantId). `setPanelStateFromUrl()` is called from App URL sync only. |
| **chatSessions** | `chatSessionsStore` | List of session summaries and selected session ID. Updated when sessions are fetched, or user selects/creates/deletes a session. |
| **runEvents** | `runEventsStore` | Current run ID and list of run events (SSE/WebSocket). `setRun(runId)` sets run and **clears** the events array (new run). `addEvent(event)` appends; each event can trigger `onRunEventCallback` (e.g. ChatView polls run response or refetches messages). **Not** cleared when the user clicks Send (no `clear()` on Send). `clear()` is used on New chat (ChatView), Delete all (ToolsPanel), and when opening session list; it nulls runId, events, and the callback. Liveness (PING/PONG) events are stored here; EventsList filters them by `nodeType !== 'liveness'`. |
| **conversationPanel** | `conversationPanelStore` | Selected queue ID and pipeline ID in the Conversation panel. Scopes session list, new-session creation, and send-message. Queue and pipeline are read from the store **at action time** in ChatView and ToolsPanel to avoid stale closures. |
| **sessionDisplay** | `sessionDisplayStore` | Per-session display: `customTitle` (user-edited), `firstMessagePreview` (auto from first user message). Persisted to `localStorage` (`olo:session-display`), capped at 80 entries (oldest-by-use evicted). `removeSession` / `removeSessions` called on delete. Used for session list labels and Edit (✎) in ToolsPanel. |
| **tenantConfig** | `tenantConfigStore` | Tenants list (from `GET /api/tenants`), loading flag, selected tenant for config form, “adding new” flag. Actions: loadTenants, selectTenant, startAddNew, saveTenant, deleteTenant. Tenant CRUD uses `api/rest.ts`; list from `chatApi.getTenants()`. |

---

## API layer

| Module | Purpose |
|--------|---------|
| **chatApi** (`api/chatApi.ts`) | All olo backend calls: health, tenants, queues, queue config, sessions (create, list, delete, delete all), messages (list), send message, runs (get, events SSE, response). Base URL: `VITE_API_BASE` + `/api` (or `/api` when unset for Vite proxy). List sessions: `GET /api/tenants/{tenantId}/sessions?queue=...&pipeline=...` (queue = display name, no version). Create session body: `tenantId`, `taskQueue`, `queueName`, `pipelineId`, `overrides`. Send message body: `content`, `taskQueue`. |
| **ragApi** (`api/ragApi.ts`) | Documents upload `POST /api/rag/upload` (FormData: ragId, files; optional taskQueue, pipelineId from env). `getExistingRAGOptions()` returns ids from `VITE_RAG_OPTIONS`. |
| **rest** (`api/rest.ts`) | Tenant configuration REST (save, update, delete tenant) used by tenantConfigStore. |

Types (e.g. `ChatMessageDto`, `RunEventDto`, `SessionSummaryDto`, `TenantDto`, `QueueConfigDto`, `CreateSessionBody`) are in `chatApi.ts` or `types/tenant.ts`.

---

## Config and feature flags

| Module | Purpose |
|--------|---------|
| **features** (`config/features.ts`) | Feature flags per section: chat, knowledge, documents. `isFeatureEnabled(id)` hides sections and redirects invalid section paths. |
| **layout** (`types/layout.ts`) | `SECTIONS`: Chat (subOptions: conversation only), Knowledge (sources, create, status), Documents (upload). Drives left-panel menu and valid sub-ids. Queues are in the Conversation panel (Tools), not the left panel. |
| **toolRegistry** (`config/toolRegistry.ts`) | Map tool id → metadata (label, description, slot). Optional tool id → React component. `getToolsForView(sectionId, subId, runSelected)` returns tools for the current view from layout `SubOption.toolIds`. Tool components receive `ToolContext` (sectionId, subId, runSelected, storeContext). |

---

## Lib and shared utilities

| Module | Purpose |
|--------|---------|
| **queueDisplayName** (`lib/queueDisplayName.ts`) | Strips version suffix from queue name (e.g. `olo-chat-queue:1.0` → `olo-chat-queue`). Handles `%3A` in URL-decoded form. Used for display in dropdowns and for list/delete session API params (queue must be display name). |
| **wsUrl** (`lib/wsUrl.ts`) | `getWebSocketUrl(accessToken?)` — builds `ws(s)://.../ws` from `VITE_API_BASE`; `getWsAccessToken()` — sessionStorage or `VITE_WS_ACCESS_TOKEN`. |
| **wsSingleton** (`lib/wsSingleton.ts`) | Single shared WebSocket: `getSharedWebSocket(accessToken)`, `getCurrentSocket()`, `subscribeToRun(runId)` (sends `SUBSCRIBE_RUN`). When opening a new connection, does **not** call `close()` on a socket in `CONNECTING` state (avoids “closed before connection established”). |
| **useWebSocketLiveness** (`hooks/useWebSocketLiveness.ts`) | Connects to `/ws`, sends PING at `VITE_WS_PING_INTERVAL_SEC` (default 10), pushes PING/PONG into `runEventsStore` as liveness events. |
| **observability** (`lib/observability.ts`) | `logEvent(name, props)` for navigation/analytics; uses `import.meta.env.DEV` for debug. |
| **lastSelectedPath / lastTenant** | Persist last path and tenant in `localStorage` for defaulting on load. |

---

## Component tree (simplified)

```
App
├── TopBar (logo → default path, theme toggle)
└── app-body (CSS vars for panel widths)
    ├── LeftPanel (tenant dropdown, sections; Chat → Conversation only)
    ├── PanelResizeHandle (left)
    ├── ToolsPanel (Chat: Queue, Pipeline, New chat, sessions list, delete one/all; Knowledge: sources list) [hidden for documents / tenant config]
    ├── PanelResizeHandle (tools)
    ├── MainContent
    │   ├── ChatView (sectionId === 'chat') — messages, input, send, run events; queue/pipeline from store at action time
    │   ├── KnowledgeView (sectionId === 'knowledge')
    │   ├── RAGUploadView (sectionId === 'documents', subId === 'upload')
    │   └── placeholder for other sections
    ├── PanelResizeHandle (properties)
    └── PropertiesPanel (Events list or TenantConfigForm)
        ├── EventsList (Chat: last 25 run events, liveness excluded)
        └── TenantConfigForm (when editing tenant)
```

- **App** — URL ↔ store sync, tenant defaulting, panel query updates. Passes section/sub, tenant, runId, and callbacks into panels and MainContent.
- **ChatView** — Session/message/run: creates session with taskQueue, queueName, pipelineId from store; fetches sessions for selected queue (display name) + pipeline; fetches messages; sends message with taskQueue from store; subscribes to run events (SSE or WebSocket); derives assistant reply from events or run response API; shows fallback message for empty or metadata-only response. Optimistic user message on Send; optimistic new session on New chat; `lastCreatedSessionIdRef` used so refetch doesn’t clear selection when the new session is the one just created.
- **LeftPanel** — Renders section/sub from layout; under Chat only “Conversation” is shown.
- **ToolsPanel** — Chat: fetches queues and queue config (pipelines), Queue and Pipeline dropdowns (display names), session list scoped by selection, New chat, delete one (optimistic remove from store), delete all (API then clear selection and run events). List/delete use `queueDisplayName(selectedQueueId)` for queue param.
- **EventsList** — Reads `runEventsStore`; shows last 25 events (liveness filtered out); expand for timestamp, input, output, metadata; auto-scroll to bottom. Event list is not cleared on Send; `setRun(runId)` on new run clears and refills for that run.

---

## Data flow (Chat)

1. **Load** — App syncs URL to useUIStore; tenantConfigStore loads tenants. ToolsPanel fetches queues, sets first or previous selected queue, then fetches queue config and sets pipeline. ChatView fetches sessions for tenant + selected queue (display name) + pipeline; if no queue selected, session list is empty. User selects or creates session; messages fetched.
2. **Send message** — User sends; ChatView reads queue from conversationPanelStore at invoke time, calls sendMessage with taskQueue (display name); backend returns runId. ChatView calls setRun(runId), subscribes to events (SSE or WebSocket); new events appended via addEvent (event history for this run only; no clear() on Send). Assistant text from MODEL COMPLETED or getRunResponse; empty response shows fallback. On completion, Send re-enabled and messages refetched.
3. **New chat** — User clicks “New chat” in ToolsPanel; App increments trigger; ChatView reads queue and pipeline from store, creates session (tenantId, taskQueue, queueName, pipelineId), adds new session optimistically to list and selects it, refetches list (lastCreatedSessionIdRef prevents clearing selection when refetch returns empty). runEventsStore.clear() on New chat.
4. **Switch session** — User selects another session in list → ChatView updates selectedSessionId, refetches messages for that session. Run events store is cleared when opening session list in certain flows (e.g. after delete all).
5. **Delete session** — User clicks × on a session; ToolsPanel calls deleteSession(sessionId), then optimistically removes that session from chatSessionsStore (no refetch). If deleted session was selected, first remaining session is selected. sessionDisplayStore.removeSession(sessionId).
6. **Run events panel** — EventsList reads runEventsStore; events appended as they arrive; last 25 shown; panel scrolls to bottom; user can expand an event for input/output/metadata.

---

## Environment and build

- **Build-time env** — `VITE_API_BASE`, `VITE_WS_ACCESS_TOKEN`, `VITE_WS_PING_INTERVAL_SEC`, `VITE_RAG_OPTIONS`, `VITE_RAG_QUEUE`, `VITE_RAG_PIPELINE` are baked in by Vite. Used in `api/chatApi.ts`, `lib/wsUrl.ts`, `hooks/useWebSocketLiveness.ts`, `api/ragApi.ts`. See [DOCKER.md](./DOCKER.md).
- **Dev proxy** — Vite can proxy `/api` to the backend; the app still uses `VITE_API_BASE` for API and WebSocket URLs when set.

---

## Related docs

- [UI_FEATURES.md](./UI_FEATURES.md) — User-facing features and layout.
- [CHAT_UI.md](./CHAT_UI.md) — Chat APIs and execution model.
- [README.md](./README.md) — Overview and run instructions.
- [DOCKER.md](./DOCKER.md) — Docker and environment variables.
- [src/store/README.md](../src/store/README.md) — Store discipline and store list.
