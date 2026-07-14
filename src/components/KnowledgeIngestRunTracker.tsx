/**
 * Copyright (c) 2026 Olo Labs
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect } from 'react'
import { streamRunEvents } from '../api/chatApi'
import { knowledgeIngestStore, type KnowledgeIngestRun } from '../store/knowledgeIngestStore'

export function KnowledgeIngestRunTracker({ run }: { run: KnowledgeIngestRun }) {
  useEffect(() => {
    if (!run.runId) return
    if (run.status !== 'processing' && run.status !== 'pending') return

    const abort = streamRunEvents(
      run.runId,
      (ev) => {
        knowledgeIngestStore.getState().patchRunFromEvent(run.id, ev)
      },
      () => {
        /* keep processing until terminal event or timeout */
      }
    )
    return abort
  }, [run.id, run.runId, run.status])

  return null
}
