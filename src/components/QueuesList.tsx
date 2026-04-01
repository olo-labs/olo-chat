/**
 * Copyright (c) 2026 Olo Labs
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useState } from 'react'
import { getQueues } from '../api/chatApi'
import { queueDisplayName } from '../lib/queueDisplayName'

export interface QueuesListProps {
  tenantId: string
  /** Optional class for the container */
  className?: string
}

/** Shows only items returned by GET /api/tenants/<tenantId>/queues. Used under Chat and RAG. */
export function QueuesList({ tenantId, className }: QueuesListProps) {
  const [queues, setQueues] = useState<string[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!tenantId) {
      setQueues([])
      setLoading(false)
      return
    }
    setLoading(true)
    getQueues(tenantId)
      .then(setQueues)
      .catch(() => setQueues([]))
      .finally(() => setLoading(false))
  }, [tenantId])

  if (loading) {
    return (
      <div className={`queues-list ${className ?? ''}`.trim()}>
        <h3 className="queues-list-title">Queues</h3>
        <p className="queues-list-message">Loading…</p>
      </div>
    )
  }

  if (queues.length === 0) {
    return (
      <div className={`queues-list ${className ?? ''}`.trim()}>
        <h3 className="queues-list-title">Queues</h3>
        <p className="queues-list-message">No queues found for this tenant.</p>
      </div>
    )
  }

  return (
    <div className={`queues-list ${className ?? ''}`.trim()}>
      <h3 className="queues-list-title">Queues</h3>
      <ul className="queues-list-list">
        {queues.map((name) => (
          <li key={name} className="queues-list-item">
            <code className="queues-list-name" title={name}>
              {queueDisplayName(name)}
            </code>
          </li>
        ))}
      </ul>
    </div>
  )
}
