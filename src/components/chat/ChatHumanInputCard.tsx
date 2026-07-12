/**
 * Copyright (c) 2026 Olo Labs
 * SPDX-License-Identifier: Apache-2.0
 */

import type { RunEventDto } from '../../api/chatApi'
import type { HumanStepOption } from '../../lib/chatHumanStep'

export interface ChatHumanInputCardProps {
  pendingHumanEvent: RunEventDto | null
  humanPromptMessage: string
  humanStepOptions: HumanStepOption[]
  humanTaskId: string
  humanInputType: string
  humanInputText: string
  setHumanInputText: (v: string) => void
  submittingHumanInput: boolean
  onSubmit: (approved: boolean, message: string) => void
}

export function ChatHumanInputCard({
  humanPromptMessage,
  humanStepOptions,
  humanTaskId,
  humanInputType,
  humanInputText,
  setHumanInputText,
  submittingHumanInput,
  onSubmit,
}: ChatHumanInputCardProps) {
  return (
    <div className="chat-view-human-card" role="region" aria-live="polite">
      <div className="chat-view-human-message">
        <p className="chat-view-human-step-line">User Input Step: {humanPromptMessage}</p>
        {humanStepOptions.length > 0 ? (
          <ul className="chat-view-human-options-list">
            {humanStepOptions.map((o, i) => (
              <li key={`${o.label}-${i}`}>{o.label}</li>
            ))}
          </ul>
        ) : null}
      </div>
      <div className="chat-view-human-task">Task: {humanTaskId}</div>
      {humanStepOptions.length > 0 ? (
        <div className="chat-view-human-controls chat-view-human-options-row">
          {humanStepOptions.map((opt, i) => (
            <button
              key={`${opt.label}-${i}`}
              type="button"
              className={`chat-view-human-btn ${i === 0 ? 'chat-view-human-btn-primary' : ''}`}
              disabled={submittingHumanInput}
              onClick={() => {
                const approved = opt.approved !== undefined ? opt.approved : i === 0
                onSubmit(approved, opt.message ?? opt.label)
              }}
            >
              {submittingHumanInput ? 'Submitting…' : opt.label}
            </button>
          ))}
        </div>
      ) : humanInputType === 'text' ? (
        <div className="chat-view-human-controls">
          <input
            className="chat-view-human-text-input"
            placeholder="Enter your input"
            value={humanInputText}
            onChange={(e) => setHumanInputText(e.target.value)}
            disabled={submittingHumanInput}
          />
          <button
            type="button"
            className="chat-view-human-btn chat-view-human-btn-primary"
            disabled={submittingHumanInput || !humanInputText.trim()}
            onClick={() => onSubmit(true, humanInputText.trim())}
          >
            {submittingHumanInput ? 'Submitting…' : 'Submit'}
          </button>
        </div>
      ) : null}
    </div>
  )
}
