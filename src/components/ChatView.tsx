/**
 * Copyright (c) 2026 Olo Labs
 * SPDX-License-Identifier: Apache-2.0
 */

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import {
  createSession,
  getRun,
  getRunResponse,
  listMessages,
  listSessions,
  sendMessage,
  streamRunEvents,
  submitHumanInput,
  type ChatMessageDto,
  type ChatProfileDto,
  type RunEventDto,
} from '../api/chatApi'
import {
  eventsForRun,
  getActiveRunStorageKey,
  isLivenessEvent,
  loadPersistedRunEvents,
  RUN_EVENTS_PERSIST_MAX,
  runEventsStore,
} from '../store/runEvents'
import { chatSessionsStore } from '../store/chatSessions'
import { conversationPanelStore } from '../store/conversationPanel'
import { sessionDisplayStore } from '../store/sessionDisplay'
import { queueDisplayName } from '../lib/queueDisplayName'
import { emojiForProfile, formatProfileOptionLabel } from '../lib/chatProfileUi'
import {
  fallbackResponseMessage,
  isRunTerminalFromApi,
  isWorkflowFinished,
  normalizeResponseText,
  pickResponseFromEvents,
  resolvePersistedAssistantContent,
} from '../lib/assistantResponse'
import { getCurrentSocket, subscribeToRun } from '../lib/wsSingleton'

const profileByRunStorageKey = (sid: string) => `olo:chat-run-profiles:${sid}`

/** Worker progress panel below composer: expanded + height persist across refresh (same idea as panel widths in `ui` store). */
const CHAT_PROGRESS_EXPANDED_KEY = 'olo:chat-progress-expanded'
const CHAT_PROGRESS_HEIGHT_KEY = 'olo:chat-progress-height'
const CHAT_PROGRESS_HEIGHT_MIN = 120
const CHAT_PROGRESS_HEIGHT_MAX = 600
const CHAT_PROGRESS_HEIGHT_DEFAULT = 220

function readStoredProgressExpanded(): boolean {
  if (typeof window === 'undefined') return false
  try {
    return window.localStorage.getItem(CHAT_PROGRESS_EXPANDED_KEY) === '1'
  } catch {
    return false
  }
}

function readStoredProgressHeight(): number {
  if (typeof window === 'undefined') return CHAT_PROGRESS_HEIGHT_DEFAULT
  try {
    const raw = window.localStorage.getItem(CHAT_PROGRESS_HEIGHT_KEY)
    const n = raw != null ? Number(raw) : NaN
    if (Number.isFinite(n) && n >= CHAT_PROGRESS_HEIGHT_MIN && n <= CHAT_PROGRESS_HEIGHT_MAX) {
      return Math.round(n)
    }
  } catch {
    /* ignore */
  }
  return CHAT_PROGRESS_HEIGHT_DEFAULT
}

/** Older human-step assistant lines may contain a lone `<Options>` line and extra newlines; strip for display. */
function normalizeHumanStepHistoryContent(raw: string | null | undefined): string | null | undefined {
  if (raw == null) return raw
  const head = raw.trimStart()
  if (head.startsWith('{')) return raw
  if (!raw.includes('User Input Step:')) return raw
  let s = raw.replace(/\r\n/g, '\n')
  s = s
    .split('\n')
    .filter((line) => !/^\s*<Options>\s*$/i.test(line))
    .join('\n')
  s = s.replace(/(User Input Step:[^\n]*)\n{2,}/g, '$1\n')
  return s
}

/** User message that is the worker human-step reply (follows assistant “User Input Step:” line). */
function isHumanStepReplyMessage(messages: ChatMessageDto[], index: number): boolean {
  if (index <= 0) return false
  const prev = messages[index - 1]
  if (prev.role !== 'assistant') return false
  const head = (prev.content ?? '').trimStart()
  return head.startsWith('User Input Step:')
}

const COMMON_MESSAGES = [
  'Hello, what can you help me with?',
  'Summarize this in a few bullet points.',
  'Search for recent news on this topic.',
  'Explain this in simpler terms.',
  'What are the main pros and cons?',
]

function stringValue(v: unknown): string | null {
  return typeof v === 'string' && v.trim().length > 0 ? v.trim() : null
}

/** Prompt text for a HUMAN WAITING event (worker may use `prompt` or `message` on input/metadata). */
function humanStepPromptFromEvent(ev: RunEventDto | null | undefined): string {
  if (!ev) return 'This run needs your input.'
  const input = ev.input
  const meta = ev.metadata
  return (
    stringValue(input?.message) ??
    stringValue(input?.prompt) ??
    stringValue(meta?.message) ??
    stringValue(meta?.prompt) ??
    'This run needs your input.'
  )
}

/** One selectable option from worker `input.options` (or metadata/output). */
type HumanStepOption = {
  label: string
  approved?: boolean
  message?: string
}

/** Parses worker options: array of strings or objects with label/text, optional approved & message. */
function humanStepOptionsFromEvent(ev: RunEventDto | null | undefined): HumanStepOption[] {
  if (!ev) return []
  const raw = ev.input?.options ?? ev.metadata?.options ?? ev.output?.options
  if (!Array.isArray(raw) || raw.length === 0) return []
  return raw.map((item, i) => {
    if (typeof item === 'string') {
      const s = item.trim()
      return { label: s, message: s }
    }
    if (item != null && typeof item === 'object') {
      const o = item as Record<string, unknown>
      const label = stringValue(o.label) ?? stringValue(o.text) ?? `Option ${i + 1}`
      const approved = typeof o.approved === 'boolean' ? o.approved : undefined
      const msg = stringValue(o.message)
      const out: HumanStepOption = { label, approved }
      if (msg !== null) out.message = msg
      return out
    }
    return { label: String(item) }
  })
}

function summarizeValue(v: unknown, maxLen = 140): string | null {
  if (v == null) return null
  let text: string
  if (typeof v === 'string') text = v.trim()
  else if (typeof v === 'number' || typeof v === 'boolean') text = String(v)
  else text = JSON.stringify(v)
  if (!text) return null
  return text.length > maxLen ? `${text.slice(0, maxLen)}...` : text
}

function summarizeMap(m?: Record<string, unknown>): string | null {
  if (!m || Object.keys(m).length === 0) return null
  const entries = Object.entries(m)
  if (entries.length === 0) return null
  const parts: string[] = []
  for (const [k, v] of entries.slice(0, 3)) {
    const sv = summarizeValue(v, 80)
    if (sv) parts.push(`${k}: ${sv}`)
  }
  return parts.length > 0 ? parts.join(' | ') : null
}

export interface ChatViewProps {
  tenantId?: string
  /** When this increments, start a new chat (triggered by Conversation panel "New chat" button). */
  newChatTrigger?: number
  /** From GET /api/ui/context — each preset carries queue + pipeline for sends and sessions. */
  chatProfiles?: ChatProfileDto[]
  /** From App health poll; when false, show disconnected placeholder instead of chat. */
  backendReachable?: boolean
}

export function ChatView({
  tenantId: tenantIdProp,
  newChatTrigger = 0,
  chatProfiles = [],
  backendReachable = false,
}: ChatViewProps) {
  const tenantId = tenantIdProp?.trim() ?? ''
  const selectedProfileId = conversationPanelStore((s) => s.selectedProfileId)
  const setSelectedProfileId = conversationPanelStore((s) => s.setSelectedProfileId)
  const setSelectedQueueId = conversationPanelStore((s) => s.setSelectedQueueId)
  const setSelectedPipelineId = conversationPanelStore((s) => s.setSelectedPipelineId)
  const sessions = chatSessionsStore((s) => s.sessions)
  const sessionId = chatSessionsStore((s) => s.selectedSessionId)
  const setSessions = chatSessionsStore((s) => s.setSessions)
  const setSelectedSessionId = chatSessionsStore((s) => s.setSelectedSessionId)
  const [, setSessionsLoading] = useState(false)
  const [messages, setMessages] = useState<ChatMessageDto[]>([])
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [input, setInput] = useState('')
  /** Single source of truth with WebSocket (`useWebSocketLiveness` only updates the store). Local state was stale after refresh. */
  const runEvents = runEventsStore((s) => s.events)
  const [activeRunId, setActiveRunId] = useState<string | null>(null)
  /** Set when run completes/fails from API poll (so we show fallback message even if SSE didn't deliver SYSTEM event) */
  const [runCompletedFromPoll, setRunCompletedFromPoll] = useState(false)
  /** Current response from GET /api/runs/{runId}/response — queried when we receive events or poll while in progress */
  const [queriedResponse, setQueriedResponse] = useState<string | null>(null)
  const [humanInputText, setHumanInputText] = useState('')
  const [submittingHumanInput, setSubmittingHumanInput] = useState(false)
  const [progressExpanded, setProgressExpanded] = useState(readStoredProgressExpanded)
  const [progressHeight, setProgressHeight] = useState(readStoredProgressHeight)
  const [progressResizing, setProgressResizing] = useState(false)
  const resizingRef = useRef(false)
  const resizeStartYRef = useRef(0)
  const resizeStartHeightRef = useRef(CHAT_PROGRESS_HEIGHT_DEFAULT)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const unsubscribeRunRef = useRef<(() => void) | null>(null)
  /** Session id we just created (New chat); avoid clearing selection when list doesn't include it yet. */
  const lastCreatedSessionIdRef = useRef<string | null>(null)
  /** Maps runId → preset label for messages (profile mode); persisted per session in sessionStorage. */
  const [profileByRunId, setProfileByRunId] = useState<Record<string, { profileId: string; label: string }>>({})
  const lastOutboundRunIdRef = useRef<string | null>(null)
  /** After refresh, restore persisted run events once per selected session. */
  const shouldTryRestoreRunEventsRef = useRef(true)

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [])

  const handleRunEvent = useCallback(
    (rid: string, _ev: RunEventDto) => {
      if (!sessionId) return
      getRunResponse(rid).then((r) => {
        if (r?.response?.trim()) setQueriedResponse(r.response.trim())
      })
      const events = eventsForRun(runEventsStore.getState().events, rid)
      getRun(rid).then((run) => {
        if (!run || !isRunTerminalFromApi(run.status, events)) return
        setRunCompletedFromPoll(true)
        setSending(false)
        listMessages(sessionId).then(setMessages).catch(() => {})
      })
      if (isWorkflowFinished(events)) {
        listMessages(sessionId).then(setMessages).catch(() => {})
      }
    },
    [sessionId],
  )

  useLayoutEffect(() => {
    if (chatProfiles.length === 0) return
    const validIds = new Set(chatProfiles.map((p) => p.id))
    const current = conversationPanelStore.getState().selectedProfileId
    if (current && validIds.has(current)) return
    const first = chatProfiles[0]
    setSelectedProfileId(first.id)
    setSelectedQueueId(first.queue)
    setSelectedPipelineId(first.pipeline)
  }, [chatProfiles, setSelectedProfileId, setSelectedQueueId, setSelectedPipelineId])

  const selectedProfile = useMemo(() => {
    if (chatProfiles.length === 0) return null
    return chatProfiles.find((p) => p.id === selectedProfileId) ?? chatProfiles[0]
  }, [chatProfiles, selectedProfileId])

  /** Presets allowed in per-message run-again (pipeline {@code run_again}; default false when absent). */
  const runAgainProfiles = useMemo(
    () => chatProfiles.filter((p) => p.runAgain === true),
    [chatProfiles]
  )

  const recordProfileForRun = useCallback(
    (runId: string) => {
      if (!runId?.trim() || chatProfiles.length === 0) return
      const { selectedProfileId: pid } = conversationPanelStore.getState()
      const prof = chatProfiles.find((p) => p.id === pid) ?? chatProfiles[0]
      if (!prof) return
      const idx = chatProfiles.findIndex((p) => p.id === prof.id)
      const label = formatProfileOptionLabel(prof, idx >= 0 ? idx : 0)
      setProfileByRunId((prev) => {
        if (prev[runId]?.profileId === prof.id && prev[runId]?.label === label) return prev
        return { ...prev, [runId]: { profileId: prof.id, label } }
      })
    },
    [chatProfiles]
  )

  useEffect(() => {
    if (!sessionId || chatProfiles.length === 0) {
      setProfileByRunId({})
      return
    }
    try {
      const raw = sessionStorage.getItem(profileByRunStorageKey(sessionId))
      if (raw) {
        const parsed = JSON.parse(raw) as Record<string, { profileId: string; label: string }>
        if (parsed && typeof parsed === 'object') setProfileByRunId(parsed)
      } else {
        setProfileByRunId({})
      }
    } catch {
      setProfileByRunId({})
    }
  }, [sessionId, chatProfiles.length])

  useEffect(() => {
    if (!sessionId || chatProfiles.length === 0) return
    try {
      sessionStorage.setItem(profileByRunStorageKey(sessionId), JSON.stringify(profileByRunId))
    } catch {
      /* quota */
    }
  }, [sessionId, chatProfiles.length, profileByRunId])

  const selectedProfileIndex = useMemo(() => {
    if (!selectedProfile) return 0
    const i = chatProfiles.findIndex((p) => p.id === selectedProfile.id)
    return i >= 0 ? i : 0
  }, [chatProfiles, selectedProfile])

  const fetchSessions = useCallback(() => {
    if (!tenantId || chatProfiles.length === 0) return
    setSessionsLoading(true)
    listSessions(tenantId)
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
  }, [tenantId, chatProfiles.length, setSessions, setSelectedSessionId])

  useEffect(() => {
    if (!tenantId || chatProfiles.length === 0) {
      setSessions([])
      setSelectedSessionId(null)
      return
    }
    fetchSessions()
  }, [tenantId, chatProfiles.length, fetchSessions, setSelectedSessionId, setSessions])

  useEffect(() => {
    if (sessions.length > 0 && !sessionId) {
      setSelectedSessionId(sessions[0].sessionId)
    }
  }, [sessions, sessionId, setSelectedSessionId])

  useEffect(() => {
    shouldTryRestoreRunEventsRef.current = true
  }, [sessionId])

  useEffect(() => {
    if (!sessionId) return
    setLoading(true)
    setRunCompletedFromPoll(false)
    setQueriedResponse(null)
    setActiveRunId(null)
    runEventsStore.getState().clear()
    unsubscribeRunRef.current?.()
    listMessages(sessionId)
      .then(setMessages)
      .catch((e) => setError(String(e.message)))
      .finally(() => setLoading(false))
  }, [sessionId])

  /** Repopulate last persisted run events after refresh (localStorage), then resubscribe WS for that run. */
  useEffect(() => {
    if (!sessionId || loading || !shouldTryRestoreRunEventsRef.current) return
    const rid = sessionStorage.getItem(getActiveRunStorageKey(sessionId))?.trim()
    if (!rid) {
      shouldTryRestoreRunEventsRef.current = false
      return
    }
    const persisted = loadPersistedRunEvents(rid)
    if (!persisted?.length) {
      shouldTryRestoreRunEventsRef.current = false
      return
    }
    runEventsStore.getState().hydrate(rid, persisted)
    lastOutboundRunIdRef.current = rid
    setActiveRunId(rid)

    const onRestoredRunEvent = (eventRid: string, ev: RunEventDto) => {
      handleRunEvent(eventRid, ev)
    }
    runEventsStore.getState().setOnRunEventCallback(onRestoredRunEvent)

    if (getCurrentSocket()) {
      subscribeToRun(rid)
    }
    shouldTryRestoreRunEventsRef.current = false
  }, [sessionId, loading, handleRunEvent])

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
    setError(null)
    setRunCompletedFromPoll(false)
    setQueriedResponse(null)
    setActiveRunId(null)
    runEventsStore.getState().clear()
    unsubscribeRunRef.current?.()
    createSession(tenantId, {})
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
    setActiveRunId(null)
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
        lastOutboundRunIdRef.current = runId
        recordProfileForRun(runId)
        try {
          sessionStorage.setItem(getActiveRunStorageKey(sessionId), runId)
        } catch {
          /* quota */
        }
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
          handleRunEvent(rid, ev)
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
  }, [input, sessionId, sending, fetchSessions, recordProfileForRun, handleRunEvent])

  const handleResend = useCallback(
    (content: string) => {
      if (!content?.trim() || !sessionId || sending) return
      const { selectedQueueId: q } = conversationPanelStore.getState()
      setSending(true)
      setError(null)
      setActiveRunId(null)
      setRunCompletedFromPoll(false)
      setQueriedResponse(null)
      sendMessage(sessionId, content.trim(), {
        taskQueue: q ? queueDisplayName(q) : undefined,
      })
        .then(({ runId }) => {
          console.log('[Chat Resend] B. sendMessage HTTP resolved', { runId })
          lastOutboundRunIdRef.current = runId
          recordProfileForRun(runId)
          try {
            sessionStorage.setItem(getActiveRunStorageKey(sessionId), runId)
          } catch {
            /* quota */
          }
          setActiveRunId(runId)
          runEventsStore.getState().setRun(runId)
          listMessages(sessionId).then(setMessages).catch(() => {})
          fetchSessions()
          unsubscribeRunRef.current?.()

          const onEvent = (rid: string, ev: RunEventDto) => {
            handleRunEvent(rid, ev)
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
    [sessionId, sending, fetchSessions, recordProfileForRun, handleRunEvent]
  )

  const handleResendWithProfile = useCallback(
    (profileId: string, content: string) => {
      const prof = chatProfiles.find((p) => p.id === profileId)
      if (!prof || !content?.trim()) return
      setSelectedProfileId(profileId)
      setSelectedQueueId(prof.queue)
      setSelectedPipelineId(prof.pipeline)
      handleResend(content.trim())
    },
    [chatProfiles, setSelectedProfileId, setSelectedQueueId, setSelectedPipelineId, handleResend]
  )

  const currentRunEvents = useMemo(
    () => eventsForRun(runEvents, activeRunId),
    [runEvents, activeRunId]
  )

  const humanWaitingRefetchKey = useMemo(() => {
    const w = [...currentRunEvents]
      .reverse()
      .find((e) => e.nodeType?.toUpperCase() === 'HUMAN' && e.status?.toUpperCase() === 'WAITING')
    return w ? `${w.sequenceNumber ?? 0}:${w.nodeId ?? ''}` : ''
  }, [currentRunEvents])

  useEffect(() => {
    if (!sessionId || !humanWaitingRefetchKey) return
    listMessages(sessionId).then(setMessages).catch(() => {})
  }, [sessionId, humanWaitingRefetchKey])

  useEffect(() => {
    return () => {
      unsubscribeRunRef.current?.()
    }
  }, [])

  // Re-enable Send and Resend when workflow completes: MODEL COMPLETED with output, or SYSTEM COMPLETED/FAILED (from Temporal)
  useEffect(() => {
    if (!sending || !activeRunId) return
    const summary = currentRunEvents.map((e) => ({
      nodeType: e.nodeType,
      status: e.status,
      hasOutput: e.output != null,
      match: e.nodeType?.toUpperCase() === 'MODEL' && (e.status?.toUpperCase() === 'COMPLETED' || e.status) && e.output != null,
    }))
    const hasWorkflowComplete = isWorkflowFinished(currentRunEvents)
    console.log('[Chat] G. workflow-complete check', {
      runEventsCount: currentRunEvents.length,
      summary,
      hasWorkflowComplete,
    })
    if (hasWorkflowComplete) {
      console.log('[Chat] H. setSending(false) — workflow complete')
      setSending(false)
    }
  }, [sending, activeRunId, currentRunEvents])

  const runFailed = currentRunEvents.some(
    (e) => e.nodeType?.toUpperCase() === 'SYSTEM' && e.status?.toUpperCase() === 'FAILED',
  )
  const runTerminal = runCompletedFromPoll || (!sending && isWorkflowFinished(currentRunEvents))
  const workflowReturnText =
    normalizeResponseText(queriedResponse) ??
    normalizeResponseText(pickResponseFromEvents(currentRunEvents))
  const inlineAssistantText =
    workflowReturnText ??
    (runTerminal && !sending ? fallbackResponseMessage(runFailed ? 'failed' : 'completed') : null)

  const assistantMessageContext = {
    activeRunId,
    sending,
    events: currentRunEvents,
  }

  const resolveAssistantBubbleText = (m: ChatMessageDto): string | null =>
    resolvePersistedAssistantContent(normalizeHumanStepHistoryContent(m.content), {
      ...assistantMessageContext,
      runId: m.runId,
      events: m.runId ? eventsForRun(runEvents, m.runId) : currentRunEvents,
    })

  const lastMsg = messages.length > 0 ? messages[messages.length - 1] : null
  const lastMessageIsAssistant =
    lastMsg?.role === 'assistant' && resolveAssistantBubbleText(lastMsg) != null
  const showInlineAssistant = inlineAssistantText != null && !lastMessageIsAssistant
  const progressEvents = runEvents.filter((e) => !isLivenessEvent(e)).slice(-RUN_EVENTS_PERSIST_MAX)

  useEffect(() => {
    try {
      window.localStorage.setItem(CHAT_PROGRESS_EXPANDED_KEY, progressExpanded ? '1' : '0')
    } catch {
      /* quota */
    }
  }, [progressExpanded])

  useEffect(() => {
    try {
      window.localStorage.setItem(CHAT_PROGRESS_HEIGHT_KEY, String(progressHeight))
    } catch {
      /* quota */
    }
  }, [progressHeight])

  useEffect(() => {
    const onPointerMove = (e: PointerEvent) => {
      if (!resizingRef.current) return
      const delta = e.clientY - resizeStartYRef.current
      const next = Math.min(
        CHAT_PROGRESS_HEIGHT_MAX,
        Math.max(CHAT_PROGRESS_HEIGHT_MIN, resizeStartHeightRef.current - delta)
      )
      setProgressHeight(next)
    }
    const onPointerUp = () => {
      resizingRef.current = false
      setProgressResizing(false)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }
    const onMouseMove = (e: MouseEvent) => {
      if (!resizingRef.current) return
      const delta = e.clientY - resizeStartYRef.current
      const next = Math.min(
        CHAT_PROGRESS_HEIGHT_MAX,
        Math.max(CHAT_PROGRESS_HEIGHT_MIN, resizeStartHeightRef.current - delta)
      )
      setProgressHeight(next)
    }
    const onMouseUp = () => {
      resizingRef.current = false
      setProgressResizing(false)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }
    window.addEventListener('pointermove', onPointerMove)
    window.addEventListener('pointerup', onPointerUp)
    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
    return () => {
      window.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('pointerup', onPointerUp)
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
    }
  }, [])
  const latestHumanWaiting = [...runEvents]
    .reverse()
    .find((e) => e.nodeType?.toUpperCase() === 'HUMAN' && e.status?.toUpperCase() === 'WAITING')
  const hasHumanCompletedAfterWait = latestHumanWaiting
    ? runEvents.some(
        (e) =>
          e.nodeType?.toUpperCase() === 'HUMAN' &&
          e.status?.toUpperCase() === 'COMPLETED' &&
          e.nodeId === latestHumanWaiting.nodeId &&
          (e.sequenceNumber ?? 0) >= (latestHumanWaiting.sequenceNumber ?? 0)
      )
    : false
  const pendingHumanEvent = latestHumanWaiting && !hasHumanCompletedAfterWait ? latestHumanWaiting : null
  const humanPromptMessage = humanStepPromptFromEvent(pendingHumanEvent ?? undefined)
  const humanStepOptions = humanStepOptionsFromEvent(pendingHumanEvent ?? undefined)
  const humanTaskId =
    stringValue(pendingHumanEvent?.metadata?.taskId) ??
    stringValue(pendingHumanEvent?.output?.taskId) ??
    pendingHumanEvent?.nodeId ??
    'human-input'
  const humanInputType = (
    stringValue(pendingHumanEvent?.metadata?.inputType) ??
    stringValue(pendingHumanEvent?.output?.inputType) ??
    'boolean'
  ).toLowerCase()

  const handleSubmitHumanInput = useCallback(
    async (approved: boolean, message: string) => {
      if (!pendingHumanEvent?.runId) return
      setSubmittingHumanInput(true)
      setError(null)
      try {
        await submitHumanInput(pendingHumanEvent.runId, { approved, message })
        if (sessionId) {
          listMessages(sessionId).then(setMessages).catch(() => {})
        }
        setHumanInputText('')
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e)
        setError(msg)
      } finally {
        setSubmittingHumanInput(false)
      }
    },
    [pendingHumanEvent, sessionId]
  )

  if (!backendReachable) {
    return (
      <div className="chat-view chat-view-disconnected">
        <p>Connecting to Olo backend…</p>
        <p className="chat-view-hint">Start the olo backend (port 7080) and refresh.</p>
      </div>
    )
  }

  if (chatProfiles.length === 0) {
    return (
      <div className="chat-view chat-view-disconnected">
        <p>No chat profiles configured.</p>
        <p className="chat-view-hint">
          Add workflow JSON files under <code>olo.configuration.dir</code> (e.g.{' '}
          <code>olo-mono/olo-definition/olo-configuration/current-active/*.json</code>) so{' '}
          <code>GET /api/ui/context</code> returns <code>chatProfiles</code>.
        </p>
      </div>
    )
  }

  const inlineAssistantRunId = runEvents[0]?.runId ?? lastOutboundRunIdRef.current ?? ''
  const inlineAssistantProfile = inlineAssistantRunId ? profileByRunId[inlineAssistantRunId] : undefined

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
              const usedProfileId = m.runId ? profileByRunId[m.runId]?.profileId : undefined
              const runAgainTargets =
                m.role === 'user' && !isHumanStepReplyMessage(messages, index) && runAgainProfiles.length > 0
                  ? runAgainProfiles.filter((p) => p.id !== usedProfileId)
                  : []
              const assistantText =
                m.role === 'assistant' ? resolveAssistantBubbleText(m) : null
              if (m.role === 'assistant' && assistantText == null) {
                return null
              }
              return (
                <div key={m.messageId} className={`chat-view-message-wrap chat-view-message-wrap-${m.role}`}>
                  <div className={`chat-view-message chat-view-message-${m.role}`}>
                    <div className="chat-view-message-header">
                      <div className="chat-view-message-header-main">
                        <span className="chat-view-message-role">{m.role}</span>
                        {m.runId && profileByRunId[m.runId] && (
                          <span className="chat-view-message-config" title="Preset used for this turn">
                            {profileByRunId[m.runId].label}
                          </span>
                        )}
                      </div>
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
                      {m.role === 'assistant' ? assistantText : m.content}
                    </div>
                    {m.role === 'user' && runAgainTargets.length > 0 && (
                      <div className="chat-view-msg-runagain-wrap">
                        <details className="chat-view-msg-runagain">
                          <summary
                            className="chat-view-msg-runagain-trigger"
                            aria-label="Run again with another preset"
                            title="Run again with another preset"
                          >
                            <svg
                              width="14"
                              height="14"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              aria-hidden
                            >
                              <path d="M17 1l4 4-4 4" />
                              <path d="M3 11V9a4 4 0 0 1 4-4h14" />
                              <path d="M7 23l-4-4 4-4" />
                              <path d="M21 13v2a4 4 0 0 1-4 4H3" />
                            </svg>
                          </summary>
                          <div className="chat-view-msg-runagain-menu" role="menu">
                            {runAgainTargets.map((p) => {
                              const idx = chatProfiles.findIndex((x) => x.id === p.id)
                              const label = formatProfileOptionLabel(p, idx >= 0 ? idx : 0)
                              return (
                                <button
                                  key={p.id}
                                  type="button"
                                  className="chat-view-msg-runagain-opt"
                                  role="menuitem"
                                  title={label}
                                  disabled={sending}
                                  onClick={(e) => {
                                    handleResendWithProfile(p.id, m.content)
                                    const details = (e.currentTarget as HTMLElement).closest('details')
                                    if (details) details.open = false
                                  }}
                                >
                                  {label}
                                </button>
                              )
                            })}
                          </div>
                        </details>
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
            {showInlineAssistant && (
              <div className="chat-view-message-wrap chat-view-message-wrap-assistant">
                <div className="chat-view-message chat-view-message-assistant">
                  <div className="chat-view-message-header">
                    <div className="chat-view-message-header-main">
                      <span className="chat-view-message-role">assistant</span>
                      {inlineAssistantProfile && (
                        <span className="chat-view-message-config" title="Preset for this reply">
                          {inlineAssistantProfile.label}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="chat-view-message-content">
                    {normalizeHumanStepHistoryContent(inlineAssistantText) ?? inlineAssistantText}
                  </div>
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
          {selectedProfile ? (
            <div className="chat-view-waiting-profile">
              <div className="chat-view-waiting-line1">
                <span className="chat-view-waiting-emoji" aria-hidden>
                  {emojiForProfile(selectedProfile, selectedProfileIndex)}
                </span>
                <span className="chat-view-waiting-text">
                  <strong>{selectedProfile.displayName || selectedProfile.id}</strong> is thinking…
                </span>
              </div>
              {selectedProfile.displaySummary?.trim() ? (
                <p className="chat-view-waiting-summary">{selectedProfile.displaySummary.trim()}</p>
              ) : null}
            </div>
          ) : (
            'Waiting for response…'
          )}
        </div>
      )}
      {pendingHumanEvent && (
        <div className="chat-view-human-card" role="region" aria-live="polite">
          <div className="chat-view-human-message">
            <p className="chat-view-human-step-line">
              User Input Step: {humanPromptMessage}
            </p>
            {humanStepOptions.length > 0 ? (
              <ul className="chat-view-human-options-list">
                {humanStepOptions.map((o, i) => (
                  <li key={`${o.label}-${i}`}>{o.label}</li>
                ))}
              </ul>
            ) : null}
          </div>
          <div className="chat-view-human-task">Task: {humanTaskId}</div>
          {humanStepOptions.length > 0 ? (
            <div className="chat-view-human-controls chat-view-human-options-row">
              {humanStepOptions.map((opt, i) => (
                <button
                  key={`${opt.label}-${i}`}
                  type="button"
                  className={`chat-view-human-btn ${i === 0 ? 'chat-view-human-btn-primary' : ''}`}
                  disabled={submittingHumanInput}
                  onClick={() => {
                    const approved = opt.approved !== undefined ? opt.approved : i === 0
                    handleSubmitHumanInput(approved, opt.message ?? opt.label)
                  }}
                >
                  {submittingHumanInput ? 'Submitting…' : opt.label}
                </button>
              ))}
            </div>
          ) : humanInputType === 'text' ? (
            <div className="chat-view-human-controls">
              <input
                className="chat-view-human-text-input"
                placeholder="Enter your input"
                value={humanInputText}
                onChange={(e) => setHumanInputText(e.target.value)}
                disabled={submittingHumanInput}
              />
              <button
                type="button"
                className="chat-view-human-btn chat-view-human-btn-primary"
                disabled={submittingHumanInput || !humanInputText.trim()}
                onClick={() => handleSubmitHumanInput(true, humanInputText.trim())}
              >
                {submittingHumanInput ? 'Submitting…' : 'Submit'}
              </button>
            </div>
          ) : null}
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
      <div className="chat-view-composer">
        <form
          className="chat-view-input-bar"
          onSubmit={(e) => {
            e.preventDefault()
            handleSend()
          }}
        >
          <div className="chat-view-profile-group">
              <select
                id="chat-profile-select"
                className="chat-view-profile-select chat-view-profile-select--pill"
                value={selectedProfileId || chatProfiles[0]?.id || ''}
                onChange={(e) => {
                  const id = e.target.value
                  const prof = chatProfiles.find((p) => p.id === id)
                  if (prof) {
                    setSelectedProfileId(id)
                    setSelectedQueueId(prof.queue)
                    setSelectedPipelineId(prof.pipeline)
                  }
                }}
                aria-label="Chat preset (queue and pipeline)"
              >
                {chatProfiles.map((p, i) => (
                  <option key={p.id} value={p.id} title={p.displaySummary?.trim() ? p.displaySummary : undefined}>
                    {formatProfileOptionLabel(p, i)}
                  </option>
                ))}
              </select>
            </div>
          <input
            className="chat-view-input"
            placeholder={
              selectedProfile ? `Ask ${selectedProfile.displayName || 'assistant'}…` : 'Type a message…'
            }
            value={input}
            onChange={(e) => setInput(e.target.value)}
            disabled={sending || !sessionId}
            aria-label="Message"
          />
          <button
            type="submit"
            className="chat-view-send"
            disabled={sending || !sessionId || !input.trim()}
          >
            {sending ? '…' : 'Send'}
          </button>
        </form>
      </div>
      <div className={`chat-view-progress-panel ${progressExpanded ? 'is-expanded' : 'is-collapsed'}`}>
        {!progressExpanded && (
          <div className="chat-view-progress-expand-row chat-view-progress-expand-row--collapsed">
            <div className="chat-view-progress-collapsed-track" aria-hidden />
            <button
              type="button"
              className="chat-view-progress-icon-btn chat-view-progress-float-btn"
              onClick={() => setProgressExpanded(true)}
              aria-expanded={false}
              title="Expand progress"
              aria-label="Expand progress"
            >
              ▸
            </button>
          </div>
        )}
        {progressExpanded && (
          <>
            <div className="chat-view-progress-expand-row">
              <div
                className={`chat-view-progress-resizer ${progressResizing ? 'is-active' : ''}`}
                onPointerDown={(e) => {
                  resizingRef.current = true
                  setProgressResizing(true)
                  resizeStartYRef.current = e.clientY
                  resizeStartHeightRef.current = progressHeight
                  document.body.style.cursor = 'ns-resize'
                  document.body.style.userSelect = 'none'
                }}
                onMouseDown={(e) => {
                  resizingRef.current = true
                  setProgressResizing(true)
                  resizeStartYRef.current = e.clientY
                  resizeStartHeightRef.current = progressHeight
                  document.body.style.cursor = 'ns-resize'
                  document.body.style.userSelect = 'none'
                }}
                role="separator"
                aria-orientation="horizontal"
                aria-label="Resize progress panel"
                title="Drag to resize"
              />
              <button
                type="button"
                className="chat-view-progress-icon-btn chat-view-progress-float-btn"
                onClick={(e) => {
                  e.stopPropagation()
                  setProgressExpanded(false)
                }}
                aria-expanded
                title="Collapse progress"
                aria-label="Collapse progress"
              >
                ▾
              </button>
            </div>
            <div
              className="chat-view-progress-body"
              style={{ height: `${progressHeight}px` }}
            >
              {progressEvents.length === 0 ? (
                <div className="chat-view-progress-empty">No worker events yet.</div>
              ) : (
                progressEvents.map((ev, i) => {
                  const inputSummary = summarizeMap(ev.input)
                  const outputSummary = summarizeMap(ev.output)
                  return (
                    <div
                      key={`${ev.runId ?? 'run'}-${ev.sequenceNumber ?? i}-${ev.nodeId ?? 'node'}`}
                      className={`chat-view-progress-line chat-view-event-${(ev.nodeType ?? 'system').toLowerCase()}`}
                    >
                      <span className="chat-view-progress-head">
                        #{ev.sequenceNumber ?? i} {ev.nodeType ?? '—'} {ev.status ?? '—'} {ev.nodeId ?? ''}
                      </span>
                      {inputSummary && <span className="chat-view-progress-io">IN: {inputSummary}</span>}
                      {outputSummary && <span className="chat-view-progress-io">OUT: {outputSummary}</span>}
                    </div>
                  )
                })
              )}
            </div>
          </>
        )}
      </div>
        </>
      )}
    </div>
  )
}
