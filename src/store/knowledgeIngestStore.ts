/**
 * Copyright (c) 2026 Olo Labs
 * SPDX-License-Identifier: Apache-2.0
 */

import { create } from 'zustand'
import type { RunEventDto } from '../api/chatApi'

export type KnowledgeIngestStatus = 'pending' | 'processing' | 'indexed' | 'failed'

export interface KnowledgeIngestRun {
  id: string
  capabilitySource: string
  fileNames: string[]
  runId?: string
  status: KnowledgeIngestStatus
  message?: string
  chunksIndexed?: number
  createdAt: number
}

interface KnowledgeIngestState {
  runs: KnowledgeIngestRun[]
  addRun: (run: KnowledgeIngestRun) => void
  updateRun: (id: string, patch: Partial<KnowledgeIngestRun>) => void
  patchRunFromEvent: (id: string, event: RunEventDto) => void
}

function eventText(event: RunEventDto): string {
  const payload = event.payload as Record<string, unknown> | undefined
  if (payload && typeof payload.message === 'string') return payload.message
  if (payload && typeof payload.text === 'string') return payload.text
  return event.eventType ?? ''
}

export const knowledgeIngestStore = create<KnowledgeIngestState>((set) => ({
  runs: [],

  addRun: (run) =>
    set((s) => ({
      runs: [run, ...s.runs].slice(0, 50),
    })),

  updateRun: (id, patch) =>
    set((s) => ({
      runs: s.runs.map((r) => (r.id === id ? { ...r, ...patch } : r)),
    })),

  patchRunFromEvent: (id, event) =>
    set((s) => ({
      runs: s.runs.map((r) => {
        if (r.id !== id) return r
        const type = (event.eventType ?? '').toUpperCase()
        const text = eventText(event)
        const payload = event.payload as Record<string, unknown> | undefined

        if (type.includes('FAILED') || type.includes('ERROR')) {
          return { ...r, status: 'failed', message: text || r.message }
        }
        if (type.includes('COMPLETED') || type.includes('FINISHED') || type.includes('SUCCESS')) {
          const chunks =
            typeof payload?.chunksIndexed === 'number'
              ? payload.chunksIndexed
              : r.chunksIndexed
          return {
            ...r,
            status: 'indexed',
            message: text || 'Indexing complete',
            chunksIndexed: chunks,
          }
        }
        if (type.includes('STARTED') || type.includes('PROGRESS')) {
          return { ...r, status: 'processing', message: text || r.message }
        }
        return r
      }),
    })),
}))
