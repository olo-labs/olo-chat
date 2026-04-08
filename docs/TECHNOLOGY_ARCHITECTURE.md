<!--
Copyright (c) 2026 Olo Labs
SPDX-License-Identifier: Apache-2.0
-->

# Technology, architecture, design, and communication

This document is the **detailed companion** to [ARCHITECTURE.md](./ARCHITECTURE.md). It explains the **technology choices**, **logical architecture**, **UI design**, and **how olo-chat communicates** with the Olo chat backend and, indirectly, Temporal workers.

---

## 1. Technology stack

| Area | Choice | Role |
|------|--------|------|
| **Language** | TypeScript | Static typing for API DTOs, stores, and routes. |
| **UI library** | React 18 | Components, hooks, concurrent-friendly rendering. |
| **Build / dev server** | Vite 5 | Fast HMR, env injection (`import.meta.env`), production bundle. |
| **Routing** | React Router 7 | SPA paths and search params (`BrowserRouter`). |
| **Client state** | Zustand 5 | Lightweight global stores; no Redux. |
| **Testing** | Vitest + Testing Library | Unit/component tests (`*.test.ts(x)`). |
| **Optional** | Storybook | Isolated UI development for selected components. |

**Runtime**: the app is a **static SPA** after `npm run build`; it is served by any static host or dev server. All dynamic data comes from the **olo** backend (or from env at build time for labels and RAG defaults).

---

## 2. Logical architecture

### 2.1 Layers

```
┌─────────────────────────────────────────────────────────────┐
│  Presentation (React components, CSS)                      │
│  App, panels, ChatView, EventsList, forms …                │
├─────────────────────────────────────────────────────────────┤
│  Application state (Zustand)                               │
│  UI navigation, sessions, run events, conversation scope   │
├─────────────────────────────────────────────────────────────┤
│  API adapters (chatApi, documentsUploadApi, rest)         │
│  fetch(), SSE reader, auth headers                         │
├─────────────────────────────────────────────────────────────┤
│  Transport                                                   │
│  HTTPS REST, SSE (text/event-stream), WebSocket (optional) │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
                    Olo chat backend (Spring Boot)
                    /api → sessions, messages, runs, tenants …
                              │
                              ▼
              Temporal (workflows) + worker(s)
```

- **No business workflow logic in the browser**: the UI starts runs and displays **execution events** returned by the backend; workers execute pipelines.
- **Single source of truth** for chat data: the backend (and Redis where the backend persists messages).

### 2.2 Module boundaries

| Folder | Responsibility |
|--------|------------------|
| `src/components/` | Screens and composite UI; minimal logic; read/write stores and call APIs. |
| `src/store/` | Cross-cutting state; URL-related state is synced from `App.tsx`. |
| `src/api/` | HTTP contracts; no React. |
| `src/lib/` | URLs, queue display names, **chat profile** labels (**`chatProfileUi`**), WebSocket singleton, observability helpers. |
| `src/config/` | Feature flags, tool registry. |
| `src/types/` | Shared types (layout sections, tenant forms). |

---

## 3. Design and UX

### 3.1 Layout model

- **Three-column shell** (left navigation + tools + main + properties): widths are **resizable** and **persisted** (`localStorage`, see `useUIStore`).
- **Resize handles** match a thin splitter pattern (hover highlights in blue) — see `PanelResizeHandle` and `resize-handles.css`.
- **Chat routing** — **Legacy:** **Queue** + **Pipeline** in the **Conversation** tools panel. **Profile mode** (`chatProfiles` from **`GET /api/ui/context`**, sourced from regional **pipeline JSON** / Redis): presets **next to the composer** (emoji + name); **no** duplicate profile strip under the page title; tools panel **sessions** + **New chat** only.

### 3.2 Theming

- Light/dark via data attribute / CSS variables (`theme.css`, `chat-view.css`).
- Top bar: branding and theme toggle.

### 3.3 Chat-specific UX

- **Messages**: user/assistant bubbles; optimistic user message on send; assistant text from run events or `GET /api/runs/{runId}/response`; fallback copy when the model returns empty metadata-only payloads. **Legacy assistant lines** with an `<Options>` header are **normalized at display time**. **Profile mode:** small **config pills** on bubbles show which **preset** was used for that **`runId`** (client map + **`sessionStorage`** key `olo:chat-run-profiles:{sessionId}`).
- **Presets (profile mode)**: **`displaySummary`** and **`emoji`** come from the backend (**UI context** ← pipeline **`chatProfiles`** in Redis/DB). While a run is active, a **two-line** waiting block shows **“{displayName} is thinking…”** then **`displaySummary`**. **`lib/chatProfileUi.ts`** prefers server **`emoji`**, else infers from id/name.
- **Run again** (profile mode): under **each user message** (not human-step replies), an **icon** opens a menu of **other** presets with **`run_again`: true** ( **`runAgain`** on **`GET /api/ui/context`**). Each row shows **emoji + profile display name** (same **`formatProfileOptionLabel`** as the preset dropdown). Resends that message’s text with the chosen queue/pipeline. Presets without **`run_again`** still appear in the composer dropdown but not in this menu.
- **Human-in-the-loop**: when a run emits **`HUMAN` + `WAITING`**, **ChatView** renders **one control per entry** in **`input.options`** (worker-defined **`label`** / **`message`** / **`approved`**). **`POST /api/runs/{runId}/human-input`** signals the workflow. The **waiting vs completed** state is derived from **`runEventsStore.events`** (same stream as WebSocket **`RUN_EVENT`**), so after a **tab reload** the UI still advances when **HUMAN COMPLETED** arrives. No workflow-specific default button labels live in the React layer.
- **Worker progress strip** (below the composer): **collapsible** panel (collapsed by default on first visit) that lists the **current run’s** execution events in **plain language**; **expanded state and height** persist in **`localStorage`** across refresh (aligned with resizable panel width persistence): each row shows sequence, **nodeType**, **status**, **nodeId**, and **short `IN:` / `OUT:`** lines produced by summarizing the event’s `input` / `output` maps (first keys, truncated values—not the full Events panel JSON). **Liveness** events are filtered out; the list caps at the **last 200** events. The same **last 200 non-liveness** events are **persisted** in **`localStorage`** per **`runId`** and **rehydrated** after a full page reload when the user reopens the same chat session (**`sessionStorage`** tracks the last active **`runId`** per session). **Resize** the panel height; **collapse** to minimize distraction. **UI-only** (not chat messages). The **Events** property panel remains the place for **expandable** detail and the **last 25** events display rule.
- **Availability**: **`useBackendReachable`** polls **`GET /api/health`**. If the backend is down, the **chat column** shows a full-width waiting message; legacy Queue/Pipeline rows in the tools panel are **suppressed** to avoid empty-state confusion.

### 3.4 Events panel (Properties)

- **EventsList** shows the last N run events from `runEventsStore`, with expand/collapse for JSON detail. Liveness PING/PONG may be filtered for display. The store **hydrates** from **`localStorage`** on load and **`addEvent`** **dedupes** workflow events (replay after rehydrate does not duplicate rows). See **`runEvents.ts`**.

---

## 4. Communication with the backend

### 4.1 Base URL and proxy

- **`VITE_API_BASE`**: full origin of the chat API (e.g. `http://localhost:7080`). `chatApi` builds paths as `` `${base}/api/...` ``.
- **Development**: `vite.config.ts` proxies `/api` to `http://localhost:7080` so relative `/api` also works when `VITE_API_BASE` is unset.
- **Auth**: optional Bearer token for tenant-scoped APIs and WebSocket (see `getApiAuthHeaders`, `wsUrl.ts`).

### 4.2 REST (request/response)

| Concern | Typical endpoints |
|---------|-------------------|
| Health | `GET /health` |
| Tenant context | `GET /api/ui/context` (backend-resolved `tenantId` for APIs). `GET /api/tenants` is for admin/tenant-config listing, not a chat tenant picker. |
| Queues / pipelines | `GET /api/tenants/{id}/queues`, `GET .../queues/{name}/config` |
| Sessions | `POST /api/sessions`, `GET .../tenants/{id}/sessions?queue=&pipeline=` |
| Messages | `GET /api/sessions/{sessionId}/messages`, `POST .../messages` |
| Runs | `GET /api/runs/{runId}`, `GET /api/runs/{runId}/response` |
| Human input | `POST /api/runs/{runId}/human-input` |

Payload shapes are illustrated in **`olo/docs/API_PAYLOADS.md`** (relative to monorepo root).

### 4.3 Server-Sent Events (SSE) — primary live stream

- **Endpoint**: `GET /api/runs/{runId}/events` with `Accept: text/event-stream`.
- **Behavior**: long-lived HTTP connection; server pushes **JSON objects** (one execution event per message). The client parses `data: {json}` lines (implementation tolerates payloads with embedded newlines).
- **Use case**: stream **PLANNER**, **MODEL**, **TOOL**, **HUMAN**, **SYSTEM** steps as the worker reports them to the backend.

### 4.4 WebSocket (optional alternative)

- **Endpoint**: derived from `VITE_API_BASE` → `ws(s)://host/ws` (see `lib/wsUrl.ts`).
- **Pattern**: connect once; send `SUBSCRIBE_RUN` with `runId` to receive the same class of events as SSE. **`RUN_EVENT`** messages are applied with **`runEventsStore.addEvent`** (see **`useWebSocketLiveness`**). Used when a shared socket is preferred (e.g. liveness PING/PONG).
- **Singleton**: `wsSingleton.ts` avoids duplicate connections and handles `CONNECTING` state safely.

### 4.5 Event data model (client)

- **`RunEventDto`** (`chatApi.ts`): `runId`, `nodeId`, `nodeType`, `status`, `sequenceNumber`, `input`, `output`, `metadata`, etc.
- **Ordering**: `sequenceNumber` is used for idempotency on the server; the UI appends in arrival order and may cap visible history (e.g. Events list vs Chat progress strip).

### 4.6 End-to-end flow (send message → completion)

1. User sends a message → `POST .../messages` → backend creates run and starts workflow.
2. UI stores `runId`, subscribes to **SSE** (or WebSocket).
3. Backend receives worker callbacks → `POST /api/runs/{runId}/events` → persists and forwards to SSE subscribers.
4. UI updates stores, assistant text, and progress views.
5. On workflow completion, backend may append **SYSTEM COMPLETED**; UI may poll `GET .../runs/{runId}` or rely on events to re-enable Send and refetch messages.

---

## 5. Related documentation

| Document | Content |
|----------|---------|
| [ARCHITECTURE.md](./ARCHITECTURE.md) | Stores, routes, component tree, data flow (detailed tables). |
| [CHAT_UI.md](./CHAT_UI.md) | Chat APIs and execution model. |
| [UI_FEATURES.md](./UI_FEATURES.md) | Feature-level UI description. |
| [README.md](./README.md) | Overview, run instructions, index. |
| [olo/docs/ARCHITECTURE.md](../../olo/docs/ARCHITECTURE.md) | Full system: Chat BE, Temporal, workers. |
| [olo/docs/API_PAYLOADS.md](../../olo/docs/API_PAYLOADS.md) | Example JSON for REST and SSE. |

---

## 6. Operational notes

- **CORS**: backend must allow the frontend origin if not using same-origin proxy.
- **Scaling**: SSE is one connection per open run stream; close streams when leaving a session or run if you add long-lived navigation.
- **Versioning**: app version is package `version`; backend may expose **Olo version** via `/api/ui/context`.
