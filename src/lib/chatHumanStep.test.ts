/**
 * Copyright (c) 2026 Olo Labs
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest'
import type { RunEventDto } from '../api/chatApi'
import {
  DEFAULT_HUMAN_APPROVE_OPTION,
  DEFAULT_HUMAN_CANCEL_OPTION,
  DEFAULT_HUMAN_OPTION_BUTTONS,
  DEFAULT_HUMAN_SUBMIT_OPTION,
  findPendingHumanEvent,
  humanStepEventKey,
  resolveHumanStepFooterActions,
} from './chatHumanStep'

function humanWaiting(runId: string, seq = 1): RunEventDto {
  return {
    runId,
    nodeId: 'human-input',
    parentNodeId: null,
    nodeType: 'HUMAN',
    status: 'WAITING',
    sequenceNumber: seq,
    timestamp: seq,
    output: { inputType: 'options' },
  }
}

describe('humanStepEventKey', () => {
  it('builds a stable key per waiting event', () => {
    expect(humanStepEventKey(humanWaiting('run-1', 3))).toBe('run-1:human-input:3')
  })
})

describe('findPendingHumanEvent', () => {
  it('returns null without an active run id', () => {
    expect(findPendingHumanEvent([humanWaiting('run-1')], null)).toBeNull()
  })

  it('scopes to the active run id', () => {
    expect(findPendingHumanEvent([humanWaiting('run-1'), humanWaiting('run-2')], 'run-2')?.runId).toBe(
      'run-2'
    )
  })

  it('hides after workflow cancellation', () => {
    const events: RunEventDto[] = [
      humanWaiting('run-1'),
      {
        runId: 'run-1',
        nodeId: 'system',
        parentNodeId: null,
        nodeType: 'SYSTEM',
        status: 'FAILED',
        sequenceNumber: 2,
        timestamp: 2,
        output: { status: 'CANCELLED' },
      },
    ]
    expect(findPendingHumanEvent(events, 'run-1')).toBeNull()
  })
})

describe('resolveHumanStepFooterActions', () => {
  it('defaults to approve and cancel buttons when no plugin options', () => {
    expect(resolveHumanStepFooterActions([], [])).toEqual(DEFAULT_HUMAN_OPTION_BUTTONS)
  })

  it('adds submit and cancel when plugin has text fields', () => {
    expect(
      resolveHumanStepFooterActions(
        [{ id: 'containerId', type: 'string', ui: { widget: 'STRING' } }],
        []
      )
    ).toEqual([DEFAULT_HUMAN_SUBMIT_OPTION, DEFAULT_HUMAN_CANCEL_OPTION])
  })

  it('keeps plugin options when only approval toggles are present', () => {
    const pluginOptions = [
      { label: 'Approve', approved: true },
      { label: 'Cancel', approved: false },
    ]
    expect(
      resolveHumanStepFooterActions(
        [{ id: 'approveRestart', type: 'boolean', ui: { widget: 'APPROVAL_TOGGLE' } }],
        pluginOptions
      )
    ).toEqual(pluginOptions)
  })

  it('uses approve/cancel labels in default option buttons', () => {
    expect(DEFAULT_HUMAN_OPTION_BUTTONS[0]).toEqual(DEFAULT_HUMAN_APPROVE_OPTION)
    expect(DEFAULT_HUMAN_OPTION_BUTTONS[1]).toEqual(DEFAULT_HUMAN_CANCEL_OPTION)
  })
})
