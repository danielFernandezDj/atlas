"use client"
/**
 * Coordinates existing-miner placements in a local review list using MinerPicker
 * and LocationPicker. Add/Edit/Remove only change the draft; final confirmation
 * POSTs the whole insert batch to /api/inventory-actions for atomic server writes.
 *
 * Navigation: draft/queue state; miner reads and focus; queue management; final confirmation/submission; entry and review panels; confirmation dialog.
 */

import type {
  ActionLocation,
  ActionMiner,
  ActionOptions,
} from "@/lib/inventory-actions/contracts"
import { useEffect, useRef, useState, type FormEvent } from "react"
import { LocationLabel, RequiredMark } from "./action-fields"
import { readActionResource } from "./inventory-api"
import { LocationPicker } from "./location-picker"
import { MinerPicker } from "./miner-picker"

export function InsertMiners({
  options,
  onSaved,
  onClose,
  onBack,
  onBusyChange,
}: {
  options: ActionOptions
  onSaved: () => void
  onClose: () => void
  onBack: () => void
  onBusyChange: (busy: boolean) => void
}) {
  // Temporary placement draft and review queue.
  const [minerId, setMinerId] = useState<number | null>(null)
  const [miner, setMiner] = useState<ActionMiner | null>(null)
  const [locationId, setLocationId] = useState<number | null>(null)
  const [location, setLocation] = useState<ActionLocation | null>(null)
  const [entries, setEntries] = useState<
    { miner: ActionMiner; location: ActionLocation }[]
  >([])
  const [editingId, setEditingId] = useState<number | null>(null)
  const [revision, setRevision] = useState(0)
  const [notes, setNotes] = useState("")
  const [error, setError] = useState("")
  const [busy, setBusy] = useState(false)
  const confirmation = useRef<HTMLDialogElement>(null)
  const insertButton = useRef<HTMLButtonElement>(null)
  const entryPanel = useRef<HTMLElement>(null)
  const inFlight = useRef(false)
  const receipt = useRef<{ fingerprint: string; key: string } | null>(null)
  useEffect(() => {
    if (!minerId) return
    const controller = new AbortController()
    readActionResource<ActionMiner>(
      { resource: "miner", id: String(minerId) },
      controller.signal
    )
      .then((value) => {
        if (!controller.signal.aborted) setMiner(value)
      })
      .catch((e) => {
        if (!controller.signal.aborted) setError(e.message)
      })
    return () => controller.abort()
  }, [minerId])
  useEffect(() => {
    if (!revision) return
    const frame = requestAnimationFrame(() =>
      entryPanel.current?.querySelector<HTMLInputElement>("input")?.focus()
    )
    return () => cancelAnimationFrame(frame)
  }, [revision])
  // Local queue edits: no placement is persisted by Add, Edit or Remove.
  function resetDraft() {
    setMinerId(null)
    setMiner(null)
    setLocationId(null)
    setLocation(null)
    setEditingId(null)
    setRevision((value) => value + 1)
  }
  function add() {
    if (!miner || !location || !locationId) return
    if (
      entries.some(
        (entry) =>
          entry.miner.id !== editingId &&
          (entry.miner.id === miner.id || entry.location.id === location.id)
      )
    ) {
      setError("Each miner and port can only appear once in a batch.")
      return
    }
    if (editingId !== null)
      setEntries(
        entries.map((entry) =>
          entry.miner.id === editingId ? { miner, location } : entry
        )
      )
    else if (entries.length < 25) setEntries([...entries, { miner, location }])
    resetDraft()
    setError("")
  }
  function edit(entry: { miner: ActionMiner; location: ActionLocation }) {
    setEditingId(entry.miner.id)
    setMinerId(entry.miner.id)
    setMiner(entry.miner)
    setLocationId(null)
    setLocation(null)
    setRevision((value) => value + 1)
    setError("")
  }
  function remove(id: number) {
    setEntries(entries.filter((entry) => entry.miner.id !== id))
    if (editingId === id) resetDraft()
  }
  // Final approval and atomic submission; retain the key while the payload is unchanged.
  function requestConfirmation(event: FormEvent) {
    event.preventDefault()
    if (inFlight.current || !entries.length || minerId !== null) return
    setError("")
    confirmation.current?.showModal()
  }
  function cancelConfirmation() {
    if (inFlight.current) return
    confirmation.current?.close()
    insertButton.current?.focus()
  }
  async function save() {
    if (inFlight.current || !entries.length || !confirmation.current?.open)
      return
    const payload = {
      kind: "insert",
      entries: entries.map((entry) => ({
        minerId: entry.miner.id,
        version: entry.miner.version,
        locationId: entry.location.id,
      })),
      notes: notes.trim(),
    }
    const fingerprint = JSON.stringify(payload)
    if (receipt.current?.fingerprint !== fingerprint)
      receipt.current = { fingerprint, key: crypto.randomUUID() }
    inFlight.current = true
    setBusy(true)
    onBusyChange(true)
    try {
      const response = await fetch("/api/inventory-actions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...payload,
          submissionKey: receipt.current!.key,
        }),
      })
      const body = await response.json()
      if (!response.ok)
        throw new Error(
          body.message ??
            "Batch could not be confirmed. Retry the unchanged placements."
        )
      confirmation.current?.close()
      onSaved()
      onClose()
    } catch (e) {
      confirmation.current?.close()
      setError(e instanceof Error ? e.message : "Batch could not be confirmed.")
      insertButton.current?.focus()
    } finally {
      inFlight.current = false
      setBusy(false)
      onBusyChange(false)
    }
  }
  const editing = entries.find((entry) => entry.miner.id === editingId)
  const duplicate =
    miner &&
    entries.some(
      (entry) => entry.miner.id === miner.id && entry.miner.id !== editingId
    )
  // Entry and review panels stay coordinated around the same queue.
  return (
    <div className="atlas-insert-workspace">
      <section
        className="atlas-insert-entry-panel"
        ref={entryPanel}
        aria-label="Add miner to batch"
      >
        <button className="atlas-text-button" disabled={busy} onClick={onBack}>
          ← All actions
        </button>
        <p>
          {editingId !== null
            ? "Update this miner’s destination, then return it to the review list."
            : "Choose a miner and an available port, then add it to the review list. Nothing is saved until you confirm the batch."}
        </p>
        <p className="atlas-muted">
          <RequiredMark /> Required fields
        </p>
        {error && (
          <p role="alert" className="atlas-action-error">
            {error}
          </p>
        )}
        <fieldset
          className="atlas-insert-draft"
          disabled={busy || (entries.length >= 25 && editingId === null)}
        >
          <h3>
            {editingId !== null ? "Edit miner location" : "Miner"}{" "}
            <RequiredMark />
          </h3>
          {miner ? (
            <div className="atlas-action-miner">
              <strong>
                Miner #{miner.identity} · {miner.serial}
              </strong>
              <span>Current location · {miner.location}</span>
              {editing && (
                <span>
                  Queued destination ·{" "}
                  <LocationLabel location={editing.location} />
                </span>
              )}
              {editingId === null && (
                <button
                  type="button"
                  className="atlas-text-button"
                  onClick={() => {
                    setMinerId(null)
                    setMiner(null)
                  }}
                >
                  Choose another miner
                </button>
              )}
            </div>
          ) : minerId ? (
            <p role="status">Loading miner…</p>
          ) : (
            <MinerPicker key={revision} onSelect={setMinerId} searchOnly />
          )}
          {duplicate && (
            <p role="status" className="atlas-action-error">
              This miner is already in the review list. Edit its card or choose
              another miner.
            </p>
          )}
          <LocationPicker
            key={`port-${revision}`}
            options={options}
            initialId={editing?.location.id}
            siteId={null}
            onSelect={setLocationId}
            onChoice={setLocation}
            portsOnly
            excluded={entries
              .filter((entry) => entry.miner.id !== editingId)
              .map((entry) => entry.location.id)}
          />
          <button
            type="button"
            className="atlas-action-primary"
            disabled={!miner || !locationId || !location || !!duplicate}
            onClick={add}
          >
            {editingId !== null ? "Update location in list" : "Add miner"}
          </button>
        </fieldset>
        {(editingId !== null || minerId !== null) && (
          <button
            className="atlas-text-button"
            disabled={busy}
            onClick={resetDraft}
          >
            {editingId !== null ? "Cancel editing" : "Clear form"}
          </button>
        )}
      </section>
      <aside
        className="atlas-insert-review-panel"
        aria-label="Miners ready to insert"
      >
        <header>
          <p className="atlas-eyebrow">REVIEW</p>
          <h3>
            Miners to insert <span>{entries.length} / 25</span>
          </h3>
        </header>
        <div className="atlas-insert-review-list">
          {!entries.length ? (
            <p className="atlas-muted">
              Add miners on the left. Each miner and its destination will appear
              here for review.
            </p>
          ) : (
            <ol className="atlas-insert-queue">
              {entries.map((entry) => (
                <li
                  key={entry.miner.id}
                  data-editing={editingId === entry.miner.id || undefined}
                >
                  <div>
                    <strong>Miner #{entry.miner.identity}</strong>
                    <span>{entry.miner.serial}</span>
                    <LocationLabel location={entry.location} />
                  </div>
                  <div className="atlas-insert-card-actions">
                    <button
                      type="button"
                      className="atlas-text-button"
                      disabled={busy}
                      onClick={() => edit(entry)}
                    >
                      Edit location
                      <span className="sr-only">
                        {" "}
                        for miner {entry.miner.identity}
                      </span>
                    </button>
                    <button
                      type="button"
                      className="atlas-text-button atlas-insert-remove"
                      disabled={busy}
                      onClick={() => remove(entry.miner.id)}
                    >
                      Remove
                      <span className="sr-only">
                        {" "}
                        miner {entry.miner.identity}
                      </span>
                    </button>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </div>
        <form
          onSubmit={requestConfirmation}
          className="atlas-action-form atlas-insert-review-footer"
        >
          <label>
            <span>
              Reason / notes <RequiredMark />
            </span>
            <textarea
              required
              minLength={3}
              maxLength={2000}
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              disabled={busy}
              rows={2}
            />
          </label>
          {minerId !== null && (
            <p className="atlas-muted">
              {editingId !== null
                ? "Finish or cancel the location edit before inserting."
                : "Add or clear the miner in the entry form before inserting."}
            </p>
          )}
          <p className="atlas-muted">
            You’ll confirm {entries.length}{" "}
            {entries.length === 1 ? "placement" : "placements"} before anything
            is saved. Availability is checked again when saving.
          </p>
          <div className="atlas-action-footer">
            <button
              ref={insertButton}
              className="atlas-action-primary"
              disabled={busy || !entries.length || minerId !== null}
            >
              Insert {entries.length || ""}{" "}
              {entries.length === 1 ? "miner" : "miners"}
            </button>
            <button type="button" disabled={busy} onClick={onClose}>
              Cancel
            </button>
          </div>
        </form>
      </aside>
      <dialog
        ref={confirmation}
        className="atlas-dialog atlas-insert-confirmation"
        aria-labelledby="insert-confirmation-title"
        aria-describedby="insert-confirmation-description"
        onCancel={(event) => {
          event.preventDefault()
          event.stopPropagation()
          cancelConfirmation()
        }}
      >
        <h2 id="insert-confirmation-title">
          Insert {entries.length} {entries.length === 1 ? "miner" : "miners"}?
        </h2>
        <p id="insert-confirmation-description">
          Are you sure you want to insert these miners into their reviewed
          locations? This will update their location, port reservation and
          movement history.
        </p>
        <div className="atlas-action-footer">
          <button
            type="button"
            autoFocus
            disabled={busy}
            onClick={cancelConfirmation}
          >
            No, keep reviewing
          </button>
          <button
            type="button"
            className="atlas-action-primary"
            disabled={busy}
            onClick={save}
          >
            {busy ? "Inserting…" : "Yes, insert miners"}
          </button>
        </div>
        {busy && <p role="status">Saving all placements together…</p>}
      </dialog>
    </div>
  )
}
