/**
 * Copyright (c) 2026 Olo Labs
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Chat API for olo backend (sessions, messages, runs, SSE).
 * Uses VITE_API_BASE (e.g. http://localhost:7080) so requests go to BE port 7080; if unset, uses /api (Vite proxy to 7080).
 */

import { getApiAuthHeaders } from '../lib/wsUrl'

const API = import.meta.env.VITE_API_BASE
  ? `${import.meta.env.VITE_API_BASE.replace(/\/$/, '')}/api`
  : '/api'

function withAuth(headers: Record<string, string> = {}): Record<string, string> {
  return { ...getApiAuthHeaders(), ...headers }
}

/** Trims tenant id for URL paths and bodies (same value as {@code olo.default-tenant-id} from UI context). */
export function tenantIdForApiPath(tenantId: string): string {
  return tenantId?.trim() ?? ''
}

export interface CreateSessionResponse {
  sessionId: string
}

/** Session summary for list (GET /api/tenants/:tenantId/sessions). Most recently active first. */
export interface SessionSummaryDto {
  sessionId: string
  tenantId: string
  createdAt: number
  lastActivityAt?: number
}

export interface SendMessageResponse {
  messageId: string
  runId: string
}

export interface ChatMessageDto {
  messageId: string
  sessionId: string
  role: string
  content: string
  runId: string
  createdAt: number
}

export interface RunEventDto {
  eventVersion?: number
  runId: string
  nodeId: string
  parentNodeId: string | null
  nodeType: string
  status: string
  eventType?: string
  timestamp: number
  sequenceNumber?: number
  correlationId?: string
  input?: Record<string, unknown>
  output?: Record<string, unknown>
  metadata?: Record<string, unknown>
}

/** Tenant list from GET /api/tenants (olo backend). Used by configuration and related flows. */
export interface TenantDto {
  id: string
  name: string
}

/** Tenant id, footer labels, and Olo version from GET /api/ui/context. Send Bearer token so tenantId comes from JWT {@code tenantId} claim. */
export interface UiContextDto {
  tenantId: string
  tenant: string
  user: string
  /** Backend release label (olo.version / OLO_VERSION), e.g. v1.0.0-Dev */
  oloVersion: string
}

export async function getUiContext(): Promise<UiContextDto | null> {
  try {
    const res = await fetch(`${API}/ui/context`, { headers: withAuth() })
    if (!res.ok) return null
    return await res.json()
  } catch {
    return null
  }
}

/** Fetches tenant list. Uses GET /api/tenants (proxied to http://localhost:7080/api/tenants). */
export async function getTenants(): Promise<TenantDto[]> {
  try {
    const res = await fetch(`${API}/tenants`, { headers: withAuth() })
    if (!res.ok) return []
    const data = await res.json()
    return Array.isArray(data) ? data : []
  } catch {
    return []
  }
}

/** Workflow queue names from Redis keys <tenantId>:olo:kernel:config:* (left bar under Chat/RAG). */
export async function getQueues(tenantId: string): Promise<string[]> {
  const tid = tenantIdForApiPath(tenantId)
  if (!tid) return []
  try {
    const res = await fetch(`${API}/tenants/${encodeURIComponent(tid)}/queues`, { headers: withAuth() })
    if (!res.ok) return []
    const data = await res.json()
    return Array.isArray(data) ? data : []
  } catch {
    return []
  }
}

/**
 * Config for a workflow queue from Redis key <tenantId>:olo:kernel:config:<queueName>.
 * `pipelines` from the API is normalized to `{ id, name }[]` for the Conversation dropdown (ids are used as pipelineId).
 */
export interface QueueConfigDto {
  pipelines?: Array<string | { id: string; name?: string }>
  [key: string]: unknown
}

export async function getQueueConfig(tenantId: string, queueName: string): Promise<QueueConfigDto> {
  const tid = tenantIdForApiPath(tenantId)
  if (!tid || !queueName) return {}
  try {
    const res = await fetch(
      `${API}/tenants/${encodeURIComponent(tid)}/queues/${encodeURIComponent(queueName)}/config`,
      { headers: withAuth() }
    )
    if (!res.ok) return {}
    const data = await res.json()
    return data != null && typeof data === 'object' ? data : {}
  } catch {
    return {}
  }
}

/** Health check for olo backend (plain "OK"). */
export async function getChatBackendHealth(): Promise<boolean> {
  try {
    const res = await fetch(`${API}/health`)
    return res.ok
  } catch {
    return false
  }
}

/** List chat sessions for a tenant, optionally scoped by queue and pipeline (per workflow queue and pipeline view). */
export async function listSessions(
  tenantId: string,
  options?: { queue?: string; pipeline?: string }
): Promise<SessionSummaryDto[]> {
  const tid = tenantIdForApiPath(tenantId)
  if (!tid) return []
  try {
    const params = new URLSearchParams()
    if (options?.queue) params.set('queue', options.queue)
    if (options?.pipeline) params.set('pipeline', options.pipeline)
    const qs = params.toString()
    const url = `${API}/tenants/${encodeURIComponent(tid)}/sessions` + (qs ? `?${qs}` : '')
    const res = await fetch(url, { headers: withAuth() })
    if (!res.ok) return []
    const data = await res.json()
    return Array.isArray(data) ? data : []
  } catch {
    return []
  }
}

/** Delete all chat sessions for the tenant, optionally scoped by queue and pipeline (current view). */
export async function deleteAllSessions(
  tenantId: string,
  options?: { queue?: string; pipeline?: string }
): Promise<void> {
  const tid = tenantIdForApiPath(tenantId)
  if (!tid) return
  const params = new URLSearchParams()
  if (options?.queue) params.set('queue', options.queue)
  if (options?.pipeline) params.set('pipeline', options.pipeline)
  const qs = params.toString()
  const url = `${API}/tenants/${encodeURIComponent(tid)}/sessions` + (qs ? `?${qs}` : '')
  const res = await fetch(url, { method: 'DELETE', headers: withAuth() })
  if (!res.ok) throw new Error(`Delete all sessions failed: ${res.status}`)
}

/** Delete one chat session and its messages. Used by Conversation per-conversation delete button. */
export async function deleteSession(sessionId: string): Promise<void> {
  if (!sessionId) return
  const res = await fetch(`${API}/sessions/${encodeURIComponent(sessionId)}`, {
    method: 'DELETE',
    headers: withAuth(),
  })
  if (!res.ok) throw new Error(`Delete session failed: ${res.status}`)
}

/** Options for POST /api/sessions. Backend uses tenantId, taskQueue, queueName, pipelineId, and optional overrides (future). */
export interface CreateSessionBody {
  tenantId: string
  taskQueue?: string
  /** Queue name stored on the session (same as taskQueue when creating). */
  queueName?: string
  pipelineId?: string
  overrides?: Record<string, unknown>
}

export async function createSession(
  tenantId: string,
  options?: { taskQueue?: string; queueName?: string; pipelineId?: string; overrides?: Record<string, unknown> }
): Promise<CreateSessionResponse> {
  const body: CreateSessionBody = {
    tenantId: tenantIdForApiPath(tenantId),
    taskQueue: options?.taskQueue,
    queueName: options?.queueName ?? options?.taskQueue,
    pipelineId: options?.pipelineId,
    overrides: options?.overrides,
  }
  const res = await fetch(`${API}/sessions`, {
    method: 'POST',
    headers: withAuth({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`Create session failed: ${res.status}`)
  return res.json()
}

export async function sendMessage(
  sessionId: string,
  content: string,
  options?: { taskQueue?: string }
): Promise<SendMessageResponse> {
  const res = await fetch(`${API}/sessions/${encodeURIComponent(sessionId)}/messages`, {
    method: 'POST',
    headers: withAuth({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ content, taskQueue: options?.taskQueue }),
  })
  if (!res.ok) throw new Error(`Send message failed: ${res.status}`)
  return res.json()
}

export async function listMessages(sessionId: string): Promise<ChatMessageDto[]> {
  const res = await fetch(`${API}/sessions/${encodeURIComponent(sessionId)}/messages`, {
    headers: withAuth(),
  })
  if (!res.ok) throw new Error(`List messages failed: ${res.status}`)
  return res.json()
}

/** Run status from GET /api/runs/{runId}. Used to un-gray when workflow completes but SSE did not deliver MODEL event. */
export interface RunStatusDto {
  runId: string
  status: string
}

export async function getRun(runId: string): Promise<RunStatusDto | null> {
  try {
    const res = await fetch(`${API}/runs/${encodeURIComponent(runId)}`, { headers: withAuth() })
    if (!res.ok) return null
    const data = await res.json()
    return { runId: data.runId ?? runId, status: data.status ?? 'running' }
  } catch {
    return null
  }
}

/** Run response from GET /api/runs/{runId}/response. Use when receiving events or while run in progress to show current assistant reply. */
export interface RunResponseDto {
  runId: string
  response: string
}

export async function getRunResponse(runId: string): Promise<RunResponseDto | null> {
  try {
    const res = await fetch(`${API}/runs/${encodeURIComponent(runId)}/response`, { headers: withAuth() })
    if (!res.ok) return null
    const data = await res.json()
    return { runId: data.runId ?? runId, response: data.response ?? '' }
  } catch {
    return null
  }
}

export interface HumanInputRequestDto {
  approved: boolean
  message?: string
}

export async function submitHumanInput(runId: string, body: HumanInputRequestDto): Promise<void> {
  const res = await fetch(`${API}/runs/${encodeURIComponent(runId)}/human-input`, {
    method: 'POST',
    headers: withAuth({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({
      approved: !!body.approved,
      message: body.message ?? '',
    }),
  })
  if (!res.ok) throw new Error(`Human input failed: ${res.status}`)
}

const SSE_DEBUG = true // set false to disable run-events step logging

function sseLog(step: string, detail?: unknown) {
  if (SSE_DEBUG) console.log('[Chat SSE]', step, detail !== undefined ? detail : '')
}

/**
 * Subscribe to run events via SSE. Calls onEvent for each event (catch-up then live).
 * Returns an abort function to close the stream.
 */
export function streamRunEvents(
  runId: string,
  onEvent: (event: RunEventDto) => void,
  onError?: (err: unknown) => void
): () => void {
  const ac = new AbortController()
  const url = `${API}/runs/${encodeURIComponent(runId)}/events`
  sseLog('1. SSE fetch start', { runId, url })
  fetch(url, { signal: ac.signal, headers: withAuth({ Accept: 'text/event-stream' }) })
    .then(async (res) => {
      sseLog('2. SSE response received', { ok: res.ok, status: res.status, hasBody: !!res.body })
      if (!res.ok || !res.body) {
        sseLog('2b. SSE failed (no body or !ok)', res.status)
        onError?.(new Error(`SSE failed: ${res.status}`))
        return
      }
      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buf = ''
      let eventCount = 0
      try {
        while (true) {
          const { done, value } = await reader.read()
          sseLog('3. SSE read chunk', { done, chunkLen: value?.length ?? 0 })
          if (done) {
            sseLog('4. SSE stream done (connection closed)')
            break
          }
          buf += decoder.decode(value, { stream: true })
          // Skip SSE comment lines (e.g. server heartbeat ": ping")
          while (/^\s*:/.test(buf)) {
            const nl = buf.indexOf('\n')
            if (nl === -1) break
            buf = buf.slice(nl + 1)
          }
          // Parse SSE without splitting on \n\n (payload can contain \n in response text)
          while (buf.includes('data: ')) {
            const dataIdx = buf.indexOf('data: ')
            const payloadStart = dataIdx + 6
            const firstBrace = buf.indexOf('{', payloadStart)
            if (firstBrace === -1) break
            let depth = 0
            let inString = false
            let stringChar = ''
            let escape = false
            let end = -1
            for (let i = firstBrace; i < buf.length; i++) {
              const c = buf[i]
              if (escape) {
                escape = false
                continue
              }
              if (c === '\\' && inString) {
                escape = true
                continue
              }
              if (inString) {
                if (c === stringChar) inString = false
                continue
              }
              if (c === '"' || c === "'") {
                inString = true
                stringChar = c
                continue
              }
              if (c === '{') depth++
              else if (c === '}') {
                depth--
                if (depth === 0) {
                  end = i + 1
                  break
                }
              }
            }
            if (end === -1) break
            const dataLine = buf.slice(firstBrace, end)
            buf = buf.slice(end).replace(/^\s*\n?/, '')
            if (dataLine === '[DONE]') continue
            try {
              const event = JSON.parse(dataLine) as RunEventDto
              eventCount++
              sseLog(`5. SSE event #${eventCount}`, {
                nodeType: event.nodeType,
                status: event.status,
                hasOutput: event.output != null,
                outputKeys: event.output && typeof event.output === 'object' ? Object.keys(event.output as object) : null,
              })
              onEvent(event)
            } catch (parseErr) {
              sseLog('5b. SSE parse error', parseErr)
            }
          }
        }
      } finally {
        reader.releaseLock()
        sseLog('6. SSE reader released', { totalEvents: eventCount })
      }
    })
    .catch((err) => {
      sseLog('7. SSE fetch/stream catch', { name: err?.name, message: err?.message })
      if (err?.name !== 'AbortError') onError?.(err)
    })
  return () => {
    sseLog('8. SSE abort() called')
    ac.abort()
  }
}
