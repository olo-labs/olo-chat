<!--
Copyright (c) 2026 Olo Labs
SPDX-License-Identifier: Apache-2.0
-->

# Chat UI

Chat conversation flow in olo-chat: behavior, APIs, chat profiles, and alignment with the olo backend.

See [TECHNOLOGY_ARCHITECTURE.md](./TECHNOLOGY_ARCHITECTURE.md) for stack and communication patterns.

---

## Purpose

The Chat UI lets users:

1. Start a conversation (session) with the Olo backend.
2. Choose a **preset** (role) that sets Temporal **task queue** and **pipeline** id.
3. Send messages and trigger runs (one run per user message).
4. See execution progress in real time (PLANNER, MODEL, TOOL, HUMAN, SYSTEM) via SSE or WebSocket.
5. See the assistant response when the MODEL node completes.

The backend is the single source of truth. Chat **requires** `chatProfiles` from `GET /api/ui/context`.

---

## Configuration (backend)

Workflow JSON files live under **`olo.configuration.dir`**, e.g.:

```
olo-mono/olo-configuration/default/
  ask.json
  fast.json
  detailed.json
  ...
```

Each file is a `WorkflowDefinition`. The backend exposes them as **`chatProfiles`**:

| Workflow JSON | API `ChatProfileDto` |
|---------------|----------------------|
| `id` | `id`, `pipeline` |
| `role` | `displayName` |
| `shortDescription` | `displaySummary` |
| `emoji` | `emoji` |
| `queue` | `queue` (Temporal task queue; typically equals `id`) |
| `runAgain` | `runAgain` |

Set **`OLO_CONFIGURATION_DIR`** on the backend (see `olo/start.bat` and `olo/.env.example`).

---

## APIs used

| Action | API | Notes |
|--------|-----|------|
| Health | `GET /api/health` | Polled by `useBackendReachable`. |
| UI context | `GET /api/ui/context` | `tenantId`, labels, `oloVersion`, **`chatProfiles`**. |
| List tenants | `GET /api/tenants` | Optional; not a chat tenant picker. |
| List sessions | `GET /api/tenants/{tenantId}/sessions` | Tenant-wide (no queue filter in current UI). |
| Create session | `POST /api/sessions` | Body: `{ "tenantId" }`. |
| Send message | `POST /api/sessions/{sessionId}/messages` | `{ "content", "taskQueue" }` from selected preset. |
| List messages | `GET /api/sessions/{sessionId}/messages` | History when opening a session. |
| Run events (SSE) | `GET /api/runs/{runId}/events` | Catch-up + live `OloExecutionEvent` stream. |
| Run response | `GET /api/runs/{runId}/response` | Final assistant text. |
| Run status | `GET /api/runs/{runId}` | Polled on completion. |
| WebSocket | `ws(s)://.../ws` | `SUBSCRIBE_RUN` for run events; PING/PONG for liveness. |
| Human input | `POST /api/runs/{runId}/human-input` | `{ "approved", "message" }` from worker `input.options`. |
| Delete session | `DELETE /api/sessions/{sessionId}` | Optimistic UI removal. |
| Delete all | `DELETE /api/tenants/{tenantId}/sessions?queue=&pipeline=` | Scoped to **current preset** queue + pipeline. |

The frontend does **not** call queue-list or queue-config endpoints.

---

## Create session

```json
{ "tenantId": "default" }
```

Queue and pipeline for sends come from the **selected preset** at message time (`taskQueue` on `POST .../messages`), not from the session create body.

---

## Presets and task queues

- **Preset select** — Beside the composer (emoji + display name). Tooltip from `displaySummary`.
- **While sending** — “{displayName} is thinking…” plus `displaySummary` on the next line.
- **Config pills** — On user/assistant bubbles: which preset was used for that `runId` (map in `sessionStorage`: `olo:chat-run-profiles:{sessionId}`).
- **Run again** — Icon under user messages (not human-step replies). Menu lists other presets with `runAgain: true` (emoji + name).
- **Task queue** — Each preset’s `queue` is sent as `taskQueue` (e.g. preset `ask` → queue `ask`).

---

## UI behavior

- **No profiles** — Blocking empty state: “No chat profiles configured.” Add workflow JSON under `olo.configuration.dir`.
- **Session list** — Tenant-wide; labels from custom title, first message preview, or timestamp.
- **Run events** — `runEventsStore` is the single in-chat timeline. Last 200 workflow events persisted per `runId`. WebSocket preferred when connected; else SSE.
- **Worker progress strip** — Collapsible panel below composer; summarized IN/OUT; expanded state persisted.
- **Assistant reply** — From MODEL COMPLETED or `GET .../response`; empty payload → fallback copy in `formatAssistantContent`.
- **Backend down** — Full-width “Connecting to Olo backend…” in chat column.

---

## Execution model (backend)

**OloExecutionEvent**: `runId`, `nodeId`, `nodeType`, `status`, `input`, `output`, `metadata`, `sequenceNumber`. The Chat UI shows a flat ordered list for the current run (Events panel: last 25; progress strip: up to 200).

---

## Related docs

- [README.md](./README.md)
- [ARCHITECTURE.md](./ARCHITECTURE.md)
- [UI_FEATURES.md](./UI_FEATURES.md)
- [olo/olo-temporal-sdk/docs/ARCHITECTURE.md](../../olo/olo-temporal-sdk/docs/ARCHITECTURE.md)
