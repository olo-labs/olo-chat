/**
 * Copyright (c) 2026 Olo Labs
 * SPDX-License-Identifier: Apache-2.0
 */

import { useCallback, useMemo, useState } from 'react'
import {
  uploadCapabilitySourceFiles,
  reprocessCapabilitySourceDocument,
  getConfiguredCapabilitySources,
} from '../api/documentsUploadApi'
import { documentUploadsStore, type DocumentUploadRow } from '../store/documentUploadsStore'

export function useDocumentsUpload() {
  const rows = documentUploadsStore((s) => s.rows)
  const customSources = documentUploadsStore((s) => s.customSources)
  const addRows = documentUploadsStore((s) => s.addRows)
  const updateRow = documentUploadsStore((s) => s.updateRow)
  const removeRow = documentUploadsStore((s) => s.removeRow)
  const addCustomSource = documentUploadsStore((s) => s.addCustomSource)

  const envOptions = useMemo(() => getConfiguredCapabilitySources(), [])

  const [sourceFilter, setSourceFilter] = useState<string>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<DocumentUploadRow | null>(null)
  const [reprocessId, setReprocessId] = useState<string | null>(null)

  const mergedSources = useMemo(() => {
    const fromRows = [...new Set(rows.map((r) => r.source))]
    return [...new Set([...envOptions, ...customSources, ...fromRows])].sort((a, b) => a.localeCompare(b))
  }, [envOptions, customSources, rows])

  const filteredRows = useMemo(() => {
    let list = [...rows]
    if (sourceFilter !== 'all') list = list.filter((r) => r.source === sourceFilter)
    const q = searchQuery.trim().toLowerCase()
    if (q) list = list.filter((r) => r.fileName.toLowerCase().includes(q))
    return list.sort((a, b) => b.createdAt - a.createdAt)
  }, [rows, sourceFilter, searchQuery])

  const defaultModalSource = sourceFilter !== 'all' ? sourceFilter : mergedSources[0] || ''

  const scheduleFallbackReady = useCallback(
    (id: string) => {
      window.setTimeout(() => {
        const r = documentUploadsStore.getState().rows.find((x) => x.id === id)
        if (r && r.status === 'processing' && !r.runId) {
          updateRow(id, { status: 'ready' })
        }
      }, 7000)
    },
    [updateRow]
  )

  const onStartUpload = useCallback(
    async (files: File[], source: string) => {
      const capabilitySource = source.trim()
      if (!capabilitySource || files.length === 0) return

      const newRows: DocumentUploadRow[] = files.map((f) => ({
        id: crypto.randomUUID(),
        fileName: f.name,
        source: capabilitySource,
        status: 'uploading',
        createdAt: Date.now(),
      }))
      addRows(newRows)

      for (let i = 0; i < files.length; i++) {
        const file = files[i]
        const row = newRows[i]
        try {
          const result = await uploadCapabilitySourceFiles({ capabilitySource, files: [file] })
          if (!result.success) {
            updateRow(row.id, {
              status: 'failed',
              errorMessage: result.message ?? 'Upload failed',
            })
            continue
          }

          const per = result.files?.find((x) => x.fileName === file.name)
          const runId = per?.runId ?? result.runId ?? result.runIds?.[i] ?? result.runIds?.[0]

          updateRow(row.id, { status: 'processing', runId })

          if (!runId) {
            scheduleFallbackReady(row.id)
          }
        } catch (err) {
          updateRow(row.id, {
            status: 'failed',
            errorMessage: err instanceof Error ? err.message : 'Upload failed',
          })
        }
      }
    },
    [addRows, updateRow, scheduleFallbackReady]
  )

  const handleReprocess = useCallback(
    async (row: DocumentUploadRow) => {
      setReprocessId(row.id)
      updateRow(row.id, { status: 'processing', errorMessage: undefined })
      const res = await reprocessCapabilitySourceDocument({
        capabilitySource: row.source,
        fileName: row.fileName,
      })
      if (res.success && res.runId) {
        updateRow(row.id, { runId: res.runId })
      } else if (res.success) {
        scheduleFallbackReady(row.id)
      } else {
        updateRow(row.id, { status: 'processing', runId: undefined })
        scheduleFallbackReady(row.id)
      }
      setReprocessId(null)
    },
    [updateRow, scheduleFallbackReady]
  )

  return {
    rows,
    customSources,
    envOptions,
    sourceFilter,
    setSourceFilter,
    searchQuery,
    setSearchQuery,
    modalOpen,
    setModalOpen,
    deleteTarget,
    setDeleteTarget,
    reprocessId,
    mergedSources,
    filteredRows,
    defaultModalSource,
    addCustomSource,
    removeRow,
    onStartUpload,
    handleReprocess,
  }
}
