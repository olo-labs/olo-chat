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
- **Left panel** — Section navigation (**Chat**, **Knowledge**, **Documents**). Under Chat: **Conversation** (single submenu). Under Knowledge: Sources, Create new, Status. Under Documents: Upload / manage raw files. **Tenant** is not selected here; it is resolved by the backend.
- **Center** — **Chat**: conversation view (messages, **composer**, optional **preset pill** when **`chatProfiles`** is set—**no** extra profile strip under the page title; subtitle **→ Conversation with Olo AI**; **while sending**, **“{name} is thinking…”** plus **`displaySummary`** on the next line; **config pills** on messages show which preset was used per **`runId`**; **Run again** (profile mode): **icon under each user message** opens a menu of **other presets** (pipeline **`run_again`: true**) with **emoji + profile name** per row (not shown for human-step replies); collapsible **worker progress** strip (expanded/height **persist**); **human-input** card on HUMAN WAITING). **Knowledge** / **Documents** as before.
- **Tools panel** — **Chat**: **New chat**, sessions list, delete one, delete all. **Legacy mode** (no `chatProfiles` from **`GET /api/ui/context`**): **Queue** and **Pipeline** dropdowns at the top. **Profile mode** (`chatProfiles` non-empty): queue/pipeline **are not** shown here—they are chosen next to the message input as a **preset** (display name + optional summary tooltip). **Knowledge**: List of knowledge sources. Hidden for Documents.
- **Properties panel** — Right sidebar: Run events (Chat), or tenant config form. Toggle to expand/collapse (bell icon for Events). The **left footer bell** (see Left panel) highlights when there are **new workflow** run events you have not “seen” yet (Events panel was closed when they arrived); opening the Events panel clears that highlight.

Panel widths are resizable and persisted in `localStorage` (`olo:panel-widths`). Panel open/closed state is in the URL query (`menu`, `tools`, `props`).

**Backend availability** — `GET /api/health` is polled from **`useBackendReachable`**. While the backend is unreachable, the **main chat area** shows a centered “Connecting to Olo backend…” message; the Conversation tools panel **does not** show legacy Queue/Pipeline placeholder rows (so you do not see misleading “No queues” when the API is down).

---

## Top bar

| Feature | Description |
|--------|-------------|
| **Logo** | Olo logo; click navigates to default home path (Chat → Conversation) while keeping panel query params. |
| **Theme toggle** | Switches between light and dark theme. Theme persisted in `localStorage` (`olo-theme`) and applied via `data-theme` on the document. |

---

## Left panel

| Feature | Description |
|--------|-------------|
| **Toggle** | Expand/collapse the left panel. State reflected in URL query `menu` (0 = collapsed, 1 = expanded). |
| **Effective tenant** | Not user-selectable. The backend determines `tenantId` (e.g. JWT, `GET /api/ui/context`). Queue and session APIs use that tenant. |
| **Section navigation** | Sections: **Chat**, **Knowledge**, **Documents**. Chat has one sub-option **Conversation** (path `/chat/conversation`). Knowledge: Sources, Create new, Status. Documents: Upload / manage raw files. Clicking a section/sub updates the URL path. |
| **Chat → Conversation** | Under Chat, the left panel shows only **Conversation**. Workflow queues are selected in the **Conversation panel** (Tools) via the **Queue** dropdown, not in the left panel. |
| **Expand / collapse categories** | Categories (sections) can be expanded or collapsed; “Expand all” / “Collapse all” when the panel is expanded. |
| **Context menu** | Right-click on the menu area opens a context menu (e.g. expand/collapse). |
| **Events bell (footer)** | In the **expanded** left panel (user/tenant block) and when the menu is **collapsed**, a **bell** opens the **Events** (properties) panel. The bell is **highlighted** only when **new workflow** execution events arrived while the **Events panel was closed**—not merely because older events exist in history. Opening the Events panel **clears** the highlight. Hydrated/replayed events after refresh do not count as “new” for this indicator. |

Sections and visibility are controlled by **feature flags** (`config/features.ts`). Disabled sections are hidden and invalid section paths redirect to the default path.

---

## Main content

Content depends on the current section and sub-option.

### Chat → Conversation

| Feature | Description |
|--------|-------------|
| **Header** | Title “Chat” and subtitle “→ Conversation with Olo AI”. |
| **Chat view** | Message list, composer (input + Send), optional **preset** control when **`chatProfiles`** is non-empty (**emoji** + **display name** from API; **`displaySummary`** in tooltip / thinking line). **No** separate profile banner under the header. **Waiting:** line 1 **“{displayName} is thinking…”**, line 2 **`displaySummary`** (from **`GET /api/ui/context`** / Redis-backed pipeline). **Per-turn** **config pills** on user/assistant rows (**`runId` → preset** map and **`sessionStorage`** key `olo:chat-run-profiles:{sessionId}`). **Run again:** under each **user** bubble (not human-step replies), an **icon** opens a menu of **emoji + profile name** for presets with **`runAgain`** (pipeline **`run_again`**). Collapsible **progress** panel; inline assistant while in flight. Reply from MODEL / `GET /api/runs/{runId}/response` / inline query. |
| **Session** | User selects a session from the Tools list or **New chat**. **Profile mode:** `POST /api/sessions` with **tenantId only** (minimal body). **Legacy mode:** includes `taskQueue`, `queueName`, `pipelineId` from the store. Optimistic new session + selection. |
| **Message list** | `GET /api/sessions/{sessionId}/messages`. **Empty or metadata-only** assistant payloads show the standard fallback sentence (`formatAssistantContent`). Human-step assistant lines may be normalized to hide legacy `<Options>` markers in old history. |
| **Input & Send** | Send calls `POST .../messages` with `content` and optional **`taskQueue`** from **`selectedQueueId`** (set by preset or legacy Queue dropdown). Send disabled until the run completes when a run is active. |
| **Human input (HUMAN WAITING)** | When the worker emits a human step, a **card** shows the prompt and **one button per option** from **`input.options`** (or metadata/output). Labels and submit payloads are **defined by the worker**—there is no separate hardcoded Yes/No copy in the UI. **Text** steps use a free-text field + Submit. The card and **completion detection** use the same **`runEventsStore`** timeline as the Events panel and WebSocket stream, so after a **full page reload** at a human step, submitting **`human-input`** still advances the UI when **HUMAN COMPLETED** (and follow-on) events arrive over the socket. |
| **Resend** | User can resend a previous user message (header **resend** icon; triggers a new run). **Profile mode:** **Run again** icon under each user message lists **other** presets that have **`run_again`** in config (switched queue/pipeline). |
| **Common prompts** | Chips above the composer fill the input. |
| **Health** | Poll **`GET /api/health`**; full-width disconnected state in the chat column when down. |
| **Errors** | API or stream errors shown in the chat area. |
| **Worker progress (bottom)** | **Collapsible** strip **below the composer** showing a **readable summary** of **worker/run events** for the current run (sequence, node type, status, node id, short **`IN:`** / **`OUT:`** snippets from event payloads). **Liveness** events are omitted; up to **200** events when expanded. **Expanded vs collapsed** and **resized height** are **remembered across refresh** (`olo:chat-progress-expanded`, `olo:chat-progress-height` in **`localStorage`**). The **last 200 non-liveness** events for the active run are also **saved** (`olo:run-events:{runId}`) and **restored after refresh** together with **`sessionStorage`** `olo:chat-active-run:{sessionId}`. **Resize** the panel by dragging the top edge; **collapse** to a thin bar. Same SSE/WebSocket event source as the **Events** sidebar, but optimized for a quick scan in-chat—**not** persisted as chat messages. For full JSON and the last-25 detailed list, use the **Events** panel. |

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
| **Content** | **Capability source** filter and upload modal; files go to the **backend shared folder** (server config). Dropdown ids from `VITE_CAPABILITY_SOURCE_OPTIONS` / `VITE_RAG_OPTIONS`; optional queue/pipeline env for post-copy workflows. RAG is via capabilities later, not this screen. |

---

## Tools panel (Conversation)

| Feature | Description |
|--------|-------------|
| **Toggle** | Expand/collapse; state in URL query `tools` (0/1). Collapsed label: “Conversation”. |
| **Queue / Pipeline** | **Legacy chat only** (when **`chatProfiles`** from UI context is empty). **Queue:** `GET /api/tenants/{tenantId}/queues`; display via `queueDisplayName()`. **Pipeline:** from queue config. Scopes **list sessions** and **legacy** new-session body. **Hidden** in **profile mode** and when **`GET /api/health`** fails (avoids empty “No queues” while offline). |
| **New chat** | **Chat only.** Triggers session creation in **ChatView** (profile: minimal body; legacy: queue/pipeline from store). Run events store cleared. |
| **Sessions list** | **Legacy:** filtered by selected queue + pipeline. **Profile:** tenant-wide list (no queue/pipeline query). Labels: custom title, first-message preview, or timestamp; **Edit (✎)** / **Delete (×)** as before. |
| **Delete all** | Deletes sessions for the current tenant scope (legacy: same queue/pipeline query params). |
| **Knowledge sources** | When section is **Knowledge**, the Tools panel shows “Knowledge sources” and a list (placeholder until API). |
| **Contextual tools** | Optional tool entries from the tool registry (layout `SubOption.toolIds`). Tool components receive context (section, sub, runSelected, storeContext). |

The Tools panel is hidden for the Documents section and when the tenant config form is shown.

---

## Properties panel (right sidebar)

| Feature | Description |
|--------|-------------|
| **Toggle** | Expand/collapse; state in URL query `props` (0/1). Collapsed label: “Events”. Bell icon toggles the Events panel (same panel as the **left footer** bell). |
| **Run events (Chat)** | When section is Chat, the panel shows **EventsList**: run events (PLANNER, MODEL, TOOL, HUMAN, SYSTEM) for the current run. **Liveness events (PING/PONG)** are excluded from the list. **Last 25** events are shown; header shows “(last 25 of N)” when there are more. Each item expandable for timestamp, input, output, metadata. List auto-scrolls to the bottom as new events arrive. **Event history is not cleared when the user clicks Send**; for each new run, `setRun(runId)` starts a fresh events list for that run. **Up to 200** workflow events (non-liveness) are **persisted in `localStorage` per `runId`** and **rehydrated** when the user returns to the same chat session after a refresh; the store **dedupes** workflow events so replay over WebSocket after rehydrate does **not** duplicate lines. |
| **Tenant config** | When editing tenant configuration, the panel shows **TenantConfigForm** (add new or edit existing). Save/delete use tenantConfigStore and REST API. |
| **Empty state** | No run yet: “Send a message in Chat to see run events here.” Run set but no events: “Waiting for events…”. |

---

## URL and query

| Aspect | Description |
|--------|-------------|
| **Path** | `/:sectionId/:subId` (e.g. `/chat/conversation`, `/knowledge/sources`, `/documents/upload`). Invalid paths redirect to the last valid path or default (`/chat/conversation`). |
| **Query** | `tenant` (optional legacy), `menu`, `tools`, `props`. Panel open/closed state and optional URL hints. Effective tenant for APIs comes from the backend, not from choosing a value in the UI. |
| **Default path** | `/chat/conversation` when no previous selection is stored. |
| **Last path** | Last selected path stored in `localStorage` and used when opening `/`. |

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
