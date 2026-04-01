/**
 * Copyright (c) 2026 Olo Labs
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * List of knowledge sources shown in the second panel (Tools) when section is Knowledge.
 * Placeholder: no API yet; can be wired to e.g. GET /api/knowledge/sources.
 */
export function KnowledgeSourcesList() {
  return (
    <div className="knowledge-sources-list">
      <div className="knowledge-sources-list-empty">
        No knowledge sources yet. Use <strong>Create new</strong> in the main area to add one.
      </div>
    </div>
  )
}
