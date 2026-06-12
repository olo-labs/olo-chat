/**
 * Copyright (c) 2026 Olo Labs
 * SPDX-License-Identifier: Apache-2.0
 */

import { beforeEach, describe, expect, it } from 'vitest'
import type { RunEventDto } from '../api/chatApi'
import { eventsForRun, runEventsStore } from './runEvents'

function workflowEvent(runId: string, sequenceNumber: number): RunEventDto {
  return {
    runId,
    sequenceNumber,
    nodeType: 'SYSTEM',
    status: 'COMPLETED',
    nodeId: 'end',
    timestamp: sequenceNumber,
  }
}

describe('runEventsStore', () => {
  beforeEach(() => {
    runEventsStore.getState().clear()
  })

  it('setRun updates run id without clearing accumulated events', () => {
    runEventsStore.getState().setRun('run-a')
    runEventsStore.getState().addEvent(workflowEvent('run-a', 1))

    runEventsStore.getState().setRun('run-b')

    expect(runEventsStore.getState().runId).toBe('run-b')
    expect(runEventsStore.getState().events).toHaveLength(1)
    expect(runEventsStore.getState().events[0].runId).toBe('run-a')
  })

  it('addEvent appends events from multiple runs in one session', () => {
    runEventsStore.getState().setRun('run-a')
    runEventsStore.getState().addEvent(workflowEvent('run-a', 1))
    runEventsStore.getState().setRun('run-b')
    runEventsStore.getState().addEvent(workflowEvent('run-b', 1))

    expect(runEventsStore.getState().events).toHaveLength(2)
    expect(eventsForRun(runEventsStore.getState().events, 'run-a')).toHaveLength(1)
    expect(eventsForRun(runEventsStore.getState().events, 'run-b')).toHaveLength(1)
  })

  it('clear resets run id and events', () => {
    runEventsStore.getState().setRun('run-a')
    runEventsStore.getState().addEvent(workflowEvent('run-a', 1))
    runEventsStore.getState().clear()
    expect(runEventsStore.getState()).toMatchObject({ runId: null, events: [] })
  })
})
