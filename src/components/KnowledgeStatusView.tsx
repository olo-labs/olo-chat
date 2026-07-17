/**
 * Copyright (c) 2026 Olo Labs
 * SPDX-License-Identifier: Apache-2.0
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  FILES_KNOWLEDGE_SOURCE_TYPE,
  knowledgeSourceTypeLabel,
  listKnowledgeSources,
  type KnowledgeSourceDto,
} from '../api/ragIngestApi'
import {
  knowledgeIngestStore,
  knowledgeStatusLabel,
  type KnowledgeIngestRun,
} from '../store/knowledgeIngestStore'

function sourceFromRun(run: KnowledgeIngestRun): KnowledgeSourceDto {
  return {
    capabilitySource: run.knowledgeName || run.capabilitySource,
    displayName: run.knowledgeName || run.capabilitySource,
    sourceType: run.sourceType || FILES_KNOWLEDGE_SOURCE_TYPE,
    fileCount: run.fileNames.length,
    status: run.status === 'success' ? 'success' : run.status === 'failed' ? 'failed' : 'in_progress',
    description: run.capabilitySource,
  }
}

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
  }, [refresh, runs])

  const activeRuns = runs.filter((r) => r.status === 'in_progress' || r.status === 'pending')
  const completedRuns = runs.filter((r) => r.status === 'success' || r.status === 'failed')
  const visibleSources = useMemo(() => {
    const map = new Map<string, KnowledgeSourceDto>()
    for (const src of sources) {
      map.set(`${src.sourceType}:${src.capabilitySource}`, src)
    }
    for (const run of runs) {
      if (run.status !== 'success' && run.status !== 'failed') continue
      const source = sourceFromRun(run)
      map.set(`${source.sourceType}:${source.capabilitySource}`, source)
    }
    return [...map.values()].sort((a, b) =>
      `${a.sourceType}:${a.displayName}`.localeCompare(`${b.sourceType}:${b.displayName}`)
    )
  }, [runs, sources])

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
          <h3 className="knowledge-runs-title">Knowledge sources</h3>
          <button type="button" className="knowledge-link-btn" onClick={() => void refresh()}>
            Refresh
          </button>
        </div>
        {loading ? (
          <p className="knowledge-empty">Loading sources...</p>
        ) : visibleSources.length === 0 ? (
          <p className="knowledge-empty">No knowledge source collections available yet.</p>
        ) : (
          <ul className="knowledge-sources-server-list">
            {visibleSources.map((src) => (
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
