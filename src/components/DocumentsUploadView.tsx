/**
 * Copyright (c) 2026 Olo Labs
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useCallback, useMemo } from 'react'
import {
  uploadCapabilitySourceFiles,
  reprocessCapabilitySourceDocument,
  getConfiguredCapabilitySources,
} from '../api/documentsUploadApi'
import { documentUploadsStore, type DocumentUploadRow } from '../store/documentUploadsStore'
import { DocumentsUploadModal } from './DocumentsUploadModal'
import { DocumentUploadRunTracker } from './DocumentUploadRunTracker'

function fileIcon(name: string): string {
  const lower = name.toLowerCase()
  if (lower.endsWith('.pdf')) return '📕'
  if (lower.endsWith('.md')) return '📝'
  if (lower.endsWith('.txt')) return '📃'
  return '📄'
}

function statusDisplay(status: DocumentUploadRow['status']): { label: string; icon: string } {
  switch (status) {
    case 'uploading':
      return { label: 'Uploading', icon: '⏳' }
    case 'processing':
      return { label: 'Processing', icon: '⚙️' }
    case 'ready':
      return { label: 'Ready', icon: '✅' }
    case 'failed':
      return { label: 'Failed', icon: '❌' }
    default:
      return { label: status, icon: '•' }
  }
}

export function DocumentsUploadView() {
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

  const defaultModalSource =
    sourceFilter !== 'all' ? sourceFilter : mergedSources[0] || ''

  const scheduleFallbackReady = useCallback((id: string) => {
    window.setTimeout(() => {
      const r = documentUploadsStore.getState().rows.find((x) => x.id === id)
      if (r && r.status === 'processing' && !r.runId) {
        updateRow(id, { status: 'ready' })
      }
    }, 7000)
  }, [updateRow])

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

          updateRow(row.id, {
            status: 'processing',
            runId,
          })

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
      const res = await reprocessCapabilitySourceDocument({ capabilitySource: row.source, fileName: row.fileName })
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

  const hasAnyFiles = rows.length > 0
  const emptyForFilter = hasAnyFiles && filteredRows.length === 0

  return (
    <div className="documents-page-root">
      {rows
        .filter((r) => r.runId && r.status === 'processing')
        .map((r) => (
          <DocumentUploadRunTracker key={r.id} row={r} />
        ))}

      <div className="documents-page-toolbar">
        <button type="button" className="documents-page-btn-primary" onClick={() => setModalOpen(true)}>
          + Upload Files
        </button>

        <label className="documents-page-toolbar-field">
          <span className="documents-page-toolbar-label">Capability source:</span>
          <select
            className="documents-upload-select documents-page-filter-select"
            value={sourceFilter}
            onChange={(e) => setSourceFilter(e.target.value)}
            aria-label="Filter by capability source"
          >
            <option value="all">All Sources</option>
            {mergedSources.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>

        <div className="documents-page-search-wrap">
          <span className="documents-page-search-icon" aria-hidden>
            🔍
          </span>
          <input
            type="search"
            className="documents-page-search-input"
            placeholder="Search files…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            aria-label="Search files"
          />
        </div>
      </div>

      {!hasAnyFiles && (
        <div className="documents-page-empty">
          <p className="documents-page-empty-title">No documents uploaded yet</p>
          <button type="button" className="documents-page-btn-primary" onClick={() => setModalOpen(true)}>
            + Upload Files
          </button>
        </div>
      )}

      {emptyForFilter && (
        <div className="documents-page-empty documents-page-empty-soft">
          <p className="documents-page-empty-title">
            No files in {sourceFilter === 'all' ? 'this view' : `"${sourceFilter}"`}
          </p>
          <button type="button" className="documents-page-btn-primary" onClick={() => setModalOpen(true)}>
            Upload Files
          </button>
        </div>
      )}

      {hasAnyFiles && !emptyForFilter && (
        <div className="documents-page-table-wrap">
          <table className="documents-page-table">
            <thead>
              <tr>
                <th scope="col">File Name</th>
                <th scope="col">Source</th>
                <th scope="col">Status</th>
                <th scope="col">Chunks</th>
                <th scope="col">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredRows.map((row) => {
                const st = statusDisplay(row.status)
                return (
                  <tr key={row.id}>
                    <td>
                      <span className="documents-page-file-cell">
                        <span className="documents-page-file-icon" aria-hidden>
                          {fileIcon(row.fileName)}
                        </span>
                        <span className="documents-page-file-name" title={row.errorMessage}>
                          {row.fileName}
                        </span>
                      </span>
                    </td>
                    <td>{row.source}</td>
                    <td>
                      <span className="documents-page-status">
                        <span aria-hidden>{st.icon}</span> {st.label}
                      </span>
                    </td>
                    <td>{row.chunks != null ? row.chunks : '—'}</td>
                    <td>
                      <div className="documents-page-actions">
                        <button
                          type="button"
                          className="documents-page-action-btn"
                          title="Delete"
                          aria-label={`Delete ${row.fileName}`}
                          onClick={() => setDeleteTarget(row)}
                        >
                          ❌
                        </button>
                        <button
                          type="button"
                          className="documents-page-action-btn"
                          title="Reprocess"
                          aria-label={`Reprocess ${row.fileName}`}
                          disabled={reprocessId === row.id || row.status === 'uploading'}
                          onClick={() => handleReprocess(row)}
                        >
                          🔁
                        </button>
                        <button type="button" className="documents-page-action-btn" disabled title="View (coming soon)">
                          👁
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      <p className="documents-page-hint">
        <strong>Upload is handled by the backend</strong> (this UI only sends files over <code>POST /api/resource/upload</code>).
        Storage is a <strong>server concern</strong>: often a <strong>local shared folder</strong> today; the same API
        can be backed by <strong>S3, Azure Blob, or similar</strong> as the service is configured. Files are keyed by{' '}
        <strong>capability source</strong>. Indexing/RAG run later when a <strong>capability</strong> uses that
        source—not during upload. Status may follow a <code>runId</code> (e.g. workflow) like Chat events. This table
        is stored locally until a catalog API exists.
      </p>

      <DocumentsUploadModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        envOptions={envOptions}
        customSources={customSources}
        onAddCustomSource={addCustomSource}
        defaultSource={defaultModalSource}
        onStartUpload={onStartUpload}
      />

      {deleteTarget && (
        <div className="documents-modal-overlay" role="presentation" onClick={() => setDeleteTarget(null)}>
          <div
            className="documents-modal documents-modal--small"
            role="dialog"
            aria-modal="true"
            aria-labelledby="documents-delete-title"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="documents-delete-title" className="documents-modal-title">
              Delete document?
            </h2>
            <p className="documents-modal-text">
              Remove <strong>{deleteTarget.fileName}</strong> from this list? This does not call the server unless a
              delete API is configured.
            </p>
            <div className="documents-modal-footer">
              <button type="button" className="documents-modal-btn-secondary" onClick={() => setDeleteTarget(null)}>
                Cancel
              </button>
              <button
                type="button"
                className="documents-modal-btn-danger"
                onClick={() => {
                  removeRow(deleteTarget.id)
                  setDeleteTarget(null)
                }}
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
