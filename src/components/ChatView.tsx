/**
 * Copyright (c) 2026 Olo Labs
 * SPDX-License-Identifier: Apache-2.0
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  createSession,
  getChatBackendHealth,
  getRun,
  getRunResponse,
  listMessages,
  listSessions,
  sendMessage,
  streamRunEvents,
  type ChatMessageDto,
  type RunEventDto,
} from '../api/chatApi'
import { runEventsStore } from '../store/runEvents'
import { chatSessionsStore } from '../store/chatSessions'
import { conversationPanelStore } from '../store/conversationPanel'
import { sessionDisplayStore } from '../store/sessionDisplay'
import { queueDisplayName } from '../lib/queueDisplayName'
import { getCurrentSocket, subscribeToRun } from '../lib/wsSingleton'

/** Default tenant from backend (OLO_TENANT_IDS=default, olo:tenants). */
const DEFAULT_TENANT_ID = 'default'

/** Extract assistant reply text from MODEL node output; supports content, text, message, and nested shapes. */
function extractAssistantText(output: unknown): string | null {
  if (output == null) return null
  if (typeof output === 'string') return output.trim() || null
  if (typeof output !== 'object') return null
  const o = output as Record<string, unknown>
  const content = o.content
  if (typeof content === 'string' && content.trim()) return content.trim()
  const text = o.text
  if (typeof text === 'string' && text.trim()) return text.trim()
  const message = o.message
  if (message != null && typeof message === 'object') {
    const m = message as Record<string, unknown>
    const mc = m.content
    if (typeof mc === 'string' && mc.trim()) return mc.trim()
  }
  const choices = o.choices
  if (Array.isArray(choices) && choices.length > 0) {
    const first = choices[0] as Record<string, unknown> | undefined
    const msg = first?.message as Record<string, unknown> | undefined
    const c = msg?.content
    if (typeof c === 'string' && c.trim()) return c.trim()
  }
  const result = o.result
  if (typeof result === 'string' && result.trim()) return result.trim()
  const response = o.response
  if (typeof response === 'string' && response.trim()) return response.trim()
  if (Object.keys(o).length > 0) return JSON.stringify(output)
  return null
}

/** Shown when assistant has no real response (empty or metadata-only e.g. {"source":"temporal"}). */
const EMPTY_RESPONSE_MESSAGE = 'Apologise, Couldn\'t generate the response for your query.'

function formatAssistantContent(content: string | null | undefined): string {
  const t = content?.trim()
  if (!t) return EMPTY_RESPONSE_MESSAGE
  if (t.startsWith('{') && t.endsWith('}')) {
    try {
      const o = JSON.parse(t) as Record<string, unknown>
      if (typeof o === 'object' && o !== null) {
        const hasContent = [o.content, o.text, o.message].some(
          (v) => typeof v === 'string' && v.trim().length > 0
        )
        if (!hasContent) return EMPTY_RESPONSE_MESSAGE
      }
    } catch {
      // not valid JSON, show as-is
    }
  }
  return t
}

const COMMON_MESSAGES = [
  'Hello, what can you help me with?',
  'Summarize this in a few bullet points.',
  'Search for recent news on this topic.',
  'Explain this in simpler terms.',
  'What are the main pros and cons?',
]

export interface ChatViewProps {
  tenantId?: string
  /** Workflow queue name (from left bar selection); sent as taskQueue when sending messages. */
  taskQueue?: string
  /** When this increments, start a new chat (triggered by Conversation panel "New chat" button). */
  newChatTrigger?: number
}

export function ChatView({ tenantId: tenantIdProp, taskQueue, newChatTrigger = 0 }: ChatViewProps) {
  const tenantId = tenantIdProp || DEFAULT_TENANT_ID
  const selectedPipelineId = conversationPanelStore((s) => s.selectedPipelineId)
  const sessions = chatSessionsStore((s) => s.sessions)
  const sessionId = chatSessionsStore((s) => s.selectedSessionId)
  const setSessions = chatSessionsStore((s) => s.setSessions)
  const setSelectedSessionId = chatSessionsStore((s) => s.setSelectedSessionId)
  const [connected, setConnected] = useState(false)
  const [, setSessionsLoading] = useState(false)
  const [messages, setMessages] = useState<ChatMessageDto[]>([])
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [input, setInput] = useState('')
  const [runEvents, setRunEvents] = useState<RunEventDto[]>([])
  const [, setActiveRunId] = useState<string | null>(null)
  /** Set when run completes/fails from API poll (so we show fallback message even if SSE didn't deliver SYSTEM event) */
  const [runCompletedFromPoll, setRunCompletedFromPoll] = useState(false)
  /** Current response from GET /api/runs/{runId}/response — queried when we receive events or poll while in progress */
  const [queriedResponse, setQueriedResponse] = useState<string | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const unsubscribeRunRef = useRef<(() => void) | null>(null)
  /** Session id we just created (New chat); avoid clearing selection when list doesn't include it yet. */
  const lastCreatedSessionIdRef = useRef<string | null>(null)

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [])

  useEffect(() => {
    getChatBackendHealth().then(setConnected)
  }, [])

  const fetchSessions = useCallback(() => {
    if (!tenantId) return
    setSessionsLoading(true)
    const queue = taskQueue ? queueDisplayName(taskQueue) : undefined
    const pipeline = selectedPipelineId || undefined
    listSessions(tenantId, { queue, pipeline })
      .then((data) => {
        setSessions(data)
        const current = chatSessionsStore.getState().selectedSessionId
        const inList = data.some((s) => s.sessionId === current)
        if (data.length > 0 && (!current || !inList)) {
          setSelectedSessionId(data[0].sessionId)
        } else if (current && !inList) {
          if (current !== lastCreatedSessionIdRef.current) {
            setSelectedSessionId(null)
          } else {
            lastCreatedSessionIdRef.current = null
          }
        }
      })
      .catch(() => setSessions([]))
      .finally(() => setSessionsLoading(false))
  }, [tenantId, taskQueue, selectedPipelineId, setSessions, setSelectedSessionId])

  useEffect(() => {
    if (!tenantId) return
    if (!taskQueue) {
      setSessions([])
      setSelectedSessionId(null)
      return
    }
    fetchSessions()
  }, [tenantId, taskQueue, selectedPipelineId, fetchSessions])

  useEffect(() => {
    if (sessions.length > 0 && !sessionId) {
      setSelectedSessionId(sessions[0].sessionId)
    }
  }, [sessions, sessionId, setSelectedSessionId])

  useEffect(() => {
    if (!sessionId) return
    setLoading(true)
    setRunEvents([])
    setRunCompletedFromPoll(false)
    setQueriedResponse(null)
    runEventsStore.getState().clear()
    unsubscribeRunRef.current?.()
    listMessages(sessionId)
      .then(setMessages)
      .catch((e) => setError(String(e.message)))
      .finally(() => setLoading(false))
  }, [sessionId])

  // Auto-set first message preview for session list (so Conversation panel shows a useful label)
  useEffect(() => {
    if (!sessionId || messages.length === 0) return
    const firstUser = messages.find((m) => m.role === 'user')
    if (firstUser?.content?.trim()) {
      sessionDisplayStore.getState().setFirstMessagePreview(sessionId, firstUser.content)
    }
  }, [sessionId, messages])

  useEffect(() => {
    scrollToBottom()
  }, [messages, runEvents, scrollToBottom])

  const handleNewChat = useCallback(() => {
    if (!tenantId || sending) return
    const { selectedQueueId: q, selectedPipelineId: p } = conversationPanelStore.getState()
    setError(null)
    setRunEvents([])
    setRunCompletedFromPoll(false)
    setQueriedResponse(null)
    runEventsStore.getState().clear()
    unsubscribeRunRef.current?.()
    createSession(tenantId, {
      taskQueue: q ? queueDisplayName(q) : undefined,
      pipelineId: p || undefined,
    })
      .then((r) => {
        lastCreatedSessionIdRef.current = r.sessionId
        const now = Date.now()
        const prev = chatSessionsStore.getState().sessions
        setSessions([
          { sessionId: r.sessionId, tenantId, createdAt: now, lastActivityAt: now },
          ...prev,
        ])
        setSelectedSessionId(r.sessionId)
        setMessages([])
        fetchSessions()
      })
      .catch((e) => setError(String(e.message)))
  }, [tenantId, sending, fetchSessions, setSelectedSessionId])

  const newChatTriggerRef = useRef(0)
  useEffect(() => {
    if (newChatTrigger > newChatTriggerRef.current) {
      newChatTriggerRef.current = newChatTrigger
      handleNewChat()
    }
  }, [newChatTrigger, handleNewChat])

  const handleSend = useCallback(() => {
    const text = input.trim()
    if (!text || !sessionId || sending) return
    setInput('')
    setSending(true)
    setError(null)
    setRunEvents([])
    setRunCompletedFromPoll(false)
    setQueriedResponse(null)
    // Show user message in main panel immediately (align with previous behavior)
    const optimisticUser: ChatMessageDto = {
      messageId: `opt-${Date.now()}`,
      sessionId,
      role: 'user',
      content: text,
      runId: '',
      createdAt: Date.now(),
    }
    setMessages((prev) => [...prev, optimisticUser])
    const { selectedQueueId: q } = conversationPanelStore.getState()
    console.log('[Chat] A. sendMessage HTTP start')
    sendMessage(sessionId, text, {
      taskQueue: q ? queueDisplayName(q) : undefined,
    })
      .then(({ runId }) => {
        console.log('[Chat] B. sendMessage HTTP resolved', { runId })
        setActiveRunId(runId)
        runEventsStore.getState().setRun(runId)
        listMessages(sessionId)
          .then((data) => {
            setMessages((prev) => {
              if (data.length > 0) return data
              const hasOptimistic = prev.some((m) => String(m.messageId).startsWith('opt-'))
              if (hasOptimistic) return prev
              return data
            })
          })
          .catch(() => {})
        fetchSessions()
        unsubscribeRunRef.current?.()

        const onEvent = (rid: string, ev: RunEventDto) => {
          setRunEvents((prev) => [...prev, ev])
          getRunResponse(rid).then((r) => {
            if (r?.response?.trim()) setQueriedResponse(r.response.trim())
          })
          getRun(rid).then((run) => {
            if (run && (run.status === 'completed' || run.status === 'failed')) {
              setRunCompletedFromPoll(true)
              setSending(false)
              listMessages(sessionId).then(setMessages).catch(() => {})
            }
          })
          if (ev.nodeType?.toUpperCase() === 'SYSTEM' && ev.status?.toUpperCase() === 'COMPLETED') {
            listMessages(sessionId).then(setMessages).catch(() => {})
          }
        }
        runEventsStore.getState().setOnRunEventCallback(onEvent)

        if (getCurrentSocket()) {
          console.log('[Chat] C. WebSocket SUBSCRIBE_RUN', { runId })
          subscribeToRun(runId)
        } else {
          console.log('[Chat] C. streamRunEvents subscribe (SSE)', { runId })
          unsubscribeRunRef.current = streamRunEvents(
            runId,
            (ev) => {
              runEventsStore.getState().addEvent(ev)
              onEvent(runId, ev)
            },
            (err) => {
              console.log('[Chat] E. stream onError', err)
              setError(String(err))
              setSending(false)
            }
          )
        }
      })
      .catch((e) => {
        console.log('[Chat] F. sendMessage HTTP catch', e?.message)
        setError(String(e.message))
        setSending(false)
      })
  }, [input, sessionId, sending, fetchSessions])

  const handleResend = useCallback(
    (content: string) => {
      if (!content?.trim() || !sessionId || sending) return
      const { selectedQueueId: q } = conversationPanelStore.getState()
      setSending(true)
      setError(null)
      setRunEvents([])
      setRunCompletedFromPoll(false)
      setQueriedResponse(null)
      sendMessage(sessionId, content.trim(), {
        taskQueue: q ? queueDisplayName(q) : undefined,
      })
        .then(({ runId }) => {
          console.log('[Chat Resend] B. sendMessage HTTP resolved', { runId })
          setActiveRunId(runId)
          runEventsStore.getState().setRun(runId)
          listMessages(sessionId).then(setMessages).catch(() => {})
          fetchSessions()
          unsubscribeRunRef.current?.()

          const onEvent = (rid: string, ev: RunEventDto) => {
            setRunEvents((prev) => [...prev, ev])
            getRunResponse(rid).then((r) => {
              if (r?.response?.trim()) setQueriedResponse(r.response.trim())
            })
            getRun(rid).then((run) => {
              if (run && (run.status === 'completed' || run.status === 'failed')) {
                setRunCompletedFromPoll(true)
                setSending(false)
                listMessages(sessionId).then(setMessages).catch(() => {})
              }
            })
            if (ev.nodeType?.toUpperCase() === 'SYSTEM' && ev.status?.toUpperCase() === 'COMPLETED') {
              listMessages(sessionId).then(setMessages).catch(() => {})
            }
          }
          runEventsStore.getState().setOnRunEventCallback(onEvent)

          if (getCurrentSocket()) {
            console.log('[Chat Resend] C. WebSocket SUBSCRIBE_RUN', { runId })
            subscribeToRun(runId)
          } else {
            console.log('[Chat Resend] C. streamRunEvents subscribe (SSE)', { runId })
            unsubscribeRunRef.current = streamRunEvents(
              runId,
              (ev) => {
                runEventsStore.getState().addEvent(ev)
                onEvent(runId, ev)
              },
              (err) => {
                console.log('[Chat Resend] E. stream onError', err)
                setError(String(err))
                setSending(false)
              }
            )
          }
        })
        .catch((e) => {
          console.log('[Chat Resend] F. sendMessage HTTP catch', e?.message)
          setError(String(e.message))
          setSending(false)
        })
    },
    [sessionId, sending, fetchSessions]
  )

  useEffect(() => {
    return () => {
      unsubscribeRunRef.current?.()
    }
  }, [])

  // Re-enable Send and Resend when workflow completes: MODEL COMPLETED with output, or SYSTEM COMPLETED/FAILED (from Temporal)
  useEffect(() => {
    if (!sending) return
    const summary = runEvents.map((e) => ({
      nodeType: e.nodeType,
      status: e.status,
      hasOutput: e.output != null,
      match: e.nodeType?.toUpperCase() === 'MODEL' && (e.status?.toUpperCase() === 'COMPLETED' || e.status) && e.output != null,
    }))
    const hasWorkflowComplete = runEvents.some(
      (e) =>
        (e.nodeType?.toUpperCase() === 'MODEL' &&
          (e.status?.toUpperCase() === 'COMPLETED' || e.status) &&
          e.output != null) ||
        (e.nodeType?.toUpperCase() === 'SYSTEM' &&
          (e.status?.toUpperCase() === 'COMPLETED' || e.status?.toUpperCase() === 'FAILED'))
    )
    console.log('[Chat] G. workflow-complete check', {
      runEventsCount: runEvents.length,
      summary,
      hasWorkflowComplete,
    })
    if (hasWorkflowComplete) {
      console.log('[Chat] H. setSending(false) — workflow complete')
      setSending(false)
    }
  }, [sending, runEvents])

  const lastModelOutput = runEvents
    .filter(
      (e) =>
        (e.nodeType?.toUpperCase() === 'MODEL' && e.status?.toUpperCase() === 'COMPLETED' && e.output) ||
        (e.nodeType?.toUpperCase() === 'MODEL' && e.output)
    )
    .pop()
  const lastSystemCompleted = runEvents
    .filter(
      (e) => e.nodeType?.toUpperCase() === 'SYSTEM' && e.status?.toUpperCase() === 'COMPLETED' && e.output
    )
    .pop()
  const assistantTextFromModel = lastModelOutput ? extractAssistantText(lastModelOutput.output) : null
  const assistantTextFromSystem = lastSystemCompleted ? extractAssistantText(lastSystemCompleted.output) : null
  const hasSystemCompleted = runEvents.some(
    (e) => e.nodeType?.toUpperCase() === 'SYSTEM' && e.status?.toUpperCase() === 'COMPLETED'
  )
  // Show reply: queried from API (on event or poll), or from events, or fallback when completed with no text
  const displayAssistantText =
    (queriedResponse?.trim() || null) ??
    assistantTextFromModel ??
    assistantTextFromSystem ??
    (hasSystemCompleted || runCompletedFromPoll ? 'Response received.' : null)
  // Don't show the inline assistant block if the last message is already assistant (from listMessages refetch) — avoids duplicate
  const lastMessageIsAssistant = messages.length > 0 && messages[messages.length - 1].role === 'assistant'
  const showInlineAssistant = displayAssistantText && !lastMessageIsAssistant

  if (!connected) {
    return (
      <div className="chat-view chat-view-disconnected">
        <p>Connecting to Olo backend…</p>
        <p className="chat-view-hint">Start the olo backend (port 7080) and refresh.</p>
      </div>
    )
  }

  return (
    <div className="chat-view">
      {!sessionId ? (
        <div className="chat-view-messages">
          <div className="chat-view-placeholder chat-view-placeholder-empty">
            {sessions.length === 0
              ? 'No conversations yet. Click "New chat" in the Conversation panel to start.'
              : 'Click "New chat" in the Conversation panel to start a new conversation.'}
          </div>
        </div>
      ) : (
        <>
      <div className="chat-view-messages">
        {loading && messages.length === 0 ? (
          <div className="chat-view-placeholder">Loading conversation…</div>
        ) : (
          <>
            {messages.map((m, index) => {
              const resendContent =
                m.role === 'user'
                  ? m.content
                  : messages
                      .slice(0, index)
                      .filter((msg) => msg.role === 'user')
                      .pop()?.content
              return (
                <div key={m.messageId} className={`chat-view-message-wrap chat-view-message-wrap-${m.role}`}>
                  <div className={`chat-view-message chat-view-message-${m.role}`}>
                    <div className="chat-view-message-header">
                      <span className="chat-view-message-role">{m.role}</span>
                      {m.role === 'user' && resendContent && (
                        <button
                          type="button"
                          className="chat-view-message-resend"
                          onClick={() => handleResend(resendContent)}
                          disabled={sending}
                          aria-label="Resend"
                          title="Resend"
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                            <path d="M1 4v6h6" />
                            <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
                          </svg>
                        </button>
                      )}
                    </div>
                    <div className="chat-view-message-content">
                      {m.role === 'assistant' ? formatAssistantContent(m.content) : m.content}
                    </div>
                  </div>
                </div>
              )
            })}
            {showInlineAssistant && (
              <div className="chat-view-message-wrap chat-view-message-wrap-assistant">
                <div className="chat-view-message chat-view-message-assistant">
                  <div className="chat-view-message-header">
                    <span className="chat-view-message-role">assistant</span>
                  </div>
                  <div className="chat-view-message-content">{formatAssistantContent(displayAssistantText)}</div>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </>
        )}
      </div>
      {error && (
        <div className="chat-view-error" role="alert">
          {error}
        </div>
      )}
      {sending && (
        <div className="chat-view-waiting" role="status" aria-live="polite">
          Waiting for response…
        </div>
      )}
      <div className="chat-view-suggestions">
        {COMMON_MESSAGES.map((msg) => (
          <button
            key={msg}
            type="button"
            className="chat-view-suggestion-chip"
            onClick={() => setInput(msg)}
            disabled={sending || !sessionId}
          >
            {msg}
          </button>
        ))}
      </div>
      <form
        className="chat-view-input-bar"
        onSubmit={(e) => {
          e.preventDefault()
          handleSend()
        }}
      >
        <input
          className="chat-view-input"
          placeholder="Type a message…"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          disabled={sending || !sessionId}
          aria-label="Message"
        />
        <button type="submit" className="chat-view-send" disabled={sending || !sessionId || !input.trim()}>
          {sending ? '…' : 'Send'}
        </button>
      </form>
        </>
      )}
    </div>
  )
}
