/**
 * Copyright (c) 2026 Olo Labs
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * RAG ingest API — start indexing runs and list knowledge sources / uploaded documents.
 *
 * **Endpoints:**
 * - `POST /api/rag/ingest` — start documents-index Temporal workflow
 * - `GET /api/knowledge/sources` — capability sources with file counts
 * - `GET /api/documents?capabilitySource=` — files for a source
 */

import { getApiPathPrefix } from '../lib/apiBase'
import { getApiAuthHeaders } from '../lib/wsUrl'

const API = getApiPathPrefix()

const INGEST_QUEUE =
  (import.meta.env.VITE_RESOURCE_UPLOAD_QUEUE as string)?.trim() ||
  (import.meta.env.VITE_RAG_QUEUE as string)?.trim() ||
  ''
const INGEST_PIPELINE =
  (import.meta.env.VITE_RESOURCE_UPLOAD_PIPELINE as string)?.trim() ||
  (import.meta.env.VITE_RAG_PIPELINE as string)?.trim() ||
  'documents-index'

export interface KnowledgeSourceDto {
  capabilitySource: string
  fileCount: number
  files?: UploadedDocumentDto[]
}

export interface UploadedDocumentDto {
  fileName: string
  capabilitySource: string
  sizeBytes?: number
  lastModified?: number
}

export interface RagIngestRequest {
  tenantId?: string
  capabilitySource: string
  fileNames: string[]
  taskQueue?: string
  pipelineId?: string
}

export interface RagIngestResult {
  success: boolean
  message?: string
  runId?: string
  capabilitySource?: string
  pipeline?: string
  taskQueue?: string
  files?: string[]
}

function parseJson<T>(text: string): T | null {
  if (!text?.trim()) return null
  try {
    return JSON.parse(text) as T
  } catch {
    return null
  }
}

export async function startRagIngest(req: RagIngestRequest): Promise<RagIngestResult> {
  const capabilitySource = req.capabilitySource?.trim() ?? ''
  if (!capabilitySource) {
    return { success: false, message: 'Capability source is required.' }
  }
  const fileNames = (req.fileNames ?? []).map((f) => f.trim()).filter(Boolean)

  const body: Record<string, unknown> = {
    tenantId: req.tenantId?.trim() || 'default',
    capabilitySource,
    fileNames,
  }
  const queue = req.taskQueue ?? INGEST_QUEUE
  const pipeline = req.pipelineId ?? INGEST_PIPELINE
  if (queue) body.taskQueue = queue
  if (pipeline) body.pipelineId = pipeline

  try {
    const res = await fetch(`${API}/rag/ingest`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...getApiAuthHeaders() },
      body: JSON.stringify(body),
    })
    const text = await res.text()
    const data = parseJson<RagIngestResult & { message?: string }>(text)
    if (!res.ok) {
      return {
        success: false,
        message: data?.message ?? `RAG ingest failed (${res.status})`,
      }
    }
    if (data?.success === false) {
      return { success: false, message: data.message ?? 'RAG ingest failed' }
    }
    return {
      success: true,
      runId: typeof data?.runId === 'string' ? data.runId : undefined,
      capabilitySource: data?.capabilitySource ?? capabilitySource,
      pipeline: data?.pipeline ?? pipeline,
      taskQueue: data?.taskQueue ?? queue,
      files: data?.files ?? fileNames,
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Network error'
    return { success: false, message: msg }
  }
}

export async function listKnowledgeSources(): Promise<KnowledgeSourceDto[]> {
  try {
    const res = await fetch(`${API}/knowledge/sources`, {
      headers: getApiAuthHeaders(),
    })
    if (!res.ok) return []
    const data = parseJson<KnowledgeSourceDto[]>(await res.text())
    return Array.isArray(data) ? data : []
  } catch {
    return []
  }
}

export async function listUploadedDocuments(capabilitySource: string): Promise<UploadedDocumentDto[]> {
  const src = capabilitySource?.trim()
  if (!src) return []
  try {
    const url = `${API}/documents?${new URLSearchParams({ capabilitySource: src })}`
    const res = await fetch(url, { headers: getApiAuthHeaders() })
    if (!res.ok) return []
    const data = parseJson<UploadedDocumentDto[]>(await res.text())
    return Array.isArray(data) ? data : []
  } catch {
    return []
  }
}
