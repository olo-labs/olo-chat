/**
 * Copyright (c) 2026 Olo Labs
 * SPDX-License-Identifier: Apache-2.0
 */

import { useCallback, useState } from 'react'
import { listMessages, submitHumanInput } from '../api/chatApi'
import type { RunEventDto } from '../api/chatApi'
import {
  findPendingHumanEvent,
  humanStepOptionsFromEvent,
  humanStepPromptFromEvent,
} from '../lib/chatHumanStep'

function stringValue(v: unknown): string | null {
  return typeof v === 'string' && v.trim().length > 0 ? v.trim() : null
}

export function useChatHumanInput(
  runEvents: RunEventDto[],
  sessionId: string | null,
  setMessages: React.Dispatch<React.SetStateAction<import('../api/chatApi').ChatMessageDto[]>>,
  setError: React.Dispatch<React.SetStateAction<string | null>>
) {
  const [humanInputText, setHumanInputText] = useState('')
  const [submittingHumanInput, setSubmittingHumanInput] = useState(false)

  const pendingHumanEvent = findPendingHumanEvent(runEvents)
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
    [pendingHumanEvent, sessionId, setMessages, setError]
  )

  return {
    pendingHumanEvent,
    humanPromptMessage,
    humanStepOptions,
    humanTaskId,
    humanInputType,
    humanInputText,
    setHumanInputText,
    submittingHumanInput,
    handleSubmitHumanInput,
  }
}
