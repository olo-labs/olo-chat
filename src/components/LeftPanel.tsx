/**
 * Copyright (c) 2026 Olo Labs
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState } from 'react'
import { type SectionConfig, type SectionId } from '../types/layout'
import { useVisibleSections } from '../hooks/useFeature'
import { isFeatureEnabled } from '../config/features'
import { runEventsStore } from '../store/runEvents'
import { useUIStore } from '../store/ui'

export interface LeftPanelProps {
  expanded: boolean
  onToggle: () => void
  /** User line in footer (from GET /api/ui/context). */
  userLabel: string
  /** Tenant display name for footer line "Tenant: …" (from GET /api/ui/context). */
  tenantLabel: string
  /** Olo backend version (olo.version from GET /api/ui/context). */
  oloVersion: string
  /** olo-chat package version (package.json). */
  chatVersion: string
  sectionId: SectionId | null
  subId: string
  runSelected: boolean
  onSectionSubSelect: (sectionId: SectionId, subId: string) => void
}

type MenuContextMenu = { x: number; y: number; targetSectionId: SectionId | null }

export function LeftPanel({
  expanded,
  onToggle,
  userLabel,
  tenantLabel,
  oloVersion,
  chatVersion,
  sectionId,
  subId,
  runSelected,
  onSectionSubSelect,
}: LeftPanelProps) {
  const [expandedCategories, setExpandedCategories] = useState<Set<SectionId>>(new Set())
  const [menuContext, setMenuContext] = useState<MenuContextMenu | null>(null)
  const sections = useVisibleSections()
  const hasEventsToReview = runEventsStore((s) => s.events.length) > 0

  const toggleCategory = (id: SectionId) => {
    setExpandedCategories((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const expandCategory = (id: SectionId) => {
    setExpandedCategories((prev) => new Set(prev).add(id))
  }
  const collapseCategory = (id: SectionId) => {
    setExpandedCategories((prev) => {
      const next = new Set(prev)
      next.delete(id)
      return next
    })
  }
  const expandAll = () => {
    setExpandedCategories(new Set(sections.map((s) => s.id)))
  }
  const collapseAll = () => {
    setExpandedCategories(new Set())
  }

  const handleMenuContextMenu = (e: React.MouseEvent, targetSectionId: SectionId | null) => {
    e.preventDefault()
    if (!expanded) return
    setMenuContext({ x: e.clientX, y: e.clientY, targetSectionId })
  }
  const closeMenuContext = () => setMenuContext(null)

  const getSubOptions = (section: SectionConfig) => {
    if (section.id === 'chat') {
      // Chat has only "Conversation" as submenu; queues live in the Conversation panel dropdown
      return section.subOptions ?? []
    }
    const list =
      runSelected && section.runSelectedOptions?.length
        ? section.runSelectedOptions
        : section.subOptions
    return list.filter((sub) => !sub.featureId || isFeatureEnabled(sub.featureId as import('../config/features').FeatureId))
  }

  return (
    <aside className={`left-panel ${expanded ? 'expanded' : 'collapsed'}`}>
      {expanded && (
        <div className="left-panel-inner">
          <nav
            className="left-panel-menu"
            onContextMenu={(e) => handleMenuContextMenu(e, null)}
          >
            {sections.map((section) => {
              const isCategoryExpanded = expandedCategories.has(section.id)
              const subOptions = getSubOptions(section)
              const hasSubs = subOptions.length > 0
              const categoryTooltip = `${section.label}: ${section.subtitle}`

              return (
                <div key={section.id} className="left-panel-category">
                  <button
                    type="button"
                    className={`left-panel-category-header ${isCategoryExpanded ? 'expanded' : ''} ${sectionId === section.id && (!hasSubs || getSubOptions(section).some((s) => s.id === subId)) ? 'active' : ''}`}
                    onClick={() => (hasSubs ? toggleCategory(section.id) : onSectionSubSelect(section.id, ''))}
                    onContextMenu={(e) => handleMenuContextMenu(e, section.id)}
                    aria-expanded={isCategoryExpanded}
                    title={categoryTooltip}
                  >
                    <span className="left-panel-category-chevron">
                      {hasSubs ? (isCategoryExpanded ? '▼' : '▶') : ''}
                    </span>
                    <span className="left-panel-category-label">{section.label}</span>
                    <span className="left-panel-category-subtitle">{section.subtitle}</span>
                  </button>
                  {hasSubs && isCategoryExpanded && (
                    <ul className="left-panel-sub-list">
                      {subOptions.map((sub) => (
                        <li key={sub.id}>
                          <button
                            type="button"
                            className={`left-panel-sub-item ${sectionId === section.id && subId === sub.id ? 'active' : ''}`}
                            onClick={() => onSectionSubSelect(section.id, sub.id)}
                            title={sub.description ?? sub.label}
                          >
                            {sub.label}
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )
            })}
          </nav>
          {menuContext && (
            <>
              <div
                className="left-panel-menu-context-backdrop"
                onClick={closeMenuContext}
                onContextMenu={closeMenuContext}
                aria-hidden
              />
              <div
                className="left-panel-menu-context-menu"
                style={{ left: menuContext.x, top: menuContext.y }}
                role="menu"
              >
                {menuContext.targetSectionId != null && (
                  <>
                    <button
                      type="button"
                      className="left-panel-menu-context-item"
                      role="menuitem"
                      onClick={() => {
                        collapseCategory(menuContext.targetSectionId!)
                        closeMenuContext()
                      }}
                    >
                      Collapse
                    </button>
                    <button
                      type="button"
                      className="left-panel-menu-context-item"
                      role="menuitem"
                      onClick={() => {
                        expandCategory(menuContext.targetSectionId!)
                        closeMenuContext()
                      }}
                    >
                      Expand
                    </button>
                  </>
                )}
                <button
                  type="button"
                  className="left-panel-menu-context-item"
                  role="menuitem"
                  onClick={() => {
                    collapseAll()
                    closeMenuContext()
                  }}
                >
                  Collapse all
                </button>
                <button
                  type="button"
                  className="left-panel-menu-context-item"
                  role="menuitem"
                  onClick={() => {
                    expandAll()
                    closeMenuContext()
                  }}
                >
                  Expand all
                </button>
              </div>
            </>
          )}
          <footer className="left-panel-footer">
            <div className="left-panel-footer-top">
              <div className="left-panel-user-block">
                <div className="left-panel-user">
                  <span className="left-panel-user-bubble" aria-hidden />
                  <span className="left-panel-user-label">{userLabel}</span>
                </div>
                <div className="left-panel-tenant-line" title={`Tenant: ${tenantLabel}`}>
                  Tenant: {tenantLabel}
                </div>
              </div>
              <button
                type="button"
                className="left-panel-bell-wrap"
                title={hasEventsToReview ? 'Events to review — click to open Events panel' : 'Notifications — click to open Events panel'}
                onClick={() => useUIStore.getState().togglePropertiesPanel()}
                aria-label="Toggle Events panel"
              >
                <span className="left-panel-bell-tooltip" role="tooltip">
                  {hasEventsToReview ? 'Events to review — see Events panel' : 'Notifications'}
                </span>
                <span
                  className={`left-panel-footer-bell ${hasEventsToReview ? 'left-panel-footer-bell-has-events' : ''}`}
                  aria-hidden
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                    <path d="M13.73 21a2 2 0 0 1-3.46 0" />
                  </svg>
                </span>
              </button>
            </div>
            <div className="left-panel-version" title="Olo backend (GET /api/ui/context)">
              OLO {oloVersion}
            </div>
            <div className="left-panel-chat-version" title="olo-chat (package.json)">
              olo-chat v{chatVersion}
            </div>
            <div className="left-panel-copyright">© {new Date().getFullYear()} OLO</div>
          </footer>
          <button
            type="button"
            className="left-panel-toggle"
            onClick={onToggle}
            title="Collapse"
            aria-label="Collapse menu"
          >
            {'<'}
          </button>
        </div>
      )}
      {!expanded && (
        <>
          <div className="left-panel-collapsed-spacer" />
          <button
            type="button"
            className="left-panel-toggle"
            onClick={onToggle}
            title="Expand"
            aria-label="Expand menu"
          >
            <span className="left-panel-collapsed-label">Menu</span>
          </button>
          <div className="left-panel-collapsed-spacer" />
          <div className="left-panel-collapsed-bell">
            <button
              type="button"
              className="left-panel-bell-wrap"
              title={hasEventsToReview ? 'Events to review — click to open Events panel' : 'Notifications — click to open Events panel'}
              onClick={() => useUIStore.getState().togglePropertiesPanel()}
              aria-label="Toggle Events panel"
            >
              <span className="left-panel-bell-tooltip" role="tooltip">
                {hasEventsToReview ? 'Events to review — see Events panel' : 'Notifications'}
              </span>
              <span
                className={`left-panel-footer-bell ${hasEventsToReview ? 'left-panel-footer-bell-has-events' : ''}`}
                aria-hidden
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                  <path d="M13.73 21a2 2 0 0 1-3.46 0" />
                </svg>
              </span>
            </button>
          </div>
        </>
      )}
    </aside>
  )
}
