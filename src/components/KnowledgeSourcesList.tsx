/**
 * Copyright (c) 2026 Olo Labs
 * SPDX-License-Identifier: Apache-2.0
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  getKnowledgeSourceTypeOptions,
  knowledgeSourceTypeLabel,
  listKnowledgeSources,
  type KnowledgeSourceDto,
} from '../api/ragIngestApi'
import { knowledgeIngestStore } from '../store/knowledgeIngestStore'

function sourceStatusLabel(status: KnowledgeSourceDto['status']): string | null {
  if (!status || status === 'unknown') return null
  if (status === 'in_progress') return 'in progress'
  return status
}

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

  const groupedSources = useMemo(() => {
    const map = new Map<string, KnowledgeSourceDto[]>()
    for (const source of sources) {
      const type = source.sourceType
      map.set(type, [...(map.get(type) ?? []), source])
    }
    return getKnowledgeSourceTypeOptions(sources).map((type) => ({
      type,
      sources: (map.get(type.id) ?? []).sort((a, b) => a.displayName.localeCompare(b.displayName)),
    }))
  }, [sources])

  if (loading) {
    return (
      <div className="knowledge-sources-list">
        <div className="knowledge-sources-list-empty">Loading knowledge sources...</div>
      </div>
    )
  }

  if (sources.length === 0) {
    return (
      <div className="knowledge-sources-list">
        <div className="knowledge-sources-list-empty">
          No knowledge source collections yet. Upload files under <strong>Documents</strong>, then use{' '}
          <strong>Create new</strong> to index them.
        </div>
      </div>
    )
  }

  return (
    <div className="knowledge-sources-list">
      <div className="knowledge-sources-summary">
        <span className="knowledge-sources-summary-title">Knowledge source collections</span>
        <span className="knowledge-sources-summary-meta">
          {sources.length} collection{sources.length === 1 ? '' : 's'} across {groupedSources.length}{' '}
          type{groupedSources.length === 1 ? '' : 's'}
        </span>
      </div>

      {groupedSources.map(({ type, sources: items }) => (
        <section key={type.id} className="knowledge-source-group">
          <div className="knowledge-source-group-header">
            <h3 className="knowledge-runs-title">{type.label}</h3>
            <span className="knowledge-sources-item-meta">
              {items.length} collection{items.length === 1 ? '' : 's'}
            </span>
          </div>
          {items.length === 0 ? (
            <p className="knowledge-empty">No {type.label.toLowerCase()} collections available.</p>
          ) : (
            <ul className="knowledge-sources-items">
              {items.map((src) => {
                const active = runs.some(
                  (r) =>
                    r.sourceType === src.sourceType &&
                    r.capabilitySource === src.capabilitySource &&
                    (r.status === 'in_progress' || r.status === 'pending')
                )
                const statusLabel = active ? 'in progress' : sourceStatusLabel(src.status)
                const statusClass = active ? 'in_progress' : src.status
                return (
                  <li key={`${src.sourceType}:${src.capabilitySource}`} className="knowledge-sources-item">
                    <div className="knowledge-sources-item-main">
                      <span className="knowledge-sources-item-name">{src.displayName}</span>
                      <span className="knowledge-sources-item-id">{src.capabilitySource}</span>
                    </div>
                    <span className="knowledge-sources-type-pill">
                      {knowledgeSourceTypeLabel(src.sourceType)}
                    </span>
                    <span className="knowledge-sources-item-meta">
                      {src.fileCount} file{src.fileCount === 1 ? '' : 's'}
                    </span>
                    {statusLabel ? (
                      <span className={`knowledge-sources-item-badge knowledge-sources-item-badge-${statusClass}`}>
                        {statusLabel}
                      </span>
                    ) : null}
                  </li>
                )
              })}
            </ul>
          )}
        </section>
      ))}
      <button type="button" className="knowledge-sources-refresh" onClick={() => void refresh()}>
        Refresh
      </button>
    </div>
  )
}