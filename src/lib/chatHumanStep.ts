/**
 * Copyright (c) 2026 Olo Labs
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ChatMessageDto, RunEventDto } from '../api/chatApi'

function stringValue(v: unknown): string | null {
  return typeof v === 'string' && v.trim().length > 0 ? v.trim() : null
}

/** Older human-step assistant lines may contain a lone `<Options>` line and extra newlines; strip for display. */
export function normalizeHumanStepHistoryContent(raw: string | null | undefined): string | null | undefined {
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
export function isHumanStepReplyMessage(messages: ChatMessageDto[], index: number): boolean {
  if (index <= 0) return false
  const prev = messages[index - 1]
  if (prev.role !== 'assistant') return false
  const head = (prev.content ?? '').trimStart()
  return head.startsWith('User Input Step:')
}

/** Prompt text for a HUMAN WAITING event (worker may use `prompt` or `message` on input/metadata). */
export function humanStepPromptFromEvent(ev: RunEventDto | null | undefined): string {
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
export type HumanStepOption = {
  label: string
  approved?: boolean
  message?: string
}

/** Parses worker options: array of strings or objects with label/text, optional approved & message. */
export function humanStepOptionsFromEvent(ev: RunEventDto | null | undefined): HumanStepOption[] {
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

export function findPendingHumanEvent(runEvents: RunEventDto[]): RunEventDto | null {
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
  return latestHumanWaiting && !hasHumanCompletedAfterWait ? latestHumanWaiting : null
}
