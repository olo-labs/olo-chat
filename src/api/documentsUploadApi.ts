/**
 * Copyright (c) 2026 Olo Labs
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Documents upload API — **backend-only** handling (olo-chat only sends multipart to the BE).
 *
 * **Endpoint:** `POST /api/resource/upload` (multipart: `capabilitySource`, `files`, optional `taskQueue` / `pipelineId`).
 *
 * **Storage (server-side, not in the SPA):** The Chat BE owns ingest, validation, and persistence. The concrete
 * store should be **pluggable** so deployments can switch from **local filesystem** (e.g. a configured shared
 * directory) to **object storage** (Amazon S3, Azure Blob, GCS, MinIO, etc.) without changing this frontend.
 * Today’s typical deployment is “write to a shared folder on disk”; that is an implementation detail of the BE,
 * not a limitation of the contract.
 *
 * **Capability source:** Form field `capabilitySource` is the **capability source** id (logical prefix / tenant-scoped key).
 * Indexing / retrieval is **not** done in this request; a **capability** uses that source later when it runs workflows.
 *
 * Optional `taskQueue` / `pipelineId` (from env) may start a **downstream workflow** (e.g. chunking/indexing) after persistence.
 */

import { getApiPathPrefix } from '../lib/apiBase'
import { getApiAuthHeaders } from '../lib/wsUrl'

const API = getApiPathPrefix()

const UPLOAD_QUEUE =
  (import.meta.env.VITE_RESOURCE_UPLOAD_QUEUE as string)?.trim() ||
  (import.meta.env.VITE_RAG_QUEUE as string)?.trim() ||
  ''
const UPLOAD_PIPELINE =
  (import.meta.env.VITE_RESOURCE_UPLOAD_PIPELINE as string)?.trim() ||
  (import.meta.env.VITE_RAG_PIPELINE as string)?.trim() ||
  ''

/** Multipart upload: capability source id + files (BE persists to shared storage / object store). */
export interface ResourceUploadMultipartOptions {
  capabilitySource: string
  files: File[]
  taskQueue?: string
  pipelineId?: string
}

/** Upload request; BE persists bytes (local dir and/or object store per server config). */
export interface CapabilitySourceUploadRequest {
  capabilitySource: string
  files: File[]
}

/** Parsed from POST /api/resource/upload JSON body when the backend returns structured data. */
export interface DocumentUploadResult {
  success: boolean
  message?: string
  /** Single workflow run (multi-file upload). */
  runId?: string
  /** Multiple runs (optional). */
  runIds?: string[]
  /** Per-file run ids when the API returns them. */
  files?: { fileName: string; runId?: string }[]
}

/** Prefer readable text for UI; avoid dumping HTML error pages. Uses JSON `message` when the BE returns it. */
function uploadErrorMessage(status: number, text: string): string {
  const trimmed = text?.trim() ?? ''
  try {
    const j = JSON.parse(trimmed) as { message?: string; error?: string }
    const m = j.message ?? j.error
    if (typeof m === 'string' && m.trim()) {
      return m.trim()
    }
  } catch {
    /* not JSON */
  }
  if (status === 413 || /MaxUploadSizeExceeded|maximum upload size/i.test(trimmed)) {
    return 'File too large (exceeds server upload limit).'
  }
  if (trimmed.startsWith('<') || trimmed.includes('<!DOCTYPE')) {
    if (status === 413) return 'File too large (exceeds server upload limit).'
    if (status >= 500) return `Upload failed (${status} server error).`
    return `Upload failed (${status}).`
  }
  if (trimmed) return trimmed.length > 500 ? `${trimmed.slice(0, 500)}…` : trimmed
  if (status === 413) return 'File too large (exceeds server upload limit).'
  return `Upload failed (${status}).`
}

function parseUploadJson(text: string): Pick<DocumentUploadResult, 'runId' | 'runIds' | 'files'> {
  if (!text?.trim()) return {}
  try {
    const data = JSON.parse(text) as Record<string, unknown>
    const runId = typeof data.runId === 'string' ? data.runId : undefined
    const runIds = Array.isArray(data.runIds)
      ? data.runIds.filter((x): x is string => typeof x === 'string')
      : undefined
    let files: { fileName: string; runId?: string }[] | undefined
    if (Array.isArray(data.files)) {
      const out: { fileName: string; runId?: string }[] = []
      for (const item of data.files) {
        if (!item || typeof item !== 'object') continue
        const o = item as Record<string, unknown>
        const fileName = typeof o.fileName === 'string' ? o.fileName : typeof o.name === 'string' ? o.name : ''
        if (!fileName) continue
        const rid = typeof o.runId === 'string' ? o.runId : undefined
        if (rid !== undefined) out.push({ fileName, runId: rid })
        else out.push({ fileName })
      }
      files = out.length > 0 ? out : undefined
    }
    return { runId, runIds, files }
  } catch {
    return {}
  }
}

/**
 * Upload files into the backend shared folder for a capability source.
 * Multipart: `capabilitySource`, optional `taskQueue` / `pipelineId`, and `files`.
 * On success, parses JSON when present for `runId` / per-file run ids (e.g. Temporal indexing workflow).
 */
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

/** Optional: re-trigger downstream processing (e.g. indexing). JSON body: `capabilitySource`, `fileName`. */
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

/**
 * Comma-separated capability source ids for the upload dropdown.
 * Uses `VITE_CAPABILITY_SOURCE_OPTIONS`, or `VITE_RAG_OPTIONS` if unset.
 */
export function getConfiguredCapabilitySources(): string[] {
  const raw =
    (import.meta.env.VITE_CAPABILITY_SOURCE_OPTIONS as string)?.trim() ||
    (import.meta.env.VITE_RAG_OPTIONS as string)?.trim() ||
    ''
  if (!raw) return []
  return raw.split(',').map((s) => s.trim()).filter(Boolean)
}
