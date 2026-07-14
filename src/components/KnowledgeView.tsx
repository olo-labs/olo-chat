/**
 * Copyright (c) 2026 Olo Labs
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Main content for Knowledge section. Sub-options: sources (list in second panel), create (create new), status (indexed, processing).
 */
import { KnowledgeCreateView } from './KnowledgeCreateView'
import { KnowledgeStatusView } from './KnowledgeStatusView'

export interface KnowledgeViewProps {
  subId: string
}

export function KnowledgeView({ subId }: KnowledgeViewProps) {
  if (subId === 'create') {
    return <KnowledgeCreateView />
  }
  if (subId === 'status') {
    return <KnowledgeStatusView />
  }
  return (
    <div className="knowledge-view knowledge-view-sources">
      <p className="knowledge-view-description">
        Select a knowledge source from the list in the second panel, or use <strong>Create new</strong>{' '}
        to index uploaded documents into the vector store via the <strong>documents-index</strong>{' '}
        workflow.
      </p>
    </div>
  )
}
