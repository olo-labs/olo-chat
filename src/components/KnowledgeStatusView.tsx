/**
 * Copyright (c) 2026 Olo Labs
 * SPDX-License-Identifier: Apache-2.0
 */

import { useCallback, useEffect, useState } from 'react'
import { listKnowledgeSources, type KnowledgeSourceDto } from '../api/ragIngestApi'
import { knowledgeIngestStore } from '../store/knowledgeIngestStore'

export function KnowledgeStatusView() {
  const runs = knowledgeIngestStore((s) => s.runs)
  const [sources, setSources] = useState<KnowledgeSourceDto[]>([])
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    setLoading(true)
    const list = await listKnowledgeSources()
    setSources(list)
    setLoading(false)
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const activeRuns = runs.filter((r) => r.status === 'processing' || r.status === 'pending')
  const completedRuns = runs.filter((r) => r.status === 'indexed' || r.status === 'failed')

  return (
    <div className="knowledge-view knowledge-view-status">
      <p className="knowledge-view-description">
        Track RAG indexing runs and capability sources on the server. Active runs stream events over
        SSE like chat workflows.
      </p>

      <section className="knowledge-status-section">
        <h3 className="knowledge-runs-title">Processing</h3>
        {activeRuns.length === 0 ? (
          <p className="knowledge-empty">No active ingest runs.</p>
        ) : (
          <ul className="knowledge-runs-list">
            {activeRuns.map((run) => (
              <li key={run.id} className="knowledge-run-row knowledge-run-processing">
                <span className="knowledge-run-source">{run.capabilitySource}</span>
                <span className="knowledge-run-status">{run.status}</span>
                {run.message ? <span className="knowledge-run-message">{run.message}</span> : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="knowledge-status-section">
        <h3 className="knowledge-runs-title">Indexed / completed</h3>
        {completedRuns.length === 0 ? (
          <p className="knowledge-empty">No completed ingest runs in this session.</p>
        ) : (
          <ul className="knowledge-runs-list">
            {completedRuns.map((run) => (
              <li key={run.id} className={`knowledge-run-row knowledge-run-${run.status}`}>
                <span className="knowledge-run-source">{run.capabilitySource}</span>
                <span className="knowledge-run-status">{run.status}</span>
                {run.message ? <span className="knowledge-run-message">{run.message}</span> : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="knowledge-status-section">
        <div className="knowledge-files-header">
          <h3 className="knowledge-runs-title">Server sources</h3>
          <button type="button" className="knowledge-link-btn" onClick={() => void refresh()}>
            Refresh
          </button>
        </div>
        {loading ? (
          <p className="knowledge-empty">Loading sources…</p>
        ) : sources.length === 0 ? (
          <p className="knowledge-empty">No capability sources with uploaded files yet.</p>
        ) : (
          <ul className="knowledge-sources-server-list">
            {sources.map((src) => (
              <li key={src.capabilitySource} className="knowledge-source-row">
                <span className="knowledge-run-source">{src.capabilitySource}</span>
                <span className="knowledge-run-files">{src.fileCount} file(s)</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
