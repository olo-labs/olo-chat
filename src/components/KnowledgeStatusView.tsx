/**
 * Copyright (c) 2026 Olo Labs
 * SPDX-License-Identifier: Apache-2.0
 */

import { useMemo } from 'react'
import { knowledgeSourceTypeLabel } from '../api/ragIngestApi'
import {
  knowledgeIngestStore,
  knowledgeStatusLabel,
  type KnowledgeIngestRun,
} from '../store/knowledgeIngestStore'

export function KnowledgeStatusView() {
  const runs = knowledgeIngestStore((s) => s.runs)
  const activeRuns = runs.filter((r) => r.status === 'in_progress' || r.status === 'pending')
  const completedRuns = runs.filter((r) => r.status === 'success' || r.status === 'failed')
  const executedRuns = useMemo(
    () => [...runs].sort((a, b) => b.createdAt - a.createdAt),
    [runs]
  )

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
          <h3 className="knowledge-runs-title">Executed knowledge sources</h3>
        </div>
        {executedRuns.length === 0 ? (
          <p className="knowledge-empty">No knowledge creation jobs have been executed in this session.</p>
        ) : (
          <ul className="knowledge-sources-server-list">
            {executedRuns.map((run: KnowledgeIngestRun) => (
              <li key={run.id} className={`knowledge-source-row knowledge-run-${run.status}`}>
                <span className="knowledge-run-source">{run.knowledgeName}</span>
                <span className="knowledge-run-type">{knowledgeSourceTypeLabel(run.sourceType)}</span>
                <span className="knowledge-run-files">{run.fileNames.length} file(s)</span>
                <span className="knowledge-run-status">{knowledgeStatusLabel(run.status)}</span>
                <span className="knowledge-run-message">from {run.capabilitySource}</span>
                {run.runId ? (
                  <span className="knowledge-run-id" title={run.runId}>
                    run: {run.runId.slice(0, 8)}...
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
