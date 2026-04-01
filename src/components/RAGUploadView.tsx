/**
 * Copyright (c) 2026 Olo Labs
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useCallback, useMemo, useRef } from 'react'
import { uploadForRAG, getExistingRAGOptions } from '../api/ragApi'
import { getFilesFromDataTransfer } from '../lib/fileDrop'

export function RAGUploadView() {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const folderInputRef = useRef<HTMLInputElement>(null)
  const existingOptions = useMemo(() => getExistingRAGOptions(), [])
  const [selectedRag, setSelectedRag] = useState('')
  const [customRagInput, setCustomRagInput] = useState('')
  const [files, setFiles] = useState<File[]>([])
  const [dragOver, setDragOver] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [uploadResult, setUploadResult] = useState<{ success: boolean; message: string } | null>(null)

  const effectiveRag = (customRagInput.trim() || selectedRag || '').trim() || null
  const canUpload = !!effectiveRag && files.length > 0 && !uploading

  const handleFileInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const list = e.target.files
    if (!list) return
    setFiles(Array.from(list))
    setUploadResult(null)
    e.target.value = ''
  }, [])

  const handleFolderInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const list = e.target.files
    if (!list) return
    setFiles(Array.from(list))
    setUploadResult(null)
    e.target.value = ''
  }, [])

  const handleDrop = useCallback(
    async (e: React.DragEvent) => {
      e.preventDefault()
      setDragOver(false)
      try {
        const list = await getFilesFromDataTransfer(e.dataTransfer)
        if (list.length > 0) setFiles(list)
        setUploadResult(null)
      } catch {
        setUploadResult({ success: false, message: 'Could not read dropped files.' })
      }
    },
    []
  )

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setDragOver(true)
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setDragOver(false)
  }, [])

  const removeFile = useCallback((index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index))
    setUploadResult(null)
  }, [])

  const clearFiles = useCallback(() => {
    setFiles([])
    setUploadResult(null)
  }, [])

  const handleUpload = useCallback(async () => {
    if (!effectiveRag || files.length === 0) return
    setUploading(true)
    setUploadResult(null)
    try {
      const result = await uploadForRAG({ ragId: effectiveRag, files })
      if (result.success) {
        setUploadResult({
          success: true,
          message: `${files.length} file(s) submitted for RAG. Workflow started.`,
        })
        setFiles([])
      } else {
        setUploadResult({ success: false, message: result.message || 'Upload failed.' })
      }
    } catch (err) {
      setUploadResult({
        success: false,
        message: err instanceof Error ? err.message : 'Upload failed.',
      })
    } finally {
      setUploading(false)
    }
  }, [effectiveRag, files])

  return (
    <div className="rag-upload-view">
      <div className="rag-upload-section">
        <h2 className="rag-upload-heading">RAG</h2>
        <p className="rag-upload-description">
          Select an existing RAG from the list, or enter a name below to use a different RAG for this upload.
        </p>
        {existingOptions.length > 0 && (
          <div className="rag-upload-token-input-wrap">
            <label htmlFor="rag-dropdown" className="rag-upload-label">
              Existing RAG
            </label>
            <select
              id="rag-dropdown"
              className="rag-upload-select"
              value={selectedRag}
              onChange={(e) => setSelectedRag(e.target.value)}
              aria-label="Select existing RAG"
            >
              <option value="">— Select —</option>
              {existingOptions.map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
          </div>
        )}
        <div className="rag-upload-token-input-wrap">
          <label htmlFor="rag-custom-input" className="rag-upload-label">
            {existingOptions.length > 0 ? 'Or use a different RAG for this upload' : 'RAG name for this upload'}
          </label>
          <input
            id="rag-custom-input"
            type="text"
            className="rag-upload-input"
            value={customRagInput}
            onChange={(e) => setCustomRagInput(e.target.value)}
            placeholder={existingOptions.length > 0 ? 'Type to use another RAG' : 'Enter RAG name'}
            autoComplete="off"
            aria-label="RAG name for this upload"
          />
        </div>
      </div>

      <div className="rag-upload-section">
        <h2 className="rag-upload-heading">Files or folder</h2>
        <p className="rag-upload-description">
          Drag and drop files or a folder here, or use the buttons below to select files or a folder.
        </p>
        <div
          className={`rag-upload-dropzone ${dragOver ? 'drag-over' : ''} ${files.length > 0 ? 'has-file' : ''}`}
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
        >
          <input
            ref={fileInputRef}
            type="file"
            id="rag-upload-files"
            className="rag-upload-file-input-hidden"
            multiple
            onChange={handleFileInputChange}
            accept=".pdf,.txt,.md,.doc,.docx"
            aria-label="Select files"
          />
          <input
            ref={folderInputRef}
            type="file"
            id="rag-upload-folder"
            className="rag-upload-file-input-hidden"
            {...({ webkitDirectory: true, directory: true } as React.InputHTMLAttributes<HTMLInputElement>)}
            multiple
            onChange={handleFolderInputChange}
            aria-label="Select folder"
          />
          {files.length === 0 ? (
            <div className="rag-upload-dropzone-label-wrap">
              <span className="rag-upload-dropzone-label">Drag files or folder here, or</span>
              <div className="rag-upload-dropzone-buttons">
                <button
                  type="button"
                  className="rag-upload-browse-btn"
                  onClick={() => fileInputRef.current?.click()}
                >
                  Select files
                </button>
                <button
                  type="button"
                  className="rag-upload-browse-btn"
                  onClick={() => folderInputRef.current?.click()}
                >
                  Select folder
                </button>
              </div>
            </div>
          ) : (
            <div className="rag-upload-file-list">
              <div className="rag-upload-file-list-header">
                <span>{files.length} file(s) selected</span>
                <button type="button" className="rag-upload-clear-files" onClick={clearFiles} aria-label="Clear all">
                  Clear all
                </button>
              </div>
              <ul className="rag-upload-file-ul">
                {files.slice(0, 20).map((file, i) => (
                  <li key={`${file.name}-${i}`} className="rag-upload-file-li">
                    <span className="rag-upload-file-name">{file.name}</span>
                    <span className="rag-upload-file-size">{(file.size / 1024).toFixed(1)} KB</span>
                    <button
                      type="button"
                      className="rag-upload-remove-file"
                      onClick={() => removeFile(i)}
                      aria-label={`Remove ${file.name}`}
                    >
                      ×
                    </button>
                  </li>
                ))}
              </ul>
              {files.length > 20 && (
                <p className="rag-upload-file-more">… and {files.length - 20} more</p>
              )}
            </div>
          )}
        </div>
        <div className="rag-upload-actions">
          <button
            type="button"
            className="rag-upload-primary"
            onClick={handleUpload}
            disabled={!canUpload}
            aria-label="Start RAG upload"
          >
            {uploading ? 'Starting…' : 'Start RAG'}
          </button>
        </div>
        <p className="rag-upload-env-hint">
          Uses the queue/pipeline configured in environment (VITE_RAG_QUEUE, VITE_RAG_PIPELINE) to create the workflow.
        </p>
        {uploadResult && (
          <div
            className={`rag-upload-result ${uploadResult.success ? 'success' : 'error'}`}
            role="status"
          >
            {uploadResult.message}
          </div>
        )}
      </div>
    </div>
  )
}
