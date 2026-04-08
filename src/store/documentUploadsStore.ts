/**
 * Copyright (c) 2026 Olo Labs
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Client-side registry of document upload jobs (file name, capability source id, status).
 * **Persistence of file bytes is entirely on the backend** (local shared folder today; S3/Blob/GCS etc. as the BE evolves).
 * This store only mirrors status for the UI; it does not implement storage.
 * `source` is the **capability source** id; indexing/RAG run later in capabilities—not at upload time.
 * Persisted for the UI until a catalog API exists (e.g. GET /api/documents).
 */

import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { RunEventDto } from '../api/chatApi'

const STORAGE_KEY = 'olo:document-uploads'
const MAX_ROWS = 500

export type DocumentUploadRowStatus = 'uploading' | 'processing' | 'ready' | 'failed'

export interface DocumentUploadRow {
  id: string
  fileName: string
  /** Capability source id (matches multipart field `capabilitySource` on POST /api/resource/upload). */
  source: string
  status: DocumentUploadRowStatus
  chunks?: number
  runId?: string
  errorMessage?: string
  createdAt: number
}

function extractChunks(ev: RunEventDto): number | undefined {
  const o = ev.output as Record<string, unknown> | undefined
  const m = ev.metadata as Record<string, unknown> | undefined
  if (!o && !m) return undefined
  for (const key of ['chunks', 'chunkCount', 'totalChunks', 'numChunks']) {
    const v = (o?.[key] ?? m?.[key]) as unknown
    if (typeof v === 'number' && Number.isFinite(v)) return v
  }
  return undefined
}

export interface DocumentUploadsState {
  rows: DocumentUploadRow[]
  customSources: string[]
  addRows: (rows: DocumentUploadRow[]) => void
  updateRow: (id: string, patch: Partial<DocumentUploadRow>) => void
  removeRow: (id: string) => void
  addCustomSource: (name: string) => void
  patchRowFromEvent: (id: string, ev: RunEventDto) => void
}

function trimRows(rows: DocumentUploadRow[]): DocumentUploadRow[] {
  if (rows.length <= MAX_ROWS) return rows
  const sorted = [...rows].sort((a, b) => b.createdAt - a.createdAt)
  return sorted.slice(0, MAX_ROWS)
}

export const documentUploadsStore = create<DocumentUploadsState>()(
  persist(
    (set) => ({
      rows: [],
      customSources: [],

      addRows: (newRows) =>
        set((s) => ({
          rows: trimRows([...newRows, ...s.rows]),
        })),

      updateRow: (id, patch) =>
        set((s) => ({
          rows: s.rows.map((r) => (r.id === id ? { ...r, ...patch } : r)),
        })),

      removeRow: (id) =>
        set((s) => ({
          rows: s.rows.filter((r) => r.id !== id),
        })),

      addCustomSource: (name) => {
        const n = name.trim()
        if (!n) return
        set((s) => {
          if (s.customSources.includes(n)) return s
          return { customSources: [...s.customSources, n].sort((a, b) => a.localeCompare(b)) }
        })
      },

      patchRowFromEvent: (id, ev) => {
        const nt = (ev.nodeType ?? '').toUpperCase()
        const st = (ev.status ?? '').toUpperCase()
        const chunks = extractChunks(ev)
        set((s) => ({
          rows: s.rows.map((r) => {
            if (r.id !== id) return r
            const next: DocumentUploadRow = { ...r }
            if (chunks != null) next.chunks = chunks
            if (st === 'FAILED') {
              next.status = 'failed'
              const msg =
                typeof (ev.output as Record<string, unknown> | undefined)?.error === 'string'
                  ? ((ev.output as Record<string, unknown>).error as string)
                  : typeof (ev.metadata as Record<string, unknown> | undefined)?.error === 'string'
                    ? ((ev.metadata as Record<string, unknown>).error as string)
                    : 'Workflow failed'
              next.errorMessage = msg
            } else if (st === 'COMPLETED' && (nt === 'SYSTEM' || nt === 'MODEL')) {
              next.status = 'ready'
            }
            return next
          }),
        }))
      },
    }),
    { name: STORAGE_KEY }
  )
)
