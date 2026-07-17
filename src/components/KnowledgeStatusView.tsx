/**
 * Copyright (c) 2026 Olo Labs
 * SPDX-License-Identifier: Apache-2.0
 */

import { useCallback, useEffect, useState } from 'react'
import {
  knowledgeSourceTypeLabel,
  listKnowledgeSources,
  type KnowledgeSourceDto,
} from '../api/ragIngestApi'
import { knowledgeIngestStore, knowledgeStatusLabel } from '../store/knowledgeIngestStore'

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
  }, [refresh, runs.length])

  const activeRuns = runs.filter((r) => r.status === 'in_progress' || r.status === 'pending')
  const completedRuns = runs.filter((r) => r.status === 'success' || r.status === 'failed')

  return (
    <div className="knowledge-view knowledge-view-status">
      <p className="knowledge-view-description">
        Track knowledge creation jobs. Long-running RAG indexing appears as in progress until the
        workflow reports success or failure.
      </p>

      <section className="knowledge-status-section">
        <h3 className="knowledge-runs-title">In progress</h3>
        {activeRuns.length === 0 ? (
          <p className="knowledge-empty">No active knowledge jobs.</p>
        ) : (
          <ul className="knowledge-runs-list">
            {activeRuns.map((run) => (
              <li key={run.id} className={`knowledge-run-row knowledge-run-${run.status}`}>
                <span className="knowledge-run-source">{run.knowledgeName}</span>
                <span className="knowledge-run-type">{knowledgeSourceTypeLabel(run.sourceType)}</span>
                <span className="knowledge-run-status">{knowledgeStatusLabel(run.status)}</span>
                {run.message ? <span className="knowledge-run-message">{run.message}</span> : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="knowledge-status-section">
        <h3 className="knowledge-runs-title">Finished</h3>
        {completedRuns.length === 0 ? (
          <p className="knowledge-empty">No finished knowledge jobs in this session.</p>
        ) : (
          <ul className="knowledge-runs-list">
            {completedRuns.map((run) => (
              <li key={run.id} className={`knowledge-run-row knowledge-run-${run.status}`}>
                <span className="knowledge-run-source">{run.knowledgeName}</span>
                <span className="knowledge-run-type">{knowledgeSourceTypeLabel(run.sourceType)}</span>
                <span className="knowledge-run-status">{knowledgeStatusLabel(run.status)}</span>
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
          <p className="knowledge-empty">Loading sources...</p>
        ) : sources.length === 0 ? (
          <p className="knowledge-empty">No knowledge source collections available yet.</p>
        ) : (
          <ul className="knowledge-sources-server-list">
            {sources.map((src) => (
              <li key={`${src.sourceType}:${src.capabilitySource}`} className="knowledge-source-row">
                <span className="knowledge-run-source">{src.displayName}</span>
                <span className="knowledge-run-type">{knowledgeSourceTypeLabel(src.sourceType)}</span>
                <span className="knowledge-run-files">{src.fileCount} file(s)</span>
                {src.status ? <span className="knowledge-run-status">{src.status}</span> : null}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
