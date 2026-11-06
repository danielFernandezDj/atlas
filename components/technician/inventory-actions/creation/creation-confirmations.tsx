"use client"
/**
 * Renders the scrap-presence acknowledgment and final batch confirmation dialogs.
 * useCreateMiners owns refs, focus restoration and handlers: the scrap dialog only
 * stages a draft, while the final Yes action submits the reviewed batch.
 */

import type { CreateMinersFlow } from "./use-create-miners"
export function CreationConfirmations({ flow }: { flow: CreateMinersFlow }) {
  const {
    scrapDialog,
    cancelScrap,
    serial,
    acknowledged,
    setAcknowledged,
    confirmScrap,
    finalDialog,
    cancelFinal,
    entries,
    busy,
    submitBatch,
  } = flow
  return (
    <>
      <dialog
        ref={scrapDialog}
        className="atlas-dialog atlas-insert-confirmation"
        aria-labelledby="scrap-ack-title"
        onCancel={(event) => {
          event.preventDefault()
          event.stopPropagation()
          cancelScrap()
        }}
      >
        <h2 id="scrap-ack-title">Confirm scrap components</h2>
        <p>
          For skeleton {serial}, I confirm that this scrap miner has its
          skeleton, one control board and all three hashboards. A power supply
          is optional.
        </p>
        <p>
          This acknowledgment will be saved with my user account when the batch
          is created.
        </p>
        <label className="atlas-scrap-final-ack">
          <input
            type="checkbox"
            autoFocus
            checked={acknowledged}
            onChange={(event) => setAcknowledged(event.target.checked)}
          />
          <span>
            I physically checked this miner and confirm all required components
            are present.
          </span>
        </label>
        <div className="atlas-action-footer">
          <button type="button" onClick={cancelScrap}>
            Go back
          </button>
          <button
            type="button"
            className="atlas-action-primary"
            disabled={!acknowledged}
            onClick={confirmScrap}
          >
            Confirm and add to list
          </button>
        </div>
      </dialog>
      <dialog
        ref={finalDialog}
        className="atlas-dialog atlas-insert-confirmation"
        aria-labelledby="create-batch-confirm-title"
        onCancel={(event) => {
          event.preventDefault()
          event.stopPropagation()
          cancelFinal()
        }}
      >
        <h2 id="create-batch-confirm-title">
          Create {entries.length} {entries.length === 1 ? "miner" : "miners"}?
        </h2>
        <p>
          Ready for installation:{" "}
          {
            entries.filter((entry) => entry.registrationState === "READY")
              .length
          }
          . Scrap:{" "}
          {
            entries.filter((entry) => entry.registrationState === "SCRAP")
              .length
          }
          .
        </p>
        <p>
          Create these reviewed miners and record the component acknowledgments?
          Scrap miners will be placed on their selected pallets. Ready miners
          will have no assigned location.
        </p>
        <div className="atlas-action-footer">
          <button type="button" autoFocus disabled={busy} onClick={cancelFinal}>
            No, keep reviewing
          </button>
          <button
            type="button"
            className="atlas-action-primary"
            disabled={busy}
            onClick={submitBatch}
          >
            {busy ? "Creating…" : "Yes, create miners"}
          </button>
        </div>
        {busy && <p role="status">Creating the whole batch…</p>}
      </dialog>
    </>
  )
}
