/**
 * Copyright (c) 2026 Olo Labs
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Main content for Knowledge section. Sub-options: sources, create, status.
 */
import { KnowledgeCreateView } from './KnowledgeCreateView'
import { KnowledgeSourcesList } from './KnowledgeSourcesList'
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
        Review every knowledge source collection available to chat. File collections come from
        uploaded document folders, and additional source types can appear here as they are added.
      </p>
      <KnowledgeSourcesList />
    </div>
  )
}
