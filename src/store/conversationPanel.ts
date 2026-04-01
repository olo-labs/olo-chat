/**
 * Copyright (c) 2026 Olo Labs
 * SPDX-License-Identifier: Apache-2.0
 */

import { create } from 'zustand'

/** Queue (from GET .../queues) and pipeline (from queue config) selected in the Conversation panel; scopes session list and new sessions. */
export interface ConversationPanelState {
  selectedQueueId: string
  setSelectedQueueId: (id: string) => void
  selectedPipelineId: string
  setSelectedPipelineId: (id: string) => void
}

export const conversationPanelStore = create<ConversationPanelState>((set) => ({
  selectedQueueId: '',
  setSelectedQueueId: (selectedQueueId) => set({ selectedQueueId }),
  selectedPipelineId: '',
  setSelectedPipelineId: (selectedPipelineId) => set({ selectedPipelineId }),
}))
