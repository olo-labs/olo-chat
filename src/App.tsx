/**
 * Copyright (c) 2026 Olo Labs
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, type CSSProperties } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
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
import { runEventsStore } from './store/runEvents'
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
import { getUiContext, tenantIdForApiPath, type ChatProfileDto } from './api/chatApi'
import { OLO_CHAT_VERSION } from './version'
import { useWebSocketLiveness } from './hooks/useWebSocketLiveness'
import { useBackendReachable } from './hooks/useBackendReachable'

const DEFAULT_OLO_VERSION = 'v1.0.0-Dev'

function App() {
  useWebSocketLiveness()
  const backendReachable = useBackendReachable()
  const location = useLocation()
  const navigate = useNavigate()

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
    setRunEventsBellUnread,
  } = useUIStore()

  const runSelected = false
  const isTenantConfig = false
  const [newChatTrigger, setNewChatTrigger] = useState(0)
  const [uiFooter, setUiFooter] = useState<{
    tenant: string
    user: string
    oloVersion: string
  }>({
    tenant: 'Default',
    user: 'Public',
    oloVersion: DEFAULT_OLO_VERSION,
  })
  const [chatProfiles, setChatProfiles] = useState<ChatProfileDto[]>([])

  // Default tenant id, footer labels, and Olo version from backend (application.properties / env)
  useEffect(() => {
    let cancelled = false
    getUiContext().then((ctx) => {
      if (cancelled || !ctx) return
      setTenantId(tenantIdForApiPath(ctx.tenantId))
      setUiFooter({
        tenant: ctx.tenant,
        user: ctx.user,
        oloVersion: ctx.oloVersion?.trim() || DEFAULT_OLO_VERSION,
      })
      setChatProfiles(Array.isArray(ctx.chatProfiles) ? ctx.chatProfiles : [])
    })
    return () => {
      cancelled = true
    }
  }, [setTenantId])

  useEffect(() => {
    runEventsStore.getState().setOnWorkflowEventAppended(() => {
      if (!useUIStore.getState().propertiesPanelExpanded) {
        useUIStore.getState().setRunEventsBellUnread(true)
      }
    })
    return () => runEventsStore.getState().setOnWorkflowEventAppended(null)
  }, [])

  useEffect(() => {
    if (propertiesPanelExpanded) {
      setRunEventsBellUnread(false)
    }
  }, [propertiesPanelExpanded, setRunEventsBellUnread])

  // URL → store sync: path and panel query (enables deep links, back/forward, bookmarking)
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
    useUIStore.getState().setPanelStateFromUrl(q.menuExpanded, q.toolsExpanded, q.propsExpanded)
  }, [location.pathname, location.search, location.key, navigate, setSectionSub, setRunId])

  useEffect(() => {
    tenantConfigStore.getState().loadTenants()
  }, [])

  useEffect(() => {
    if (sectionId != null) {
      logEvent('navigation', { section: sectionId, sub: subId, runId: runId || undefined })
    }
  }, [sectionId, subId, runId])

  const tenants = tenantConfigStore((s) => s.tenants)

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
          userLabel={`${uiFooter.user} User`}
          tenantLabel={uiFooter.tenant}
          oloVersion={uiFooter.oloVersion}
          chatVersion={OLO_CHAT_VERSION}
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
              chatProfiles={chatProfiles}
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
          chatProfiles={chatProfiles}
          backendReachable={backendReachable}
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
