/**
 * Copyright (c) 2026 Olo Labs
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Ref } from 'react'
import type { ChatMessageDto, ChatProfileDto } from '../../api/chatApi'
import { ChatInlineAssistant, ChatMessageItem } from './ChatMessageItem'

export interface ChatMessagesListProps {
  loading: boolean
  messages: ChatMessageDto[]
  messagesEndRef: Ref<HTMLDivElement>
  resolveAssistantBubbleText: (m: ChatMessageDto) => string | null
  profileByRunId: Record<string, { profileId: string; label: string }>
  runAgainProfiles: ChatProfileDto[]
  chatProfiles: ChatProfileDto[]
  sending: boolean
  showInlineAssistant: boolean
  inlineAssistantText: string | null
  inlineAssistantProfile?: { label: string }
  onResend: (content: string) => void
  onResendWithProfile: (profileId: string, content: string) => void
}

export function ChatMessagesList({
  loading,
  messages,
  messagesEndRef,
  resolveAssistantBubbleText,
  profileByRunId,
  runAgainProfiles,
  chatProfiles,
  sending,
  showInlineAssistant,
  inlineAssistantText,
  inlineAssistantProfile,
  onResend,
  onResendWithProfile,
}: ChatMessagesListProps) {
  return (
    <div className="chat-view-messages">
      {loading && messages.length === 0 ? (
        <div className="chat-view-placeholder">Loading conversation…</div>
      ) : (
        <>
          {messages.map((m, index) => {
            const assistantText = m.role === 'assistant' ? resolveAssistantBubbleText(m) : null
            if (m.role === 'assistant' && assistantText == null) return null
            return (
              <ChatMessageItem
                key={m.messageId}
                message={m}
                index={index}
                messages={messages}
                profileByRunId={profileByRunId}
                runAgainProfiles={runAgainProfiles}
                chatProfiles={chatProfiles}
                assistantText={assistantText}
                sending={sending}
                onResend={onResend}
                onResendWithProfile={onResendWithProfile}
              />
            )
          })}
          {showInlineAssistant && inlineAssistantText && (
            <ChatInlineAssistant
              text={inlineAssistantText}
              profileLabel={inlineAssistantProfile?.label}
            />
          )}
          <div ref={messagesEndRef} />
        </>
      )}
    </div>
  )
}
