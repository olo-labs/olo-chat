/**
 * Copyright (c) 2026 Olo Labs
 * SPDX-License-Identifier: Apache-2.0
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { getConfiguredCapabilitySources } from '../api/documentsUploadApi'
import {
  listKnowledgeSources,
  listUploadedDocuments,
  startRagIngest,
  type UploadedDocumentDto,
} from '../api/ragIngestApi'
import { knowledgeIngestStore } from '../store/knowledgeIngestStore'
import { KnowledgeIngestRunTracker } from './KnowledgeIngestRunTracker'

export function KnowledgeCreateView() {
  const envSources = useMemo(() => getConfiguredCapabilitySources(), [])
  const [apiSources, setApiSources] = useState<string[]>([])
  const [selectedSource, setSelectedSource] = useState('')
  const [customSource, setCustomSource] = useState('')
  const [documents, setDocuments] = useState<UploadedDocumentDto[]>([])
  const [selectedFiles, setSelectedFiles] = useState<Set<string>>(new Set())
  const [loadingDocs, setLoadingDocs] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const ingestRuns = knowledgeIngestStore((s) => s.runs)
  const addRun = knowledgeIngestStore((s) => s.addRun)
  const updateRun = knowledgeIngestStore((s) => s.updateRun)

  const mergedSources = useMemo(() => {
    const fromRuns = ingestRuns.map((r) => r.capabilitySource)
    return [...new Set([...envSources, ...apiSources, ...fromRuns])].sort((a, b) =>
      a.localeCompare(b)
    )
  }, [envSources, apiSources, ingestRuns])

  const effectiveSource = (customSource.trim() || selectedSource).trim()

  const refreshSources = useCallback(async () => {
    const sources = await listKnowledgeSources()
    setApiSources(sources.map((s) => s.capabilitySource).filter(Boolean))
  }, [])

  useEffect(() => {
    void refreshSources()
  }, [refreshSources])

  useEffect(() => {
    if (!selectedSource && mergedSources.length > 0) {
      setSelectedSource(mergedSources[0])
    }
  }, [mergedSources, selectedSource])

  useEffect(() => {
    const src = effectiveSource
    if (!src) {
      setDocuments([])
      setSelectedFiles(new Set())
      return
    }
    let cancelled = false
    setLoadingDocs(true)
    void listUploadedDocuments(src).then((files) => {
      if (cancelled) return
      setDocuments(files)
      setSelectedFiles(new Set(files.map((f) => f.fileName)))
      setLoadingDocs(false)
    })
    return () => {
      cancelled = true
    }
  }, [effectiveSource])

  const toggleFile = (fileName: string) => {
    setSelectedFiles((prev) => {
      const next = new Set(prev)
      if (next.has(fileName)) next.delete(fileName)
      else next.add(fileName)
      return next
    })
  }

  const handleStartIngest = async () => {
    setError(null)
    const src = effectiveSource
    if (!src) {
      setError('Select or enter a capability source.')
      return
    }
    const fileNames = [...selectedFiles]
    if (fileNames.length === 0) {
      setError('Select at least one uploaded file to index.')
      return
    }

    const rowId = crypto.randomUUID()
    addRun({
      id: rowId,
      capabilitySource: src,
      fileNames,
      status: 'pending',
      createdAt: Date.now(),
    })

    setSubmitting(true)
    try {
      const result = await startRagIngest({ capabilitySource: src, fileNames })
      if (!result.success) {
        updateRun(rowId, { status: 'failed', message: result.message ?? 'Ingest failed' })
        setError(result.message ?? 'Ingest failed')
        return
      }
      updateRun(rowId, {
        runId: result.runId,
        status: 'processing',
        message: 'Indexing started…',
      })
      void refreshSources()
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="knowledge-view knowledge-view-create">
      <p className="knowledge-view-description">
        Select uploaded documents for a capability source, then start a{' '}
        <strong>documents-index</strong> workflow run. The RAG ingest plugin chunks files and writes
        vector entries using the vector store configured on the workflow node in olo-ui.
      </p>

      <div className="knowledge-form">
        <label className="knowledge-field">
          <span className="knowledge-field-label">Capability source</span>
          <select
            className="knowledge-field-input"
            value={selectedSource}
            onChange={(e) => {
              setSelectedSource(e.target.value)
              setCustomSource('')
            }}
          >
            <option value="">Select…</option>
            {mergedSources.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>

        <label className="knowledge-field">
          <span className="knowledge-field-label">Or enter new source id</span>
          <input
            className="knowledge-field-input"
            type="text"
            placeholder="e.g. finance-rag"
            value={customSource}
            onChange={(e) => setCustomSource(e.target.value)}
          />
        </label>

        <div className="knowledge-files-panel">
          <div className="knowledge-files-header">
            <span className="knowledge-field-label">Uploaded files</span>
            {effectiveSource ? (
              <button
                type="button"
                className="knowledge-link-btn"
                onClick={() => {
                  setSelectedFiles(new Set(documents.map((d) => d.fileName)))
                }}
              >
                Select all
              </button>
            ) : null}
          </div>

          {!effectiveSource && (
            <p className="knowledge-empty">Choose a capability source to list uploaded files.</p>
          )}
          {effectiveSource && loadingDocs && <p className="knowledge-empty">Loading files…</p>}
          {effectiveSource && !loadingDocs && documents.length === 0 && (
            <p className="knowledge-empty">
              No files found for <strong>{effectiveSource}</strong>. Upload documents first under{' '}
              <strong>Documents → Upload</strong>.
            </p>
          )}
          {effectiveSource && !loadingDocs && documents.length > 0 && (
            <ul className="knowledge-file-list">
              {documents.map((doc) => (
                <li key={doc.fileName}>
                  <label className="knowledge-file-item">
                    <input
                      type="checkbox"
                      checked={selectedFiles.has(doc.fileName)}
                      onChange={() => toggleFile(doc.fileName)}
                    />
                    <span className="knowledge-file-name">{doc.fileName}</span>
                    {typeof doc.sizeBytes === 'number' ? (
                      <span className="knowledge-file-meta">
                        {(doc.sizeBytes / 1024).toFixed(1)} KB
                      </span>
                    ) : null}
                  </label>
                </li>
              ))}
            </ul>
          )}
        </div>

        {error ? <p className="knowledge-error">{error}</p> : null}

        <button
          type="button"
          className="knowledge-primary-btn"
          disabled={submitting || !effectiveSource || selectedFiles.size === 0}
          onClick={() => void handleStartIngest()}
        >
          {submitting ? 'Starting…' : 'Create RAG index run'}
        </button>
      </div>

      {ingestRuns.length > 0 && (
        <div className="knowledge-runs">
          <h3 className="knowledge-runs-title">Recent ingest runs</h3>
          <ul className="knowledge-runs-list">
            {ingestRuns.map((run) => (
              <li key={run.id} className={`knowledge-run-row knowledge-run-${run.status}`}>
                <span className="knowledge-run-source">{run.capabilitySource}</span>
                <span className="knowledge-run-files">{run.fileNames.length} file(s)</span>
                <span className="knowledge-run-status">{run.status}</span>
                {run.message ? <span className="knowledge-run-message">{run.message}</span> : null}
                {run.runId ? (
                  <span className="knowledge-run-id" title={run.runId}>
                    run: {run.runId.slice(0, 8)}…
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      )}

      {ingestRuns
        .filter((r) => r.runId && (r.status === 'processing' || r.status === 'pending'))
        .map((r) => (
          <KnowledgeIngestRunTracker key={r.id} run={r} />
        ))}
    </div>
  )
}
