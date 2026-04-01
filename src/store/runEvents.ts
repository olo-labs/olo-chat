/**
 * Copyright (c) 2026 Olo Labs
 * SPDX-License-Identifier: Apache-2.0
 */

import { create } from 'zustand'
import type { RunEventDto } from '../api/chatApi'

export type OnRunEventCallback = (runId: string, event: RunEventDto) => void

export interface RunEventsState {
  runId: string | null
  events: RunEventDto[]
  setRun: (runId: string | null) => void
  addEvent: (event: RunEventDto) => void
  clear: () => void
  /** Called when an event is added (e.g. from WebSocket RUN_EVENT). Use to trigger getRunResponse, listMessages, etc. */
  setOnRunEventCallback: (cb: OnRunEventCallback | null) => void
}

let onRunEventCallback: OnRunEventCallback | null = null

export const runEventsStore = create<RunEventsState>((set) => ({
  runId: null,
  events: [],

  setRun: (runId) => set({ runId, events: [] }),

  addEvent: (event) => {
    set((s) => ({ events: [...s.events, event] }))
    const runId = event.runId
    if (runId && runId !== '__liveness__' && onRunEventCallback) {
      try {
        onRunEventCallback(runId, event)
      } catch {
        // ignore
      }
    }
  },

  clear: () => {
    onRunEventCallback = null
    set({ runId: null, events: [] })
  },

  setOnRunEventCallback: (cb) => {
    onRunEventCallback = cb
  },
}))
