/**
 * Copyright (c) 2026 Olo Labs
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * RAG upload API. Uses VITE_API_BASE; queue/pipeline for the workflow come from env.
 */

const API = import.meta.env.VITE_API_BASE
  ? `${String(import.meta.env.VITE_API_BASE).replace(/\/$/, '')}/api`
  : '/api'

const RAG_QUEUE = (import.meta.env.VITE_RAG_QUEUE as string)?.trim() || ''
const RAG_PIPELINE = (import.meta.env.VITE_RAG_PIPELINE as string)?.trim() || ''

export interface RAGUploadOptions {
  ragId: string
  files: File[]
  taskQueue?: string
  pipelineId?: string
}

/**
 * Upload files for RAG. Creates a workflow of type queue/pipeline configured in env.
 * Sends multipart/form-data: ragId, taskQueue, pipelineId, and file(s).
 */
export async function uploadForRAG(options: RAGUploadOptions): Promise<{ success: boolean; message?: string }> {
  const { ragId, files } = options
  if (!ragId || files.length === 0) {
    return { success: false, message: 'RAG id and at least one file are required.' }
  }

  const form = new FormData()
  form.append('ragId', ragId)
  if (RAG_QUEUE) form.append('taskQueue', RAG_QUEUE)
  if (RAG_PIPELINE) form.append('pipelineId', RAG_PIPELINE)
  for (const file of files) {
    form.append('files', file, file.name)
  }

  const res = await fetch(`${API}/rag/upload`, {
    method: 'POST',
    body: form,
  })

  if (!res.ok) {
    const text = await res.text()
    return { success: false, message: text || `Upload failed: ${res.status}` }
  }
  return { success: true }
}

/** Comma-separated list of existing RAG ids/names for the dropdown (from env). */
export function getExistingRAGOptions(): string[] {
  const raw = (import.meta.env.VITE_RAG_OPTIONS as string)?.trim() || ''
  if (!raw) return []
  return raw.split(',').map((s) => s.trim()).filter(Boolean)
}
