<!--
Copyright (c) 2026 Olo Labs
SPDX-License-Identifier: Apache-2.0
-->

# UI Features

This document describes all user-facing UI features of the olo-chat frontend: layout, sections, panels, URL/query, and interactions.

---

## Overview

The app is a multi-panel layout with URL-driven navigation. Main areas:

- **Top bar** — Logo (home), theme toggle.
- **Left panel** — Tenant dropdown, section navigation (**Chat**, **Knowledge**, **Documents**). Under Chat: **Conversation** (single submenu). Under Knowledge: Sources, Create new, Status. Under Documents: Upload / manage raw files.
- **Center** — **Chat**: conversation view (messages, input, send, run events). **Knowledge**: Sources / Create new / Status views. **Documents**: Upload (knowledge source + file/folder, Start RAG).
- **Tools panel** — **Chat**: Conversation sidebar (**Queue** dropdown, **Pipeline** dropdown, New chat, sessions list, delete one, delete all). **Knowledge**: List of knowledge sources. Hidden for Documents.
- **Properties panel** — Right sidebar: Run events (Chat), or tenant config form. Toggle to expand/collapse (bell icon for Events).

Panel widths are resizable and persisted in `localStorage` (`olo:panel-widths`). Panel open/closed state is in the URL query (`menu`, `tools`, `props`).

---

## Top bar

| Feature | Description |
|--------|-------------|
| **Logo** | Olo logo; click navigates to default home path (Chat → Conversation) while keeping tenant and panel query. |
| **Theme toggle** | Switches between light and dark theme. Theme persisted in `localStorage` (`olo-theme`) and applied via `data-theme` on the document. |

---

## Left panel

| Feature | Description |
|--------|-------------|
| **Toggle** | Expand/collapse the left panel. State reflected in URL query `menu` (0 = collapsed, 1 = expanded). |
| **Tenant dropdown** | Lists tenants from `GET /api/tenants`. Selected tenant stored in URL query `tenant`. Default: last selected or first tenant from the list. |
| **Section navigation** | Sections: **Chat**, **Knowledge**, **Documents**. Chat has one sub-option **Conversation** (path `/chat/conversation`). Knowledge: Sources, Create new, Status. Documents: Upload / manage raw files. Clicking a section/sub updates the URL path. |
| **Chat → Conversation** | Under Chat, the left panel shows only **Conversation**. Workflow queues are selected in the **Conversation panel** (Tools) via the **Queue** dropdown, not in the left panel. |
| **Expand / collapse categories** | Categories (sections) can be expanded or collapsed; “Expand all” / “Collapse all” when the panel is expanded. |
| **Context menu** | Right-click on the menu area opens a context menu (e.g. expand/collapse). |
| **Events indicator** | When there are run events, the left panel can show an indicator that there is something to review in the Events panel. |

Sections and visibility are controlled by **feature flags** (`config/features.ts`). Disabled sections are hidden and invalid section paths redirect to the default path.

---

## Main content

Content depends on the current section and sub-option.

### Chat → Conversation

| Feature | Description |
|--------|-------------|
| **Header** | Title “Chat” and subtitle “→ Conversation with Olo”. |
| **Chat view** | Message list, text input, send button, and (when a run is active) live run events and assistant reply derived from the event stream or run response API. |
| **Session** | User selects a session from the list or clicks **New chat**. New chat creates a session via `POST /api/sessions` with `tenantId`, `taskQueue`, `queueName`, `pipelineId` (from Conversation panel, read from store at create time). The new session is added optimistically to the list and selected. Messages in the view belong to the selected session. |
| **Message list** | Fetched with `GET /api/sessions/{sessionId}/messages`. User and assistant messages shown. Assistant content from the last MODEL COMPLETED event or from `GET /api/runs/{runId}/response` when the run completes. **Empty or metadata-only** assistant response (e.g. `""` or `{"source":"temporal"}`) shows: *"Apologise, Couldn't generate the response for your query."* |
| **Input & Send** | User types in the input; Send submits via `POST /api/sessions/{sessionId}/messages` with `content` and `taskQueue` (from Conversation panel Queue selection, read from store at send time). While a run is in progress, Send is disabled until the run completes (or fails). Optimistic user message is appended on Send. |
| **Resend** | User can resend a previous user message (triggers a new run). |
| **Common prompts** | Optional quick-select prompts to fill the input. |
| **Health** | App checks `GET /api/health`; connection status can be shown (e.g. backend not reachable). |
| **Errors** | API or stream errors shown in the chat area with optional retry. |

### Knowledge

| Feature | Description |
|--------|-------------|
| **Sub-options** | **Sources** — List of knowledge sources in the Tools panel. **Create new** — Create new knowledge source (placeholder). **Status** — Indexed, processing (placeholder). |
| **Header** | Title “Knowledge” and subtitle “→ {currentLabel}” (e.g. Sources, Create new, Status). |
| **Tools panel** | When section is Knowledge, the second panel shows “Knowledge sources” and a list (placeholder until API). |

### Documents

| Feature | Description |
|--------|-------------|
| **Sub-option** | **Upload / manage raw files** — Upload and manage raw files. |
| **Header** | Section title and “→ Upload / manage raw files”. |
| **Content** | Dropdown of existing knowledge sources (from `VITE_RAG_OPTIONS`), or text field for a different one; file/folder selector with drag-and-drop; **Start RAG** button fires the upload API (queue/pipeline from `VITE_RAG_QUEUE`, `VITE_RAG_PIPELINE`). |

---

## Tools panel (Conversation)

| Feature | Description |
|--------|-------------|
| **Toggle** | Expand/collapse; state in URL query `tools` (0/1). Collapsed label: “Conversation”. |
| **Queue dropdown** | **Chat only.** At the top. Lists workflow queues from `GET /api/tenants/{tenantId}/queues`. Display names use `queueDisplayName()` (version suffix stripped, e.g. `olo-chat-queue:1.0` → `olo-chat-queue`). Selecting a queue loads pipelines for that queue and scopes the session list and new sessions. Default: first or previously selected queue. |
| **Pipeline dropdown** | **Chat only.** Below Queue. Pipelines from `GET /api/tenants/{tenantId}/queues/{queueName}/config` for the selected queue. Selecting a pipeline filters the session list and is used when creating a new session. |
| **New chat** | **Chat only.** Creates a new session via `POST /api/sessions` with current tenant, `taskQueue`, `queueName`, `pipelineId` (from store at click time). New session is added optimistically and selected. Run events store is cleared on New chat. |
| **Sessions list** | **Chat only.** Shows only sessions for the **selected queue + pipeline**. Fetched with `GET /api/tenants/{tenantId}/sessions?queue=...&pipeline=...` (queue = display name, no version). Each session label: custom title (user-edited, persisted in `sessionDisplayStore`), or first-message preview (up to 300 chars), or date/time. **Edit (✎)** opens inline edit for custom title; persisted in `localStorage`. **Delete (×)** calls `DELETE /api/sessions/{sessionId}` and removes that session from the list **optimistically** (no refetch); if the deleted session was selected, the first remaining session is selected. |
| **Delete all** | Deletes all sessions for the current tenant/queue/pipeline via API; clears selection and run events. |
| **Knowledge sources** | When section is **Knowledge**, the Tools panel shows “Knowledge sources” and a list (placeholder until API). |
| **Contextual tools** | Optional tool entries from the tool registry (layout `SubOption.toolIds`). Tool components receive context (section, sub, runSelected, storeContext). |

The Tools panel is hidden for the Documents section and when the tenant config form is shown.

---

## Properties panel (right sidebar)

| Feature | Description |
|--------|-------------|
| **Toggle** | Expand/collapse; state in URL query `props` (0/1). Collapsed label: “Events”. Bell icon toggles the Events panel. |
| **Run events (Chat)** | When section is Chat, the panel shows **EventsList**: run events (PLANNER, MODEL, TOOL, HUMAN, SYSTEM) for the current run. **Liveness events (PING/PONG)** are excluded from the list. **Last 25** events are shown; header shows “(last 25 of N)” when there are more. Each item expandable for timestamp, input, output, metadata. List auto-scrolls to the bottom as new events arrive. **Event history is not cleared when the user clicks Send**; for each new run, `setRun(runId)` starts a fresh events list for that run. |
| **Tenant config** | When editing tenant configuration, the panel shows **TenantConfigForm** (add new or edit existing). Save/delete use tenantConfigStore and REST API. |
| **Empty state** | No run yet: “Send a message in Chat to see run events here.” Run set but no events: “Waiting for events…”. |

---

## URL and query

| Aspect | Description |
|--------|-------------|
| **Path** | `/:sectionId/:subId` (e.g. `/chat/conversation`, `/knowledge/sources`, `/documents/upload`). Invalid paths redirect to the last valid path or default (`/chat/conversation`). |
| **Query** | `tenant`, `menu`, `tools`, `props`. Used for tenant selection and panel open/closed state. Enables deep links, back/forward, and bookmarking. |
| **Default path** | `/chat/conversation` when no previous selection is stored. |
| **Last path / tenant** | Last selected path and tenant stored in `localStorage` and used when opening `/` or when the backend list doesn’t contain the current tenant. |

---

## Resizable panels

| Panel | Default width | Min / max | Persistence |
|-------|----------------|-----------|-------------|
| Left | 260px | 160–480px | `localStorage` key `olo:panel-widths` |
| Tools | 220px | 160–400px | Same |
| Properties | 260px | 160–480px | Same |

Resize handles between panels update the UI store and persisted widths; CSS variables (`--panel-width-left`, etc.) drive layout.

---

## Feature flags

Sections can be turned on/off via `config/features.ts`:

- **chat** — Chat section (default on).
- **knowledge** — Knowledge section (default on).
- **documents** — Documents section (default on).

If the URL refers to a disabled section, the app redirects to the default path.

---

## Session display (Conversation list)

- **Labels** — For each session: custom title (if set via Edit ✎), else first-message preview (trimmed to 300 chars), else date/time. Stored in `sessionDisplayStore` (persisted, max 80 entries; oldest-by-use evicted).
- **Truncation** — Single-line labels truncated to 48 chars in the list (`truncateLabel()`).

---

## Observability

- **Navigation events** — When the user navigates (section, sub, runId), a navigation event is logged via `lib/observability.ts`. In development, `import.meta.env.DEV` is used for debug logging.

---

## Related docs

- [ARCHITECTURE.md](./ARCHITECTURE.md) — Application architecture, state, and data flow.
- [CHAT_UI.md](./CHAT_UI.md) — Chat section in detail (APIs, execution model).
- [README.md](./README.md) — Overview and run instructions.
