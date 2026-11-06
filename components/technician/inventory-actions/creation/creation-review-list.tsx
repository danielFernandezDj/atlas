"use client"
/**
 * Displays the temporary mixed ready/scrap queue managed by useCreateMiners.
 * Edit/Remove update local entries; Create opens final confirmation and is blocked
 * while an unfinished draft is present. No request is made by this panel.
 */

import { LocationLabel } from "../action-fields"
import type { CreateMinersFlow } from "./use-create-miners"
export function CreationReviewList({ flow }: { flow: CreateMinersFlow }) {
  const {
    entries,
    editingSerial,
    busy,
    checking,
    editReviewEntry,
    removeReviewEntry,
    serial,
    createButton,
    reviewBatch,
    onClose,
  } = flow
  return (
    <aside
      className="atlas-insert-review-panel"
      aria-label="Miners ready to create"
    >
      <header>
        <p className="atlas-eyebrow">REVIEW</p>
        <h3>
          Miners to create <span>{entries.length} / 25</span>
        </h3>
      </header>
      <div className="atlas-insert-review-list">
        {!entries.length ? (
          <p className="atlas-muted">
            Add ready or scrap miners from the form. Nothing is created until
            you confirm this list.
          </p>
        ) : (
          <ol className="atlas-insert-queue">
            {entries.map((entry) => (
              <li
                key={entry.skeletonSerial}
                data-editing={
                  entry.skeletonSerial === editingSerial || undefined
                }
              >
                <div>
                  <strong>{entry.skeletonSerial}</strong>
                  <span
                    className="atlas-creation-state"
                    data-registration-state={entry.registrationState}
                  >
                    {entry.registrationState === "READY"
                      ? "Ready for installation"
                      : "Scrap"}
                  </span>
                  {entry.pallet ? (
                    <LocationLabel location={entry.pallet} />
                  ) : (
                    <span>No location assigned</span>
                  )}
                  {entry.registrationState === "SCRAP" && (
                    <small>
                      Confirmed: skeleton, control board, 3 hashboards
                      {entry.powerSupplyPresent ? ", power supply" : ""}
                    </small>
                  )}
                  {entry.notes && <span>{entry.notes}</span>}
                </div>
                <div className="atlas-insert-card-actions">
                  <button
                    className="atlas-text-button"
                    type="button"
                    disabled={busy || checking}
                    onClick={() => editReviewEntry(entry)}
                  >
                    Edit
                    <span className="sr-only"> {entry.skeletonSerial}</span>
                  </button>
                  <button
                    className="atlas-text-button atlas-insert-remove"
                    type="button"
                    disabled={busy || checking}
                    onClick={() => removeReviewEntry(entry.skeletonSerial)}
                  >
                    Remove
                    <span className="sr-only"> {entry.skeletonSerial}</span>
                  </button>
                </div>
              </li>
            ))}
          </ol>
        )}
      </div>
      <footer className="atlas-action-form atlas-insert-review-footer">
        {serial.trim() && (
          <p className="atlas-muted">
            Add or clear the miner in the form before creating the batch.
          </p>
        )}
        <p className="atlas-muted">
          Scrap acknowledgments will be recorded with your account and the
          server timestamp. All miners are created together.
        </p>
        <div className="atlas-action-footer">
          <button
            ref={createButton}
            className="atlas-action-primary"
            disabled={busy || checking || !entries.length || !!serial.trim()}
            onClick={reviewBatch}
          >
            Create {entries.length || ""}{" "}
            {entries.length === 1 ? "miner" : "miners"}
          </button>
          <button type="button" disabled={busy || checking} onClick={onClose}>
            Cancel
          </button>
        </div>
      </footer>
    </aside>
  )
}
