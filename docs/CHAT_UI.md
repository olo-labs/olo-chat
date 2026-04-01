<!--
Copyright (c) 2026 Olo Labs
SPDX-License-Identifier: Apache-2.0
-->

# Chat UI

This document describes the **Chat** conversation flow in olo-chat: behavior, APIs used, queue vs pipeline, and how it aligns with the olo backend.

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
| Health | `GET /api/health` | Used to decide if the app can load (backend ready). |
| List tenants | `GET /api/tenants` | Populates top dropdown; returns default tenant and optionally Redis-discovered tenant ids. |
| List queues | `GET /api/tenants/{tenantId}/queues` | Queue names for selected tenant; shown in the Conversation panel Queue dropdown. Names may include version (e.g. `olo-chat-queue:1.0`); display uses `queueDisplayName()` (strips after `:`). |
| Queue config | `GET /api/tenants/{tenantId}/queues/{queueName}/config` | Queue config JSON (e.g. `pipelines` array) for the Conversation panel Pipeline dropdown. `queueName` is the raw value from the queues list (can include version). |
| List sessions | `GET /api/tenants/{tenantId}/sessions?queue=...&pipeline=...` | Sessions for the selected queue and pipeline. **`queue` must be the display name** (no version suffix), e.g. `olo-chat-queue-oolama-debug`. `pipeline` as-is from config (e.g. `olo-chat-queue-oolama`). Omitted params mean no filtering. |
| Create session | `POST /api/sessions` | Body: `{ "tenantId", "taskQueue", "queueName", "pipelineId", "overrides" }`. See [Create session](#create-session-post-apisessions) below. Called when user clicks New chat; queue/pipeline read from store at create time. |
| Send message | `POST /api/sessions/{sessionId}/messages` | Body: `{ "content", "taskQueue" }`. `taskQueue` is the **display name** (from store at send time). Backend creates message + run, starts workflow, returns `messageId`, `runId`. |
| List messages | `GET /api/sessions/{sessionId}/messages` | Load history when opening the conversation. |
| Run events (SSE) | `GET /api/runs/{runId}/events` | Server-Sent Events stream: catch-up then live. Each event is an `OloExecutionEvent` (nodeType, status, input, output, etc.). |
| Run response | `GET /api/runs/{runId}/response` | Used when run completes (or on event callback) to get final assistant text if not fully present in events. |
| WebSocket | `ws(s)://.../ws` (base from `VITE_API_BASE`) | Liveness: app connects and sends PING every `VITE_WS_PING_INTERVAL_SEC`; PONG (and PING) pushed into Run Events store. **Run events**: send `{ "type": "SUBSCRIBE_RUN", "runId": "..." }` to receive run events; used as alternative to SSE. See [olo/docs/WEBSOCKET.md](../olo/docs/WEBSOCKET.md). |
| Delete session | `DELETE /api/sessions/{sessionId}` | Per-conversation delete; frontend removes session from list optimistically. |
| Delete all sessions | `DELETE /api/tenants/{tenantId}/sessions?queue=...&pipeline=...` | Same query params as list; queue = display name. |

Optional:

- **Human input** — When the run is in `waiting_human`, the UI could call `POST /api/runs/{runId}/human-input` with `{ "approved": true, "message": "..." }` and the backend signals the workflow.

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

The frontend reads the current queue and pipeline from `conversationPanelStore` at create time and sends this when the user clicks **New chat**.

---

## Queue vs pipeline

- **Queue** (Conversation panel) — The workflow queue. API may return names with version (e.g. `olo-chat-queue:1.0`). For **display** and for **list/delete session** query params, the frontend uses the **display name** (no version): `queueDisplayName(name)` strips the part after `:`. For **create session** and **send message**, `taskQueue` and `queueName` use the raw queue id from the dropdown (backend accepts both; list/delete require display name). In practice the frontend passes display name for list/delete and the selected queue id (which may include version) for create/send as required by the backend.
- **Pipeline** (Conversation panel) — A classification within the selected queue. Loaded from the queue’s config (`GET /api/tenants/{tenantId}/queues/{queueName}/config`); the config’s `pipelines` array populates the Pipeline dropdown. Session list and new sessions are scoped by the selected queue and pipeline.

**Display name** — `lib/queueDisplayName.ts`: if the queue name contains `:`, only the part before the first `:` is used (and URL-decoded for `%3A`). Example: `olo-chat-queue-oolama-debug:1.0` → `olo-chat-queue-oolama-debug`.

---

## UI behavior

- **Tenant & queues** — Top dropdown from `GET /api/tenants`. Under Chat, the selected tenant’s workflow queues are loaded with `GET /api/tenants/{tenantId}/queues`. Choosing a queue loads its config; the Conversation panel shows the **Pipeline** dropdown from the config’s `pipelines`. Default: first or previously selected queue and pipeline.
- **Session** — User selects a session from the list or clicks New chat. New chat creates a session via POST /api/sessions with tenantId, taskQueue, queueName, pipelineId (from store). The new session is added optimistically to the list and selected. All messages in the view belong to the selected session.
- **Message list** — Fetched with `GET /api/sessions/{sessionId}/messages`. After send, the list is refetched when the run completes. **Empty or metadata-only** assistant content (e.g. `""` or `{"source":"temporal"}`) is shown as: *"Apologise, Couldn't generate the response for your query."* (see `formatAssistantContent` in ChatView).
- **Run events** — After sending, the frontend subscribes to events for the returned runId (SSE or WebSocket `SUBSCRIBE_RUN`) and appends each event to the run events store. **Event history is not cleared when the user clicks Send**; for a new run, `setRun(runId)` is called so the list shows events for that run only. The app also connects to the WebSocket and sends PING every 10s (liveness). The Events panel shows the last 25 run events (liveness PING/PONG excluded).
- **Assistant reply** — The UI takes the last run event with MODEL COMPLETED and uses `output.content` or `output.text` as the assistant message. If empty or metadata-only, the fallback message is shown. When the run completes, messages are refetched and the run response API can be used to fill in the reply if needed.
- **Panels** — Left panel (tenant, section; Chat shows only Conversation), Conversation panel (Queue, Pipeline, New chat, sessions), and Events panel each have independent resize handles and scroll.

---

## Execution model (backend)

Execution is described by **OloExecutionEvent** records: runId, nodeId, parentNodeId, nodeType (SYSTEM, PLANNER, MODEL, TOOL, HUMAN), status (STARTED, COMPLETED, FAILED, WAITING), timestamp, input, output, metadata. The Chat UI does not build a tree; it shows a flat, ordered list of events for the current run. Tree/DAG views and replay/diff are the responsibility of the Admin BE and tooling (see [olo/docs/DESIGN.md](../olo/docs/DESIGN.md)).

---

## Related docs

- [README.md](./README.md) — Overview, run instructions, project layout.
- [ARCHITECTURE.md](./ARCHITECTURE.md) — State, data flow, component tree.
- [UI_FEATURES.md](./UI_FEATURES.md) — All UI features and panels.
- **olo/docs/** — ARCHITECTURE.md, DESIGN.md, API_PAYLOADS.md, WEBSOCKET.md, DEMO.md.
