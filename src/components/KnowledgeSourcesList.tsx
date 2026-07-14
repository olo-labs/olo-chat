/**
 * Copyright (c) 2026 Olo Labs
 * SPDX-License-Identifier: Apache-2.0
 */

import { useCallback, useEffect, useState } from 'react'
import { listKnowledgeSources, type KnowledgeSourceDto } from '../api/ragIngestApi'
import { knowledgeIngestStore } from '../store/knowledgeIngestStore'

export function KnowledgeSourcesList() {
  const [sources, setSources] = useState<KnowledgeSourceDto[]>([])
  const [loading, setLoading] = useState(true)
  const runs = knowledgeIngestStore((s) => s.runs)

  const refresh = useCallback(async () => {
    setLoading(true)
    const list = await listKnowledgeSources()
    setSources(list)
    setLoading(false)
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh, runs.length])

  if (loading) {
    return (
      <div className="knowledge-sources-list">
        <div className="knowledge-sources-list-empty">Loading sources…</div>
      </div>
    )
  }

  if (sources.length === 0) {
    return (
      <div className="knowledge-sources-list">
        <div className="knowledge-sources-list-empty">
          No knowledge sources yet. Upload files under <strong>Documents</strong>, then use{' '}
          <strong>Create new</strong> to index them.
        </div>
      </div>
    )
  }

  return (
    <div className="knowledge-sources-list">
      <ul className="knowledge-sources-items">
        {sources.map((src) => {
          const active = runs.some(
            (r) =>
              r.capabilitySource === src.capabilitySource &&
              (r.status === 'processing' || r.status === 'pending')
          )
          return (
            <li key={src.capabilitySource} className="knowledge-sources-item">
              <span className="knowledge-sources-item-name">{src.capabilitySource}</span>
              <span className="knowledge-sources-item-meta">{src.fileCount} file(s)</span>
              {active ? <span className="knowledge-sources-item-badge">processing</span> : null}
            </li>
          )
        })}
      </ul>
      <button type="button" className="knowledge-sources-refresh" onClick={() => void refresh()}>
        Refresh
      </button>
    </div>
  )
}
