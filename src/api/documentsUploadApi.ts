/**
 * Copyright (c) 2026 Olo Labs
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Documents upload API — **backend-only** handling (olo-chat only sends multipart to the BE).
 *
 * **Endpoint:** `POST /api/resource/upload` (multipart: `capabilitySource`, `files`, optional `taskQueue` / `pipelineId`).
 */

import { getApiPathPrefix } from '../lib/apiBase'
import { getApiAuthHeaders } from '../lib/wsUrl'
import { parseUploadJson, uploadErrorMessage } from './documentsUploadParse'
import type {
  CapabilitySourceUploadRequest,
  DocumentUploadResult,
  ResourceUploadMultipartOptions,
} from './documentsUploadTypes'

export type {
  CapabilitySourceUploadRequest,
  DocumentUploadResult,
  ResourceUploadMultipartOptions,
} from './documentsUploadTypes'

const API = getApiPathPrefix()

const UPLOAD_QUEUE =
  (import.meta.env.VITE_RESOURCE_UPLOAD_QUEUE as string)?.trim() ||
  (import.meta.env.VITE_RAG_QUEUE as string)?.trim() ||
  ''
const UPLOAD_PIPELINE =
  (import.meta.env.VITE_RESOURCE_UPLOAD_PIPELINE as string)?.trim() ||
  (import.meta.env.VITE_RAG_PIPELINE as string)?.trim() ||
  ''

export async function uploadMultipartToSharedFolder(
  options: ResourceUploadMultipartOptions
): Promise<DocumentUploadResult> {
  const capabilitySource = options.capabilitySource?.trim() ?? ''
  const { files } = options
  if (!capabilitySource || files.length === 0) {
    return { success: false, message: 'Capability source and at least one file are required.' }
  }

  const form = new FormData()
  form.append('capabilitySource', capabilitySource)
  const q = options.taskQueue ?? UPLOAD_QUEUE
  const p = options.pipelineId ?? UPLOAD_PIPELINE
  if (q) form.append('taskQueue', q)
  if (p) form.append('pipelineId', p)
  for (const file of files) {
    form.append('files', file, file.name)
  }

  try {
    const res = await fetch(`${API}/resource/upload`, {
      method: 'POST',
      headers: getApiAuthHeaders(),
      body: form,
    })

    const text = await res.text()
    if (!res.ok) {
      return { success: false, message: uploadErrorMessage(res.status, text) }
    }
    try {
      const data = text?.trim() ? (JSON.parse(text) as Record<string, unknown>) : {}
      if (data && typeof data === 'object' && data.success === false) {
        const msg =
          typeof data.message === 'string'
            ? data.message
            : typeof data.error === 'string'
              ? data.error
              : 'Upload failed'
        return { success: false, message: msg }
      }
    } catch {
      /* empty or non-JSON success body is OK */
    }
    const parsed = parseUploadJson(text)
    return { success: true, ...parsed }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Network error during upload'
    return {
      success: false,
      message: /Failed to fetch|NetworkError|aborted/i.test(msg)
        ? 'Upload failed (network error or connection closed).'
        : msg,
    }
  }
}

export async function uploadCapabilitySourceFiles(
  req: CapabilitySourceUploadRequest
): Promise<DocumentUploadResult> {
  return uploadMultipartToSharedFolder({
    capabilitySource: req.capabilitySource.trim(),
    files: req.files,
  })
}

export async function reprocessUploadedDocument(body: {
  capabilitySource: string
  fileName: string
}): Promise<{ success: boolean; runId?: string }> {
  try {
    const res = await fetch(`${API}/resource/reprocess`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...getApiAuthHeaders() },
      body: JSON.stringify(body),
    })
    if (res.status === 404) return { success: false }
    const text = await res.text()
    if (!res.ok) return { success: false }
    try {
      const data = text ? (JSON.parse(text) as { runId?: string }) : {}
      return { success: true, runId: typeof data.runId === 'string' ? data.runId : undefined }
    } catch {
      return { success: true }
    }
  } catch {
    return { success: false }
  }
}

export async function reprocessCapabilitySourceDocument(body: {
  capabilitySource: string
  fileName: string
}): Promise<{ success: boolean; runId?: string }> {
  return reprocessUploadedDocument(body)
}

export function getConfiguredCapabilitySources(): string[] {
  const raw =
    (import.meta.env.VITE_CAPABILITY_SOURCE_OPTIONS as string)?.trim() ||
    (import.meta.env.VITE_RAG_OPTIONS as string)?.trim() ||
    ''
  if (!raw) return []
  return raw.split(',').map((s) => s.trim()).filter(Boolean)
}
