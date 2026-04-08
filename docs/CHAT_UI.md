<!--
Copyright (c) 2026 Olo Labs
SPDX-License-Identifier: Apache-2.0
-->

# Chat UI

This document describes the **Chat** conversation flow in olo-chat: behavior, APIs used, queue vs pipeline, and how it aligns with the olo backend.

For a broader view of **stack, architecture, design, and communication patterns** (including SSE vs WebSocket), see [TECHNOLOGY_ARCHITECTURE.md](./TECHNOLOGY_ARCHITECTURE.md).

---

## Purpose

The Chat UI lets users:

1. Start a conversation (session) with the Olo backend.
2. Send messages and trigger runs (one run per user message).
3. See execution progress in real time (PLANNER, MODEL, TOOL, HUMAN, SYSTEM events) via SSE or WebSocket.
4. See the assistant’s final (or streaming) response when the MODEL node completes.

The backend (olo) is the single source of truth for sessions, messages, runs, and the execution event stream. See [olo/docs/ARCHITECTURE.md](../olo/docs/ARCHITECTURE.md) and [olo/docs/DESIGN.md](../olo/docs/DESIGN.md).

---

## APIs used

| Action | API | Notes |
|--------|-----|------|
| Health | `GET /api/health` | Polled by **`useBackendReachable`** so the SPA can show a disconnected state and hide misleading queue UI when the server is down. |
| UI context | `GET /api/ui/context` | **Tenant id** (`tenantId`), labels (**tenant**, **user**), **oloVersion**, optional **`chatProfiles`**. Each preset: **id**, **displayName**, **displaySummary**, optional **emoji**, **queue**, **pipeline**, **`runAgain`** (from pipeline JSON **`run_again`**). Profiles are read from the **regional pipelines snapshot** (Redis / DB `tree_json`): see **`chatProfiles.profiles.<id>`** with **`display_name`**, **`display_summary`**, **`emoji`**, **`queue`**, **`pipeline`**, optional **`run_again`**. **Profile mode**: preset beside composer; Tools panel omits Queue/Pipeline dropdowns. |
| List tenants | `GET /api/tenants` | Optional listing for admin/tenant-config flows; not used to drive a chat tenant picker. |
| List queues | `GET /api/tenants/{tenantId}/queues` | Queue names for the **backend-resolved** tenant; shown in the Conversation panel Queue dropdown. Names may include version (e.g. `olo-chat-queue:1.0`); display uses `queueDisplayName()` (strips after `:`). |
| Queue config | `GET /api/tenants/{tenantId}/queues/{queueName}/config` | Queue config JSON (e.g. `pipelines` array) for the Conversation panel Pipeline dropdown. `queueName` is the raw value from the queues list (can include version). |
| List sessions | `GET /api/tenants/{tenantId}/sessions?queue=...&pipeline=...` | **Legacy:** filter by selected queue (display name) + pipeline. **Profile mode:** call **without** queue/pipeline (tenant-wide list). |
| Create session | `POST /api/sessions` | **Profile mode:** often `{ "tenantId" }` only. **Legacy:** includes `taskQueue`, `queueName`, `pipelineId`. See below. |
| Send message | `POST /api/sessions/{sessionId}/messages` | Body: `{ "content", "taskQueue" }`. `taskQueue` from **`selectedQueueId`** (preset or legacy Queue). |
| List messages | `GET /api/sessions/{sessionId}/messages` | Load history when opening the conversation. |
| Run events (SSE) | `GET /api/runs/{runId}/events` | Server-Sent Events stream: catch-up then live. Each event is an `OloExecutionEvent` (nodeType, status, input, output, etc.). |
| Run response | `GET /api/runs/{runId}/response` | Used when run completes (or on event callback) to get final assistant text if not fully present in events. |
| WebSocket | `ws(s)://.../ws` (base from `VITE_API_BASE`) | Liveness: app connects and sends PING every `VITE_WS_PING_INTERVAL_SEC`; PONG (and PING) pushed into Run Events store. **Run events**: send `{ "type": "SUBSCRIBE_RUN", "runId": "..." }` to receive run events; used as alternative to SSE. See [olo/docs/WEBSOCKET.md](../olo/docs/WEBSOCKET.md). |
| Delete session | `DELETE /api/sessions/{sessionId}` | Per-conversation delete; frontend removes session from list optimistically. |
| Delete all sessions | `DELETE /api/tenants/{tenantId}/sessions?queue=...&pipeline=...` | Same query params as list; queue = display name. |

- **Human input** — When a **HUMAN** node is **WAITING**, **ChatView** calls `POST /api/runs/{runId}/human-input` with `{ "approved", "message" }`. Button labels and payloads come from the worker’s **`input.options`** array (objects with **`label`**, optional **`approved`**, **`message`**). The chat UI does not hardcode workflow-specific option text.

Payload examples for all of the above are in [olo/docs/API_PAYLOADS.md](../olo/docs/API_PAYLOADS.md).

---

## Create session (POST /api/sessions)

The frontend and backend contract for creating a session:

**Request body:**

```json
{
  "tenantId": "...",
  "taskQueue": "...",
  "queueName": "...",
  "pipelineId": "...",
  "overrides": {}
}
```

| Field | Required | Description |
|-------|----------|-------------|
| **tenantId** | Yes | Tenant for the session. |
| **taskQueue** | No | Workflow task queue (display name, from Conversation panel Queue dropdown). |
| **queueName** | No | Queue name stored on the session; frontend sends the same value as taskQueue when creating. |
| **pipelineId** | No | Pipeline within the queue (from Conversation panel Pipeline dropdown). |
| **overrides** | No | Reserved for future use (e.g. model/tool overrides). |

**Profile mode:** **New chat** may send **only `tenantId`**; the user’s queue/pipeline for sends comes from the **selected preset**, which updates `conversationPanelStore` (`selectedProfileId`, `selectedQueueId`, `selectedPipelineId`).

---

## Queue vs pipeline vs chat profiles

- **Legacy (no `chatProfiles`)** — **Queue** and **Pipeline** are chosen in the **Tools** Conversation panel. **Display name** for list/delete: `queueDisplayName()` in `lib/queueDisplayName.ts` (strip after `:`). **Create/send** use the selected queue id from the store as required by the backend.
- **Profile mode (`chatProfiles` from `/api/ui/context`)** — Presets are defined on the **pipeline document** stored for the region (e.g. DB seed / Redis **`chatProfiles`** block). The backend exposes them through **UI context**; the user picks a **preset** beside the composer and the app sets **queue** + **pipeline** in the store. **No Queue/Pipeline dropdowns** in the Tools panel.

### Profile copy and icons (Redis → UI)

- **`display_summary`** — Short behavioral line (e.g. “Quick replies with a fast, lightweight model.”). Shown as a **second line** under **“{displayName} is thinking…”** while a run is in progress, and available as tooltip context elsewhere.
- **`emoji`** — Optional icon string per preset in pipeline JSON; returned on **`ChatProfileDto.emoji`**. The UI uses it in **`lib/chatProfileUi.ts`** when present; otherwise it falls back to heuristics from id/name.
- **`run_again`** — Boolean per profile in pipeline JSON (e.g. `"run_again": true`). Exposed as **`runAgain`** on **`ChatProfileDto`**. When **true**, the preset appears in the **Run again** menu (icon under user messages); each option is labeled **emoji + display name** (`formatProfileOptionLabel`, same pattern as the preset `<select>`). When **false** or omitted, the preset may still appear in the composer preset dropdown only.

### Per-turn preset in message history

- Messages from the API include **`runId`** but not the preset id. The client records **`runId` → preset label** at send/resend time and shows a small **config pill** on user and assistant bubbles for that run.
- Mapping is **merged** with **`sessionStorage`** (`olo:chat-run-profiles:{sessionId}`) so labels survive refresh for the same session.

---

## UI behavior

- **Tenant & routing** — **Tenant** from **`GET /api/ui/context`**. Either **legacy** queue/pipeline dropdowns (Tools) or **profile** preset (composer). Default preset: first entry in **`chatProfiles`**.
- **Session** — **New chat** / selection as above; **profile** sessions are listed **without** queue/pipeline filters.
- **Message list** — Fetched with `GET /api/sessions/{sessionId}/messages`. After send, the list is refetched when the run completes. **Empty or metadata-only** assistant content (e.g. `""` or `{"source":"temporal"}`) is shown as: *"Apologise, Couldn't generate the response for your query."* (see `formatAssistantContent` in ChatView). **Profile mode:** each turn can show which **preset** was used (**config pill** on messages sharing the same **`runId`**).
- **Run events** — After sending, the frontend subscribes to events for the returned runId (SSE or WebSocket `SUBSCRIBE_RUN`) and appends each event to **`runEventsStore`** via **`addEvent`**. **`ChatView`** reads **`runEventsStore((s) => s.events)`** for the **human-input card**, **worker progress strip**, and workflow-complete logic so WebSocket **`RUN_EVENT`** updates (including **HUMAN COMPLETED** after **`POST .../human-input`**) always apply—even after a **full reload** at a human step (a separate React array would not receive socket-only updates). **`addEvent`** **dedupes** workflow events (by `runId` + `sequenceNumber`, etc.) so that after a **reload**, **rehydration** from `localStorage` plus **WebSocket replay** does not show duplicate lines. **Event history is not cleared when the user clicks Send**; for a new run, `setRun(runId)` is called so the list shows events for that run only. The **last 200 non-liveness** workflow events for the active **`runId`** are **persisted in `localStorage`** and **rehydrated** when the user reloads and returns to the same session (**`sessionStorage`**: `olo:chat-active-run:{sessionId}`). After rehydrate, **ChatView** registers **`setOnRunEventCallback`** again so **`getRunResponse` / `getRun` / `listMessages`** still run for incoming events. The app connects to the WebSocket and sends PING every 10s (liveness). The Events panel shows the last 25 run events (liveness PING/PONG excluded). The **left footer bell** uses **`runEventsBellUnread`** ( **`App`** + **`setOnWorkflowEventAppended`**) for **new workflow** events while the Events panel is **closed**.
- **Worker progress strip (bottom of chat)** — Below the message composer, a **collapsible** panel shows a **human-readable trace** of the **current run’s** execution events. It uses the **same event stream** as the rest of the app but presents it for quick scanning in the conversation column:
  - **Collapsed by default** (first visit): a thin bar with an **Expand progress** control so the main thread stays uncluttered. **Expanded/collapsed** and **panel height** (after resize) are **persisted in `localStorage`** (`olo:chat-progress-expanded`, `olo:chat-progress-height`) so they **survive refresh**, consistent with other layout preferences.
  - **Expanded**: a **resizable** scroll area (drag the top edge) listing up to the **last 200** non-liveness events for the active run (same cap as **browser persistence** for that run).
  - **Each line** includes **sequence number**, **node type** (e.g. PLANNER, MODEL, TOOL, HUMAN, SYSTEM), **status**, and **node id**, plus optional **`IN:`** / **`OUT:`** lines. Input and output objects are **summarized** (first few keys, string/number/boolean or truncated JSON—see `summarizeMap` / `summarizeValue` in `ChatView.tsx`), not shown as full raw payloads.
  - **Not chat history**: this strip is **UI-only**; it does not add messages to the thread. For **full detail** (timestamps, expandable JSON, metadata), use the **Events** property panel.
- **Assistant reply** — The UI takes the last run event with MODEL COMPLETED and uses `output.content` or `output.text` as the assistant message. If empty or metadata-only, the fallback message is shown. When the run completes, messages are refetched and the run response API can be used to fill in the reply if needed.
- **Panels** — Left panel (section nav; Chat shows only Conversation), Conversation panel (Queue, Pipeline, New chat, sessions), and Events panel each have independent resize handles and scroll.

---

## Execution model (backend)

Execution is described by **OloExecutionEvent** records: runId, nodeId, parentNodeId, nodeType (SYSTEM, PLANNER, MODEL, TOOL, HUMAN), status (STARTED, COMPLETED, FAILED, WAITING), timestamp, input, output, metadata. The Chat UI does not build a tree; it shows a flat, ordered list of events for the current run. Tree/DAG views and replay/diff are the responsibility of the Admin BE and tooling (see [olo/docs/DESIGN.md](../olo/docs/DESIGN.md)).

---

## Related docs

- [README.md](./README.md) — Overview, run instructions, project layout.
- [ARCHITECTURE.md](./ARCHITECTURE.md) — State, data flow, component tree.
- [UI_FEATURES.md](./UI_FEATURES.md) — All UI features and panels.
- **olo/docs/** — ARCHITECTURE.md, DESIGN.md, API_PAYLOADS.md, WEBSOCKET.md, DEMO.md.
