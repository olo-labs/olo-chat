/**
 * Copyright (c) 2026 Olo Labs
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, type CSSProperties } from 'react'
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { TopBar } from './components/TopBar'
import { LeftPanel } from './components/LeftPanel'
import { ToolsPanel } from './components/ToolsPanel'
import { MainContent } from './components/MainContent'
import { PropertiesPanel } from './components/PropertiesPanel'
import { PanelResizeHandle } from './components/PanelResizeHandle'
import { TenantConfigForm } from './components/TenantConfigForm'
import { EventsList } from './components/EventsList'
import type { Tenant } from './types/tenant'
import { useUIStore } from './store/ui'
import { tenantConfigStore } from './store/tenantConfig'
import {
  parsePath,
  buildPath,
  buildPathWithQuery,
  buildQuery,
  parseQuery,
  parsedToPanelParams,
  DEFAULT_PATH,
  getRunLevelDefaultSubId,
} from './routes'
import { getLastSelectedPath, setLastSelectedPath } from './lib/lastSelectedPath'
import type { SectionId } from './types/layout'
import { isFeatureEnabled } from './config/features'
import type { FeatureId } from './config/features'
import { logEvent } from './lib/observability'
import { getLastTenantId, setLastTenantId } from './lib/lastTenant'
import { useWebSocketLiveness } from './hooks/useWebSocketLiveness'

function App() {
  useWebSocketLiveness()
  const location = useLocation()
  const navigate = useNavigate()
  const [, setSearchParams] = useSearchParams()

  const {
    leftPanelExpanded,
    toolsPanelExpanded,
    propertiesPanelExpanded,
    panelWidthLeft,
    panelWidthTools,
    panelWidthProperties,
    sectionId,
    subId,
    runId,
    tenantId,
    setRunId,
    setTenantId,
    setSectionSub,
  } = useUIStore()

  const runSelected = false
  const isTenantConfig = false
  const [newChatTrigger, setNewChatTrigger] = useState(0)

  // URL → store sync: path, tenant, and panel query (enables deep links, back/forward, bookmarking)
  useEffect(() => {
    const pathname = location.pathname || '/'
    if (pathname === '/' || pathname === '') {
      const last = getLastSelectedPath()
      const initialPath = last != null && last !== '' && parsePath(last) ? last : DEFAULT_PATH
      navigate(initialPath, { replace: true })
      return
    }
    const parsed = parsePath(pathname)
    if (!parsed) {
      const last = getLastSelectedPath()
      const fallback = last != null && last !== '' && parsePath(last) ? last : DEFAULT_PATH
      navigate(fallback, { replace: true })
      return
    }
    setLastSelectedPath(pathname)
    // Disabled section deep link: redirect to safe default
    if (!isFeatureEnabled(parsed.sectionId as FeatureId)) {
      navigate(DEFAULT_PATH, { replace: true })
      return
    }
    setSectionSub(parsed.sectionId, parsed.subId)
    setRunId(parsed.runId ?? '')
    const q = parseQuery(location.search)
    setTenantId(q.tenantId)
    useUIStore.getState().setPanelStateFromUrl(q.menuExpanded, q.toolsExpanded, q.propsExpanded)
  }, [location.pathname, location.search, location.key, navigate, setSectionSub, setRunId, setTenantId])

  useEffect(() => {
    tenantConfigStore.getState().loadTenants()
  }, [])

  useEffect(() => {
    if (sectionId != null) {
      logEvent('navigation', { section: sectionId, sub: subId, runId: runId || undefined })
    }
  }, [sectionId, subId, runId])

  // Default tenant when URL has none: previously selected (if in list) or top tenant from backend list (OLO_TENANT_IDS), else "default"
  const tenants = tenantConfigStore((s) => s.tenants)
  useEffect(() => {
    const q = parseQuery(location.search)
    if (q.tenantId !== '') return
    const last = getLastTenantId()
    const defaultId =
      tenants.length > 0 && last && tenants.some((t) => t.id === last)
        ? last
        : tenants.length > 0
          ? tenants[0].id
          : 'default'
    setTenantId(defaultId)
    setLastTenantId(defaultId)
    const params = parsedToPanelParams(q)
    navigate(location.pathname + '?' + buildQuery({ ...params, tenantId: defaultId }), {
      replace: true,
    })
  }, [location.pathname, location.search, tenants, navigate, setTenantId])

  // When tenants load, if current tenant is not in list, select top tenant (or keep previous if in list)
  useEffect(() => {
    if (tenants.length === 0) return
    const q = parseQuery(location.search)
    const current = q.tenantId
    if (!current || tenants.some((t) => t.id === current)) return
    const last = getLastTenantId()
    const fallbackId = last && tenants.some((t) => t.id === last) ? last : tenants[0].id
    setTenantId(fallbackId)
    setLastTenantId(fallbackId)
    const params = parsedToPanelParams(q)
    navigate(location.pathname + '?' + buildQuery({ ...params, tenantId: fallbackId }), {
      replace: true,
    })
  }, [tenants, location.pathname, location.search, navigate, setTenantId])

  const q = parseQuery(location.search)

  const updatePanelQuery = (updates: { menu?: 0 | 1; tools?: 0 | 1; props?: 0 | 1 }) => {
    const params = parsedToPanelParams(q)
    const next = { ...params, ...updates }
    navigate(location.pathname + '?' + buildQuery(next), { replace: true })
  }

  const handleSectionSubSelect = (sid: SectionId, sub: string) => {
    const params = parsedToPanelParams(q)
    navigate(buildPathWithQuery(buildPath(sid, sub), { ...params, props: 0 }))
  }

  const handleTenantChange = (id: string) => {
    setLastTenantId(id)
    const params = parsedToPanelParams(q)
    setSearchParams(
      new URLSearchParams(buildQuery({ ...params, tenantId: id })),
      { replace: true }
    )
  }

  const handleRunIdChange = (id: string) => {
    if (!sectionId) return
    const params = parsedToPanelParams(q)
    const sub = id ? getRunLevelDefaultSubId(sectionId) : subId
    navigate(buildPathWithQuery(buildPath(sectionId, sub), params))
  }

  const handleSelectTenant = (t: Tenant) => {
    tenantConfigStore.getState().selectTenant(t)
    updatePanelQuery({ props: 1 })
  }

  const handleAddNewTenant = () => {
    tenantConfigStore.getState().startAddNew()
    updatePanelQuery({ props: 1 })
  }

  const handleToggleLeftPanel = () => updatePanelQuery({ menu: q.menuExpanded ? 0 : 1 })
  const handleToggleToolsPanel = () => updatePanelQuery({ tools: q.toolsExpanded ? 0 : 1 })
  const handleTogglePropertiesPanel = () => updatePanelQuery({ props: q.propsExpanded ? 0 : 1 })

  const tenantsLoading = tenantConfigStore((s) => s.tenantsLoading)
  const configSelectedTenant = tenantConfigStore((s) => s.configSelectedTenant)
  const configIsAddingNew = tenantConfigStore((s) => s.configIsAddingNew)

  return (
    <div className="app">
      <TopBar />
      <div
        className="app-body"
        style={
          {
            '--panel-width-left': `${panelWidthLeft}px`,
            '--panel-width-tools': `${panelWidthTools}px`,
            '--panel-width-properties': `${panelWidthProperties}px`,
          } as CSSProperties
        }
      >
        <LeftPanel
          expanded={leftPanelExpanded}
          onToggle={handleToggleLeftPanel}
          tenantId={tenantId}
          onTenantChange={handleTenantChange}
          tenants={tenants}
          sectionId={sectionId}
          subId={subId}
          runSelected={runSelected}
          onSectionSubSelect={handleSectionSubSelect}
        />
        <PanelResizeHandle
          panel="left"
          visible
          onResize={(delta) => useUIStore.getState().setPanelWidthLeft(useUIStore.getState().panelWidthLeft + delta)}
        />
        {!isTenantConfig && (sectionId === 'chat' || sectionId === 'knowledge') && (
          <>
            <ToolsPanel
              expanded={toolsPanelExpanded}
              onToggle={handleToggleToolsPanel}
              sectionId={sectionId}
              subId={subId}
              runSelected={runSelected}
              tenantId={tenantId}
              storeContext={{}}
              onNewChat={() => setNewChatTrigger((t) => t + 1)}
            />
            <PanelResizeHandle
              panel="tools"
              visible
              onResize={(delta) => useUIStore.getState().setPanelWidthTools(useUIStore.getState().panelWidthTools + delta)}
            />
          </>
        )}
        <MainContent
          sectionId={sectionId}
          subId={subId}
          runSelected={runSelected}
          runId={runId}
          onRunIdChange={handleRunIdChange}
          tenantId={tenantId}
          tenants={tenants}
          tenantsLoading={tenantsLoading}
          configSelectedTenant={configSelectedTenant}
          onSelectTenant={handleSelectTenant}
          onAddNewTenant={handleAddNewTenant}
          onDeleteTenant={(id) => tenantConfigStore.getState().deleteTenant(id)}
          newChatTrigger={newChatTrigger}
        />
        <PanelResizeHandle
          panel="properties"
          visible
          onResize={(delta) => useUIStore.getState().setPanelWidthProperties(useUIStore.getState().panelWidthProperties + delta)}
        />
        <PropertiesPanel
          expanded={propertiesPanelExpanded}
          onToggle={handleTogglePropertiesPanel}
        >
          {sectionId === 'chat' ? (
            <EventsList />
          ) : sectionId === 'knowledge' ? undefined : isTenantConfig ? (
            <TenantConfigForm
              tenant={configSelectedTenant}
              isAddingNew={configIsAddingNew}
              onSave={(tenant) => tenantConfigStore.getState().saveTenant(tenant)}
            />
          ) : undefined}
        </PropertiesPanel>
      </div>
    </div>
  )
}

export default App
