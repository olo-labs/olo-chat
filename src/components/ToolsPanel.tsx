/**
 * Copyright (c) 2026 Olo Labs
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Contextual tools panel: tools for the current view (section + sub-option).
 * For Chat: **New chat** and sessions list. Queue/pipeline for sends come from the selected profile in ChatView.
 */

import { useEffect, useState, useRef } from 'react'
import type { SectionId } from '../types/layout'
import { getToolsForView, getToolComponent, type ToolContext } from '../config/toolRegistry'
import { deleteAllSessions, deleteSession, type ChatProfileDto } from '../api/chatApi'
import type { SessionSummaryDto } from '../api/chatApi'
import { chatSessionsStore } from '../store/chatSessions'
import { conversationPanelStore } from '../store/conversationPanel'
import { runEventsStore } from '../store/runEvents'
import { sessionDisplayStore, truncateLabel } from '../store/sessionDisplay'
import { queueDisplayName } from '../lib/queueDisplayName'
import { KnowledgeSourcesList } from './KnowledgeSourcesList'

export interface ToolsPanelProps {
  expanded: boolean
  onToggle: () => void
  sectionId: SectionId | null
  subId: string
  runSelected: boolean
  tenantId?: string
  /** Owning-store slice for the current section. Tools use this only. */
  storeContext?: Record<string, unknown>
  /** Called when user clicks "New chat" in Conversation (chat section only). */
  onNewChat?: () => void
  /** From GET /api/ui/context (used for layout; queue/pipeline live in ChatView). */
  chatProfiles?: ChatProfileDto[]
}

function formatSessionLabel(createdAt: number): string {
  const d = new Date(createdAt)
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

const LABEL_MAX = 48
const PREVIEW_MAX = 40

function getSessionDisplay(session: SessionSummaryDto): { primary: string; subtitle?: string } {
  const entry = sessionDisplayStore.getState().entries[session.sessionId]
  const customTitle = entry?.customTitle?.trim()
  const preview = entry?.firstMessagePreview?.trim()
  const fallback = formatSessionLabel(session.createdAt)
  const primary = customTitle || (preview ? truncateLabel(preview, LABEL_MAX) : fallback)
  const subtitle =
    customTitle && preview ? truncateLabel(preview, PREVIEW_MAX) : undefined
  return { primary, subtitle }
}

export function ToolsPanel({
  expanded,
  onToggle,
  sectionId,
  subId,
  runSelected,
  tenantId = '',
  storeContext = {},
  onNewChat,
  chatProfiles: _chatProfiles = [],
}: ToolsPanelProps) {
  const selectedQueueId = conversationPanelStore((s) => s.selectedQueueId)
  const selectedPipelineId = conversationPanelStore((s) => s.selectedPipelineId)
  const [deletingAll, setDeletingAll] = useState(false)
  const [deletingSessionId, setDeletingSessionId] = useState<string | null>(null)
  const [editingSessionId, setEditingSessionId] = useState<string | null>(null)
  const [editDraft, setEditDraft] = useState('')
  const editInputRef = useRef<HTMLInputElement>(null)
  const sessionDisplayEntries = sessionDisplayStore((s) => s.entries)
  const setCustomTitle = sessionDisplayStore((s) => s.setCustomTitle)
  const removeSessionDisplay = sessionDisplayStore((s) => s.removeSession)
  const removeSessionsDisplay = sessionDisplayStore((s) => s.removeSessions)
  const isChatView = sectionId === 'chat'
  const isKnowledgeView = sectionId === 'knowledge'
  /** Wait for App to set tenant from GET /api/ui/context — do not use "default" or APIs run twice. */
  const effectiveTenantId = tenantId?.trim() ?? ''
  const sessions = chatSessionsStore((s) => s.sessions)
  const selectedSessionId = chatSessionsStore((s) => s.selectedSessionId)
  const setSessions = chatSessionsStore((s) => s.setSessions)
  const setSelectedSessionId = chatSessionsStore((s) => s.setSelectedSessionId)

  useEffect(() => {
    if (editingSessionId) editInputRef.current?.focus()
  }, [editingSessionId])

  useEffect(() => {
    if (!isChatView || !effectiveTenantId) {
      conversationPanelStore.getState().setSelectedQueueId('')
      conversationPanelStore.getState().setSelectedPipelineId('')
      conversationPanelStore.getState().setSelectedProfileId('')
    }
  }, [isChatView, effectiveTenantId])

  const tools = getToolsForView(sectionId, subId, runSelected)
  const context: ToolContext = {
    sectionId,
    subId,
    runSelected,
    storeContext,
  }

  return (
    <aside className={`tools-panel side-panel ${expanded ? 'expanded' : 'collapsed'}`}>
      {expanded && (
        <div className="side-panel-inner">
          <div className="side-panel-title">{isKnowledgeView ? 'Knowledge sources' : 'Conversation'}</div>
          {isKnowledgeView && (
            <>
              <KnowledgeSourcesList />
            </>
          )}
          {sectionId === 'chat' && isChatView && (
            <>
              <div className="conversation-new-chat-wrap">
                <button
                  type="button"
                  className="conversation-new-chat"
                  onClick={() => onNewChat?.()}
                  aria-label="Start a new chat"
                >
                  New chat
                </button>
              </div>
              <div className="conversation-sessions-block">
                <ul className="conversation-sessions-list" role="list">
                  {sessions.map((s) => {
                    const isEditing = editingSessionId === s.sessionId
                    const display = getSessionDisplay(s)
                    return (
                      <li key={s.sessionId} className="conversation-session-item">
                        <div className="conversation-session-btn-wrap">
                          {isEditing ? (
                            <input
                              ref={editInputRef}
                              type="text"
                              className="conversation-session-edit-input"
                              value={editDraft}
                              onChange={(e) => setEditDraft(e.target.value)}
                              onBlur={() => {
                                setCustomTitle(s.sessionId, editDraft)
                                setEditingSessionId(null)
                              }}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  setCustomTitle(s.sessionId, editDraft)
                                  setEditingSessionId(null)
                                } else if (e.key === 'Escape') {
                                  setEditDraft(sessionDisplayEntries[s.sessionId]?.customTitle ?? '')
                                  setEditingSessionId(null)
                                }
                              }}
                              onClick={(e) => e.stopPropagation()}
                              aria-label="Edit conversation name"
                            />
                          ) : (
                            <button
                              type="button"
                              className={`conversation-session-btn ${s.sessionId === selectedSessionId ? 'active' : ''}`}
                              onClick={() => setSelectedSessionId(s.sessionId)}
                            >
                              <span className="conversation-session-label">{display.primary}</span>
                              {display.subtitle && (
                                <span className="conversation-session-preview">{display.subtitle}</span>
                              )}
                            </button>
                          )}
                          {!isEditing && (
                            <button
                              type="button"
                              className="conversation-session-edit"
                              onClick={(e) => {
                                e.stopPropagation()
                                setEditingSessionId(s.sessionId)
                                setEditDraft(sessionDisplayEntries[s.sessionId]?.customTitle ?? '')
                              }}
                              aria-label="Edit name"
                              title="Edit name"
                            >
                              ✎
                            </button>
                          )}
                        </div>
                        <button
                          type="button"
                          className="conversation-session-delete"
                          onClick={(e) => {
                            e.stopPropagation()
                            if (deletingSessionId || deletingAll) return
                            setDeletingSessionId(s.sessionId)
                            deleteSession(s.sessionId)
                              .then(() => {
                                removeSessionDisplay(s.sessionId)
                                const wasSelected = s.sessionId === selectedSessionId
                                const current = chatSessionsStore.getState().sessions
                                const next = current.filter((sess) => sess.sessionId !== s.sessionId)
                                setSessions(next)
                                if (wasSelected) {
                                  setSelectedSessionId(next[0]?.sessionId ?? null)
                                  runEventsStore.getState().clear()
                                }
                              })
                              .finally(() => setDeletingSessionId(null))
                          }}
                          disabled={deletingAll}
                          aria-label={`Delete conversation ${display.primary}`}
                          title="Delete conversation"
                        >
                          {deletingSessionId === s.sessionId ? '…' : '×'}
                        </button>
                      </li>
                    )
                  })}
                </ul>
                <div className="conversation-delete-all-wrap">
                  <button
                    type="button"
                    className="conversation-delete-all"
                    onClick={() => {
                      if (!effectiveTenantId || deletingAll) return
                      setDeletingAll(true)
                      deleteAllSessions(effectiveTenantId, {
                        queue: selectedQueueId ? queueDisplayName(selectedQueueId) : undefined,
                        pipeline: selectedPipelineId || undefined,
                      })
                        .then(() => {
                          removeSessionsDisplay(sessions.map((s) => s.sessionId))
                          setSessions([])
                          setSelectedSessionId(null)
                          runEventsStore.getState().clear()
                        })
                        .finally(() => setDeletingAll(false))
                    }}
                    disabled={sessions.length === 0 || deletingAll}
                    aria-label="Delete all conversations"
                  >
                    {deletingAll ? '…' : 'Delete all'}
                  </button>
                </div>
              </div>
            </>
          )}
          {tools.length > 0 && (
            <ul className="tools-list">
              {tools.map((t) => {
                const ToolComponent = getToolComponent(t.id)
                return (
                  <li key={t.id} className="tools-list-item">
                    {ToolComponent ? (
                      <ToolComponent context={context} />
                    ) : (
                      <>
                        <span className="tools-list-label">{t.label}</span>
                        {t.description && <span className="tools-list-desc">{t.description}</span>}
                      </>
                    )}
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      )}
      <button
        type="button"
        className="side-panel-toggle"
        onClick={onToggle}
        title={expanded ? 'Collapse' : 'Expand'}
        aria-label={expanded ? 'Collapse tools' : 'Expand tools'}
      >
        {expanded ? (
          '<'
        ) : (
          <span className="side-panel-collapsed-label">Conversation</span>
        )}
      </button>
    </aside>
  )
}
