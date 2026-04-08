<!--
Copyright (c) 2026 Olo Labs
SPDX-License-Identifier: Apache-2.0
-->

# Architecture

This document describes the technical architecture of the olo-chat frontend: stack, routing, state, API layer, config, lib, and main data flows.

For a consolidated narrative on **technology choices, layered architecture, UI design, and backend communication** (REST, SSE, WebSocket), see **[TECHNOLOGY_ARCHITECTURE.md](./TECHNOLOGY_ARCHITECTURE.md)**.

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
- **Query params** — `tenant` (optional legacy), `menu`, `tools`, `props`. Panel expanded state and optional URL hints are synced from URL to store in `App.tsx` so that back/forward and deep links work. **Effective tenant id** for APIs is resolved by the backend (not a user-facing tenant picker).
- **Default path** — `DEFAULT_PATH = '/chat/conversation'`.

---

## State (Zustand stores)

All global UI and domain state lives in Zustand stores under `src/store/`. Components subscribe with `store((s) => s.x)` and call actions via `store.getState().action()`.

| Store | Export | Purpose |
|-------|--------|---------|
| **ui** | `useUIStore` | Panel expanded state (left, tools, properties), panel widths (persisted to `localStorage` key `olo:panel-widths`), theme (light/dark, key `olo-theme`), navigation (sectionId, subId, runId, tenantId). `setPanelStateFromUrl()` is called from App URL sync only. **`runEventsBellUnread`**: true when a **new workflow** event was appended while the **properties (Events) panel was closed**; **`App`** clears it when the panel **opens** (user “saw” Events). |
| **chatSessions** | `chatSessionsStore` | List of session summaries and selected session ID. Updated when sessions are fetched, or user selects/creates/deletes a session. |
| **runEvents** | `runEventsStore` | Current run ID and list of run events (SSE/WebSocket). **`ChatView` reads `s.events` as the single source of truth** for the in-chat timeline (human card, progress strip, completion checks)—not a duplicate React array—so **WebSocket** `RUN_EVENT` delivery updates the UI after refresh. `setRun(runId)` sets run and **clears** the events array (new run); **`setRun(null)`** clears events before a new `runId` is known. `addEvent(event)` appends **workflow** events only if not already present (**dedupe** by `runId` + `sequenceNumber`, or a fallback key) so **WebSocket replay after `hydrate` does not duplicate** rows. **`setOnWorkflowEventAppended`** (used by **`App`**) runs only when a **new deduped workflow** event is appended (not liveness, not hydrate)—drives **`runEventsBellUnread`**. Persists the **last 200 non-liveness** events to **`localStorage`** (`olo:run-events:{runId}`). `hydrate(runId, events)` restores after refresh (with **`sessionStorage`** `olo:chat-active-run:{sessionId}`) and dedupes the loaded array. Each new event can trigger `onRunEventCallback` (e.g. ChatView polls run response or refetches messages); **ChatView re-registers this callback after rehydrate** so post-refresh WebSocket events still run side effects. **Not** cleared when the user clicks Send (no `clear()` on Send). `clear()` is used on New chat (ChatView), Delete all (ToolsPanel), and when switching session in some flows; it nulls runId, events, and the callback. Liveness (PING/PONG) events are stored here; EventsList filters them by `nodeType !== 'liveness'`. |
| **conversationPanel** | `conversationPanelStore` | Selected **queue ID**, **pipeline ID**, and (when the backend exposes **chat profiles**) **selectedProfileId**. Profiles drive queue/pipeline in profile mode. Scopes session list, new-session creation, and send (`taskQueue` read at send time). |
| **sessionDisplay** | `sessionDisplayStore` | Per-session display: `customTitle` (user-edited), `firstMessagePreview` (auto from first user message). Persisted to `localStorage` (`olo:session-display`), capped at 80 entries (oldest-by-use evicted). `removeSession` / `removeSessions` called on delete. Used for session list labels and Edit (✎) in ToolsPanel. |
| **tenantConfig** | `tenantConfigStore` | Tenants list (from `GET /api/tenants`), loading flag, selected tenant for config form, “adding new” flag. Actions: loadTenants, selectTenant, startAddNew, saveTenant, deleteTenant. Tenant CRUD uses `api/rest.ts`; list from `chatApi.getTenants()`. |

---

## API layer

| Module | Purpose |
|--------|---------|
| **chatApi** (`api/chatApi.ts`) | All olo backend calls: health, **UI context** (`GET /api/ui/context`: tenant labels, `oloVersion`, **`chatProfiles`**). Each **`ChatProfileDto`**: `id`, `displayName`, **`displaySummary`**, optional **`emoji`**, **`runAgain`**, `queue`, `pipeline` — populated from **regional pipeline JSON** in Redis (`chatProfiles.profiles.*`, field **`run_again`**). Tenants, queues, queue config, sessions, messages, send, runs, **human input**. List sessions: optional `queue` / `pipeline` (legacy). Create/send as before. |
| **documentsUploadApi** (`api/documentsUploadApi.ts`) | **BE-handled** upload (`POST /api/resource/upload`; multipart `capabilitySource`). Persistence is **server-side** (local shared dir and/or **S3/Blob**-style storage behind an abstraction—not the SPA). Optional queue/pipeline from env (`VITE_RESOURCE_UPLOAD_*` or legacy `VITE_RAG_*`). See [olo/docs/DOCUMENTS_UPLOAD.md](../../olo/docs/DOCUMENTS_UPLOAD.md). |
| **rest** (`api/rest.ts`) | Tenant configuration REST (save, update, delete tenant) used by tenantConfigStore. |

Types (e.g. `ChatMessageDto`, `RunEventDto`, `SessionSummaryDto`, `TenantDto`, `QueueConfigDto`, `CreateSessionBody`) are in `chatApi.ts` or `types/tenant.ts`.

---

## Config and feature flags

| Module | Purpose |
|--------|---------|
| **features** (`config/features.ts`) | Feature flags per section: chat, knowledge, documents. `isFeatureEnabled(id)` hides sections and redirects invalid section paths. |
| **layout** (`types/layout.ts`) | `SECTIONS`: Chat (subOptions: conversation only), Knowledge (sources, create, status), Documents (upload). Drives left-panel menu and valid sub-ids. **Queue/pipeline** for chat are either in the Conversation tools panel (**legacy**) or chosen as a **preset** next to the composer (**profile mode** from `chatProfiles`). |
| **toolRegistry** (`config/toolRegistry.ts`) | Map tool id → metadata (label, description, slot). Optional tool id → React component. `getToolsForView(sectionId, subId, runSelected)` returns tools for the current view from layout `SubOption.toolIds`. Tool components receive `ToolContext` (sectionId, subId, runSelected, storeContext). |

---

## Lib and shared utilities

| Module | Purpose |
|--------|---------|
| **queueDisplayName** (`lib/queueDisplayName.ts`) | Strips version suffix from queue name (e.g. `olo-chat-queue:1.0` → `olo-chat-queue`). Handles `%3A` in URL-decoded form. Used for display in dropdowns and for list/delete session API params (queue must be display name). |
| **chatProfileUi** (`lib/chatProfileUi.ts`) | **`emojiForProfile`**, **`formatProfileOptionLabel`** — prefers **`emoji`** from the API when set; otherwise infers from id/name for UI. **`formatProfileOptionLabel`** builds **“{emoji} {displayName}”** for dropdowns and the **Run again** menu. Used for preset options, “thinking” row, config pills, and **Run again** rows (emoji + profile name). |
| **wsUrl** (`lib/wsUrl.ts`) | `getWebSocketUrl(accessToken?)` — builds `ws(s)://.../ws` from `VITE_API_BASE`; `getWsAccessToken()` — sessionStorage or `VITE_WS_ACCESS_TOKEN`. |
| **wsSingleton** (`lib/wsSingleton.ts`) | Single shared WebSocket: `getSharedWebSocket(accessToken)`, `getCurrentSocket()`, `subscribeToRun(runId)` (sends `SUBSCRIBE_RUN`). When opening a new connection, does **not** call `close()` on a socket in `CONNECTING` state (avoids “closed before connection established”). |
| **useWebSocketLiveness** (`hooks/useWebSocketLiveness.ts`) | Connects to `/ws`, sends PING at `VITE_WS_PING_INTERVAL_SEC` (default 10), pushes PING/PONG into `runEventsStore` as liveness events. Handles **`RUN_EVENT`** payloads with **`runEventsStore.addEvent`** (same store as SSE), so live events reach **`ChatView`** when not using the per-send SSE subscription. |
| **useBackendReachable** (`hooks/useBackendReachable.ts`) | Polls `GET /api/health` on an interval so **`App`** can pass **`backendReachable`** into **`MainContent`** / **`ChatView`** and **`ToolsPanel`**. When false, **ChatView** shows a full-width “Connecting…” state; **ToolsPanel** hides legacy Queue/Pipeline rows (no misleading empty lists). |
| **observability** (`lib/observability.ts`) | `logEvent(name, props)` for navigation/analytics; uses `import.meta.env.DEV` for debug. |
| **lastSelectedPath** | Persist last path in `localStorage` for defaulting on load (tenant is backend-resolved). |

---

## Component tree (simplified)

```
App
├── TopBar (logo → default path, theme toggle)
└── app-body (CSS vars for panel widths)
    ├── LeftPanel (sections; Chat → Conversation only)
    ├── PanelResizeHandle (left)
    ├── ToolsPanel (Chat: **legacy** — Queue + Pipeline + New chat + sessions; **profile mode** — no queue/pipeline rows; Knowledge: sources list) [hidden for documents / tenant config]
    ├── PanelResizeHandle (tools)
    ├── MainContent
    │   ├── ChatView — messages, composer, run events; **profile preset** select next to input when `chatProfiles` non-empty; else queue/pipeline from store at send time; **human-in-the-loop** card reads **`input.options`** from worker events only
    │   ├── KnowledgeView (sectionId === 'knowledge')
    │   ├── DocumentsUploadView (sectionId === 'documents', subId === 'upload')
    │   └── placeholder for other sections
    ├── PanelResizeHandle (properties)
    └── PropertiesPanel (Events list or TenantConfigForm)
        ├── EventsList (Chat: last 25 run events, liveness excluded)
        └── TenantConfigForm (when editing tenant)
```

- **App** — URL ↔ store sync; **`getUiContext()`** sets `tenantId`, footer labels, **`chatProfiles`**; **`useBackendReachable()`** feeds Chat + Tools. Passes `chatProfiles` and `backendReachable` into **MainContent** / **ToolsPanel**.
- **ChatView** — **Profile mode**: preset **pill** next to composer (emoji + name from API); main subtitle **→ Conversation with Olo AI**. **While sending**: status line **`{name} is thinking…`** plus **`displaySummary`** on the next line (from Redis via context). **`profileByRunId`**: maps each **`runId`** → preset label when send/resend returns; **message bubbles** show a **config pill** (same label) for user + assistant rows sharing that `runId`; map persisted in **`sessionStorage`** key `olo:chat-run-profiles:{sessionId}`. **Run again:** icon under **user** messages (not human-step replies) opens a menu of **other** presets with **`runAgain`**; each row shows **emoji + profile display name** (`formatProfileOptionLabel`). **Run timeline**: subscribes to **`runEventsStore((s) => s.events)`** for human-step card, progress strip, and workflow-complete detection (WebSocket updates the store only; a duplicate local array would stay stale after reload). **After rehydrate**, registers **`setOnRunEventCallback`** so **`getRunResponse` / `getRun` / `listMessages`** side effects still run for incoming **`RUN_EVENT`** messages. **Bottom worker progress strip**: collapsible, resizable panel **below the composer** showing **summarized** run events (`summarizeMap` on `input`/`output`) for in-thread progress; liveness filtered; **expanded state and height** persisted (`olo:chat-progress-expanded`, `olo:chat-progress-height`); **last 200** workflow events **restored** (`olo:run-events:{runId}`) after refresh (store **dedupes** replay). **Legacy** path unchanged. **`normalizeHumanStepHistoryContent`**, **`lastCreatedSessionIdRef`**, human **`input.options`** only.
- **LeftPanel** — Renders section/sub from layout; under Chat only “Conversation” is shown.
- **ToolsPanel** — Chat **legacy**: fetches queues + pipeline config, dropdowns, sessions scoped by queue/pipeline. **Profile mode**: Queue/Pipeline UI hidden (presets live in ChatView). **Backend down**: Queue/Pipeline rows hidden (no “No queues” placeholder). New chat, session list, delete flows unchanged.
- **EventsList** — Reads `runEventsStore`; shows last 25 events (liveness filtered out); expand for timestamp, input, output, metadata; auto-scroll to bottom. Event list is not cleared on Send; `setRun(runId)` on new run clears and refills for that run. **`addEvent`** dedupes workflow events (see **`runEvents.ts`**) so refresh + WebSocket replay does not duplicate rows.

---

## Data flow (Chat)

1. **Load** — App syncs URL; **`GET /api/ui/context`** supplies `tenantId` and optional **`chatProfiles`**. **Legacy:** ToolsPanel loads queues → pipeline; ChatView lists sessions with `queue` & `pipeline` query params. **Profile:** ToolsPanel skips queue APIs; ChatView lists sessions without queue/pipeline filters; first profile initializes `selectedProfileId` and queue/pipeline in the store for sends.
2. **Send message** — ChatView reads **`selectedQueueId`** from the store (preset or legacy dropdowns), calls `sendMessage` with **`taskQueue`** (`queueDisplayName` when set). Backend returns `runId`; SSE/WebSocket unchanged. **Human WAITING:** buttons are built from **`input.options`** (worker-defined); submit uses **`POST /api/runs/{runId}/human-input`**. Completion and the next pipeline steps appear as **`RUN_EVENT`** on the shared WebSocket → **`runEventsStore`**; the human card clears when **HUMAN COMPLETED** is in the store timeline. Assistant text from MODEL COMPLETED or `getRunResponse`; empty response → fallback. On completion, Send re-enabled and messages refetched.
3. **New chat** — ToolsPanel button increments App trigger. **Profile mode:** `createSession(tenantId, {})`. **Legacy:** session body includes queue/pipeline from store. Optimistic session + refetch; `runEventsStore.clear()`.
4. **Switch session** — User selects another session in list → ChatView updates selectedSessionId, refetches messages for that session. Run events store is cleared when opening session list in certain flows (e.g. after delete all).
5. **Delete session** — User clicks × on a session; ToolsPanel calls deleteSession(sessionId), then optimistically removes that session from chatSessionsStore (no refetch). If deleted session was selected, first remaining session is selected. sessionDisplayStore.removeSession(sessionId).
6. **Run events panel** — EventsList reads runEventsStore; events appended as they arrive (duplicates skipped); last 25 shown; panel scrolls to bottom; user can expand an event for input/output/metadata. Store **rehydrates** from **`localStorage`** when reopening a session after refresh (same **`runId`**).

---

## Environment and build

- **Build-time env** — `VITE_API_BASE`, `VITE_WS_ACCESS_TOKEN`, `VITE_WS_PING_INTERVAL_SEC`, `VITE_CAPABILITY_SOURCE_OPTIONS` (or `VITE_RAG_OPTIONS`), `VITE_RESOURCE_UPLOAD_QUEUE` / `VITE_RESOURCE_UPLOAD_PIPELINE` (or legacy `VITE_RAG_QUEUE` / `VITE_RAG_PIPELINE`) are baked in by Vite. Used in `api/chatApi.ts`, `lib/wsUrl.ts`, `hooks/useWebSocketLiveness.ts`, `api/documentsUploadApi.ts`. See [DOCKER.md](./DOCKER.md).
- **Dev proxy** — Vite can proxy `/api` to the backend; the app still uses `VITE_API_BASE` for API and WebSocket URLs when set.

---

## Related docs

- [TECHNOLOGY_ARCHITECTURE.md](./TECHNOLOGY_ARCHITECTURE.md) — Technology, design, and communication (detailed).
- [UI_FEATURES.md](./UI_FEATURES.md) — User-facing features and layout.
- [CHAT_UI.md](./CHAT_UI.md) — Chat APIs and execution model.
- [README.md](./README.md) — Overview and run instructions.
- [DOCKER.md](./DOCKER.md) — Docker and environment variables.
- [src/store/README.md](../src/store/README.md) — Store discipline and store list.
