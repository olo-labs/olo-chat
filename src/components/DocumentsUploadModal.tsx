/**
 * Copyright (c) 2026 Olo Labs
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useCallback, useRef, useEffect } from 'react'
import { getFilesFromDataTransfer } from '../lib/fileDrop'

export interface DocumentsUploadModalProps {
  open: boolean
  onClose: () => void
  envOptions: string[]
  customSources: string[]
  onAddCustomSource: (name: string) => void
  defaultSource: string
  onStartUpload: (files: File[], source: string) => Promise<void>
}

export function DocumentsUploadModal({
  open,
  onClose,
  envOptions,
  customSources,
  onAddCustomSource,
  defaultSource,
  onStartUpload,
}: DocumentsUploadModalProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [selectedSource, setSelectedSource] = useState('')
  const [newSourceOpen, setNewSourceOpen] = useState(false)
  const [newSourceName, setNewSourceName] = useState('')
  const [files, setFiles] = useState<File[]>([])
  const [dragOver, setDragOver] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (open) {
      setSelectedSource(defaultSource || customSources[0] || envOptions[0] || '')
      setFiles([])
      setNewSourceOpen(false)
      setNewSourceName('')
    }
  }, [open, defaultSource, customSources, envOptions])

  const allSources = [...new Set([...envOptions, ...customSources])].sort((a, b) => a.localeCompare(b))

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    try {
      const list = await getFilesFromDataTransfer(e.dataTransfer)
      if (list.length > 0) setFiles(list)
    } catch {
      /* ignore */
    }
  }, [])

  const effectiveSource = newSourceOpen ? newSourceName.trim() : selectedSource
  const canSubmit = !!effectiveSource && files.length > 0 && !busy

  const handleSubmit = async () => {
    if (!canSubmit) return
    const src = newSourceOpen ? newSourceName.trim() : selectedSource
    if (newSourceOpen && newSourceName.trim()) onAddCustomSource(newSourceName.trim())
    setBusy(true)
    try {
      await onStartUpload(files, src)
      setFiles([])
      onClose()
    } finally {
      setBusy(false)
    }
  }

  if (!open) return null

  return (
    <div className="documents-modal-overlay" role="presentation" onClick={() => !busy && onClose()}>
      <div
        className="documents-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="documents-upload-modal-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="documents-modal-header">
          <h2 id="documents-upload-modal-title" className="documents-modal-title">
            Upload Files
          </h2>
          <button type="button" className="documents-modal-close" onClick={() => !busy && onClose()} aria-label="Close">
            ×
          </button>
        </div>
        <div className="documents-modal-body">
          <div className="documents-modal-field">
            <label htmlFor="documents-upload-modal-source" className="documents-modal-label">
              Capability source
            </label>
            <div className="documents-modal-source-row">
              <select
                id="documents-upload-modal-source"
                className="documents-upload-select documents-modal-select"
                value={newSourceOpen ? '__new__' : selectedSource}
                onChange={(e) => {
                  const v = e.target.value
                  if (v === '__new__') {
                    setNewSourceOpen(true)
                  } else {
                    setNewSourceOpen(false)
                    setSelectedSource(v)
                  }
                }}
                disabled={busy}
              >
                {allSources.length === 0 && <option value="">— Add a source below —</option>}
                {allSources.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
                <option value="__new__">+ New</option>
              </select>
            </div>
            {newSourceOpen && (
              <div className="documents-modal-new-source">
                <label htmlFor="documents-upload-modal-new-name" className="documents-modal-label">
                  New capability source
                </label>
                <div className="documents-modal-new-source-row">
                  <input
                    id="documents-upload-modal-new-name"
                    type="text"
                    className="documents-upload-input"
                    value={newSourceName}
                    onChange={(e) => setNewSourceName(e.target.value)}
                    placeholder="e.g. product-docs"
                    autoComplete="off"
                    disabled={busy}
                  />
                  <button
                    type="button"
                    className="documents-modal-create-btn"
                    disabled={!newSourceName.trim() || busy}
                    onClick={() => {
                      const n = newSourceName.trim()
                      if (!n) return
                      onAddCustomSource(n)
                      setSelectedSource(n)
                      setNewSourceOpen(false)
                    }}
                  >
                    Create
                  </button>
                </div>
              </div>
            )}
          </div>

          <div
            className={`documents-upload-dropzone documents-modal-dropzone ${dragOver ? 'drag-over' : ''} ${files.length > 0 ? 'has-file' : ''}`}
            onDrop={handleDrop}
            onDragOver={(e) => {
              e.preventDefault()
              setDragOver(true)
            }}
            onDragLeave={(e) => {
              e.preventDefault()
              setDragOver(false)
            }}
          >
            <input
              ref={fileInputRef}
              type="file"
              className="documents-upload-file-input-hidden"
              multiple
              onChange={(e) => {
                const list = e.target.files
                if (list) setFiles(Array.from(list))
                e.target.value = ''
              }}
              accept=".pdf,.txt,.md,.doc,.docx"
              aria-label="Select files"
            />
            {files.length === 0 ? (
              <div className="documents-upload-dropzone-label-wrap">
                <span className="documents-upload-dropzone-label">Drag &amp; drop files here</span>
                <div className="documents-upload-dropzone-buttons">
                  <button
                    type="button"
                    className="documents-upload-browse-btn"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    Browse Files
                  </button>
                </div>
              </div>
            ) : (
              <div className="documents-upload-file-list">
                <div className="documents-upload-file-list-header">
                  <span>{files.length} file(s) selected</span>
                  <button
                    type="button"
                    className="documents-upload-clear-files"
                    onClick={() => setFiles([])}
                    disabled={busy}
                  >
                    Clear all
                  </button>
                </div>
                <ul className="documents-upload-file-ul">
                  {files.slice(0, 30).map((file, i) => (
                    <li key={`${file.name}-${i}`} className="documents-upload-file-li">
                      <span className="documents-upload-file-name">{file.name}</span>
                      <span className="documents-upload-file-size">{(file.size / 1024).toFixed(1)} KB</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
        <div className="documents-modal-footer">
          <button type="button" className="documents-modal-btn-secondary" onClick={() => onClose()} disabled={busy}>
            Cancel
          </button>
          <button type="button" className="documents-modal-btn-primary" onClick={handleSubmit} disabled={!canSubmit}>
            {busy ? 'Uploading…' : 'Upload'}
          </button>
        </div>
      </div>
    </div>
  )
}
