"use client"
/**
 * Coordinates the Create miner screen using useCreateMiners and the separate draft,
 * review-list and confirmation components. Adding a miner stages a local entry; only
 * the final confirmed batch reaches /api/inventory-actions through the workflow hook.
 */

import { CreationConfirmations } from "./creation-confirmations"
import { CreationDraftForm, SkeletonSerialForm } from "./creation-draft"
import type { CreateMinersProps } from "./creation-model"
import { CreationReviewList } from "./creation-review-list"
import { useCreateMiners } from "./use-create-miners"
export function CreateMiners(props: CreateMinersProps) {
  const flow = useCreateMiners(props)
  const {
    expanded,
    busy,
    checking,
    onBack,
    error,
    stage,
    serial,
    editingSerial,
    resetDraft,
  } = flow
  return (
    <>
      <div
        className={
          expanded ? "atlas-insert-workspace" : "atlas-create-serial-step"
        }
      >
        <section
          className={
            expanded ? "atlas-insert-entry-panel" : "atlas-create-serial-entry"
          }
          aria-label="Miner registration form"
        >
          <button
            className="atlas-text-button"
            disabled={busy || checking}
            onClick={onBack}
          >
            ← All actions
          </button>
          {expanded && (
            <p>
              Create a mixed batch of ready and scrap miners. Review the list
              before saving.
            </p>
          )}
          {error && (
            <p role="alert" className="atlas-action-error">
              {error}
            </p>
          )}
          {stage === "serial" ? (
            <SkeletonSerialForm flow={flow} />
          ) : (
            <CreationDraftForm flow={flow} />
          )}
          {expanded && (serial.trim() || editingSerial) && (
            <button
              className="atlas-text-button"
              disabled={busy || checking}
              onClick={resetDraft}
            >
              {editingSerial ? "Cancel editing" : "Clear form"}
            </button>
          )}
        </section>
        {expanded && <CreationReviewList flow={flow} />}
      </div>
      <CreationConfirmations flow={flow} />
    </>
  )
}
