/**
 * Copyright (c) 2026 Olo Labs
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Main content for Knowledge section. Sub-options: sources (list in second panel), create (create new), status (indexed, processing).
 */
export interface KnowledgeViewProps {
  subId: string
}

export function KnowledgeView({ subId }: KnowledgeViewProps) {
  if (subId === 'create') {
    return (
      <div className="knowledge-view knowledge-view-create">
        <p className="knowledge-view-description">Create a new knowledge source. (Form placeholder — wire to API.)</p>
      </div>
    )
  }
  if (subId === 'status') {
    return (
      <div className="knowledge-view knowledge-view-status">
        <p className="knowledge-view-description">Status: indexed, processing. (Placeholder — wire to API.)</p>
      </div>
    )
  }
  return (
    <div className="knowledge-view knowledge-view-sources">
      <p className="knowledge-view-description">
        Select a knowledge source from the list in the second panel, or use <strong>Create new</strong> to add one.
      </p>
    </div>
  )
}
