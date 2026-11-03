"use client"

import { useEffect, useRef, useState, type FormEvent } from "react"
import {
  creationEntrySchema,
  type CreationEntry,
  type ActionOptions,
  type ActionLocation,
} from "@/lib/inventory-actions/contracts"
import { RequiredMark, LocationLabel } from "./action-fields"

type ReviewEntry = CreationEntry & { pallet: ActionLocation | null }
const parts = [
  ["skeleton", "Skeleton present"],
  ["controlBoard", "One control board present"],
  ["hashboard1", "Hashboard 1 present"],
  ["hashboard2", "Hashboard 2 present"],
  ["hashboard3", "Hashboard 3 present"],
] as const
const emptyChecks = () => ({
  skeleton: false,
  controlBoard: false,
  hashboard1: false,
  hashboard2: false,
  hashboard3: false,
})
async function read<T>(
  params: Record<string, string>,
  signal?: AbortSignal
): Promise<T> {
  const response = await fetch(
    `/api/inventory-actions?${new URLSearchParams(params)}`,
    { cache: "no-store", signal }
  )
  const body = await response.json()
  if (!response.ok)
    throw new Error(body.message ?? "Registration information unavailable.")
  return body
}
export function CreateMiners({
  options,
  onExpandedChange,
  onBusyChange,
  onSaved,
  onClose,
  onBack,
}: {
  options: ActionOptions
  onExpandedChange: (expanded: boolean) => void
  onBusyChange: (busy: boolean) => void
  onSaved: () => void
  onClose: () => void
  onBack: () => void
}) {
  const [stage, setStage] = useState<"serial" | "details">("serial")
  const [serial, setSerial] = useState("")
  const [state, setState] = useState<"" | "READY" | "SCRAP">("")
  const [modelId, setModelId] = useState<number | null>(null)
  const [assetTag, setAssetTag] = useState("")
  const [notes, setNotes] = useState("")
  const [pallet, setPallet] = useState<ActionLocation | null>(null)
  const [checks, setChecks] = useState(emptyChecks)
  const [powerSupply, setPowerSupply] = useState(false)
  const [entries, setEntries] = useState<ReviewEntry[]>([])
  const [editingSerial, setEditingSerial] = useState<string | null>(null)
  const [revision, setRevision] = useState(0)
  const [checking, setChecking] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const [acknowledged, setAcknowledged] = useState(false)
  const pending = useRef<ReviewEntry | null>(null)
  const scrapDialog = useRef<HTMLDialogElement>(null)
  const finalDialog = useRef<HTMLDialogElement>(null)
  const addButton = useRef<HTMLButtonElement>(null)
  const createButton = useRef<HTMLButtonElement>(null)
  const serialInput = useRef<HTMLInputElement>(null)
  const inFlight = useRef(false)
  const checkingRef = useRef(false)
  const receipt = useRef<{ fingerprint: string; key: string } | null>(null)
  const expanded = entries.length > 0 || stage === "details" || revision > 0
  useEffect(() => {
    if (stage === "serial" && revision > 0) serialInput.current?.focus()
  }, [stage, revision])
  function reset() {
    setStage("serial")
    setSerial("")
    setState("")
    setModelId(null)
    setAssetTag("")
    setNotes("")
    setPallet(null)
    setChecks(emptyChecks())
    setPowerSupply(false)
    setEditingSerial(null)
    setError("")
    setRevision((value) => value + 1)
  }
  async function continueSerial(event: FormEvent) {
    event.preventDefault()
    if (checkingRef.current) return
    const value = serial.trim()
    if (
      entries.some(
        (entry) =>
          entry.skeletonSerial === value &&
          entry.skeletonSerial !== editingSerial
      )
    ) {
      setError("This skeleton serial is already in the review list.")
      return
    }
    checkingRef.current = true
    setChecking(true)
    onBusyChange(true)
    setError("")
    try {
      await read({ resource: "skeleton", serial: value })
      setSerial(value)
      setStage("details")
      onExpandedChange(true)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Cannot check this serial.")
    } finally {
      checkingRef.current = false
      setChecking(false)
      onBusyChange(false)
    }
  }
  function candidate(): ReviewEntry | null {
    const result = creationEntrySchema.safeParse({
      skeletonSerial: serial.trim(),
      registrationState: state,
      palletId: state === "SCRAP" ? (pallet?.id ?? null) : null,
      componentConfirmation:
        state === "SCRAP" ? { ...checks, acknowledged: true } : null,
      powerSupplyPresent: state === "SCRAP" && powerSupply,
      modelId,
      assetTag: assetTag.trim() || null,
      notes: notes.trim(),
    })
    if (!result.success) {
      setError(
        result.error.issues[0]?.message ?? "Complete the required information."
      )
      return null
    }
    if (!options.assignment) {
      setError(
        "Configure Ionic and DigitalCarpenter.io company records before creating miners."
      )
      return null
    }
    return { ...result.data, pallet: state === "SCRAP" ? pallet : null }
  }
  function queue(entry: ReviewEntry) {
    if (
      entries.some(
        (other) =>
          other.skeletonSerial === entry.skeletonSerial &&
          other.skeletonSerial !== editingSerial
      )
    ) {
      setError("Each skeleton serial can only appear once.")
      return
    }
    if (editingSerial !== null)
      setEntries(
        entries.map((other) =>
          other.skeletonSerial === editingSerial ? entry : other
        )
      )
    else if (entries.length < 25) setEntries([...entries, entry])
    reset()
  }
  function add(event: FormEvent) {
    event.preventDefault()
    const entry = candidate()
    if (!entry) return
    if (entry.registrationState === "SCRAP") {
      pending.current = entry
      setAcknowledged(false)
      scrapDialog.current?.showModal()
    } else queue(entry)
  }
  function edit(entry: ReviewEntry) {
    setEditingSerial(entry.skeletonSerial)
    setSerial(entry.skeletonSerial)
    setState(entry.registrationState)
    setModelId(entry.modelId)
    setAssetTag(entry.assetTag ?? "")
    setNotes(entry.notes)
    setPallet(entry.pallet)
    setChecks(
      entry.componentConfirmation
        ? {
            skeleton: true,
            controlBoard: true,
            hashboard1: true,
            hashboard2: true,
            hashboard3: true,
          }
        : emptyChecks()
    )
    setPowerSupply(entry.powerSupplyPresent)
    setStage("details")
    setRevision((value) => value + 1)
    setError("")
  }
  function remove(value: string) {
    setEntries(entries.filter((entry) => entry.skeletonSerial !== value))
    if (editingSerial === value) reset()
  }
  function cancelScrap() {
    scrapDialog.current?.close()
    pending.current = null
    addButton.current?.focus()
  }
  function confirmScrap() {
    if (!acknowledged || !pending.current) return
    const entry = pending.current
    scrapDialog.current?.close()
    pending.current = null
    queue(entry)
  }
  function reviewBatch() {
    if (!entries.length || serial.trim() || inFlight.current) return
    setError("")
    finalDialog.current?.showModal()
  }
  function cancelFinal() {
    if (inFlight.current) return
    finalDialog.current?.close()
    createButton.current?.focus()
  }
  async function save() {
    if (inFlight.current || !finalDialog.current?.open || !entries.length)
      return
    const payload = {
      kind: "create-batch",
      entries: entries.map((entry) => ({
        skeletonSerial: entry.skeletonSerial,
        registrationState: entry.registrationState,
        palletId: entry.palletId,
        componentConfirmation: entry.componentConfirmation,
        powerSupplyPresent: entry.powerSupplyPresent,
        modelId: entry.modelId,
        assetTag: entry.assetTag,
        notes: entry.notes,
      })),
      notes: "",
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
            "Creation could not be confirmed. Retry the unchanged batch."
        )
      finalDialog.current?.close()
      onSaved()
      onClose()
    } catch (e) {
      finalDialog.current?.close()
      setError(
        e instanceof Error ? e.message : "Creation could not be confirmed."
      )
    } finally {
      inFlight.current = false
      setBusy(false)
      onBusyChange(false)
    }
  }
  const serialForm = (
    <form className="atlas-action-form" onSubmit={continueSerial}>
      <label>
        <span>
          Skeleton serial number <RequiredMark />
        </span>
        <input
          ref={serialInput}
          required
          value={serial}
          maxLength={200}
          autoComplete="off"
          onChange={(event) => setSerial(event.target.value)}
          disabled={checking || busy}
          placeholder="Scan or enter skeleton serial"
          autoFocus
        />
      </label>
      <p className="atlas-muted">
        Start with the skeleton serial. Next, choose Ready for installation or
        Scrap.
      </p>
      <button
        className="atlas-action-primary"
        disabled={checking || busy || !serial.trim()}
      >
        {checking ? "Checking…" : "Continue"}
      </button>
    </form>
  )
  const entryForm = (
    <form className="atlas-action-form" onSubmit={add}>
      <fieldset
        disabled={
          busy || checking || (entries.length >= 25 && editingSerial === null)
        }
      >
        <div className="atlas-action-miner">
          <strong>Skeleton · {serial}</strong>
          <button
            type="button"
            className="atlas-text-button"
            onClick={() => setStage("serial")}
          >
            Change skeleton serial
          </button>
        </div>
        <div className="atlas-action-fixed-companies">
          <span>
            Owner ·{" "}
            <strong>
              {options.assignment?.owner.name ?? "Ionic (not configured)"}
            </strong>
          </span>
          <span>
            Management ·{" "}
            <strong>
              {options.assignment?.manager.name ??
                "DigitalCarpenter.io (not configured)"}
            </strong>
          </span>
        </div>
        <fieldset className="atlas-creation-state-choice">
          <legend>
            Registration state <RequiredMark />
          </legend>
          {(
            [
              [
                "READY",
                "Ready for installation",
                "Register this miner without assigning a location.",
              ],
              [
                "SCRAP",
                "Scrap",
                "Assign a pallet and confirm the required components.",
              ],
            ] as const
          ).map(([value, label, description]) => (
            <label key={value} data-selected={state === value || undefined}>
              <input
                type="radio"
                name="registration-state"
                required
                value={value}
                checked={state === value}
                onChange={() => {
                  setState(value)
                  setPallet(null)
                  setChecks(emptyChecks())
                  setPowerSupply(false)
                }}
              />
              <span>
                <strong>{label}</strong>
                <small>{description}</small>
              </span>
            </label>
          ))}
        </fieldset>
        <div className="atlas-action-fields">
          <label>
            Miner model
            <select
              value={modelId ?? ""}
              onChange={(event) =>
                setModelId(
                  event.target.value ? Number(event.target.value) : null
                )
              }
            >
              <option value="">Not recorded</option>
              {options.models.map((model) => (
                <option key={model.id} value={model.id}>
                  {model.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            Asset tag
            <input
              maxLength={200}
              value={assetTag}
              onChange={(event) => setAssetTag(event.target.value)}
            />
          </label>
        </div>
        {state === "SCRAP" && (
          <>
            <PalletPicker
              key={`pallet-${revision}`}
              options={options}
              selected={pallet}
              onSelect={setPallet}
            />
            <fieldset className="atlas-scrap-checklist">
              <legend>
                Physically confirmed components <RequiredMark />
              </legend>
              <p className="atlas-muted">
                Check each part after inspecting this miner. These confirmations
                record presence; they do not create component serial numbers or
                MAC addresses.
              </p>
              {parts.map(([key, label]) => (
                <label key={key}>
                  <input
                    type="checkbox"
                    required
                    checked={checks[key]}
                    onChange={(event) =>
                      setChecks({ ...checks, [key]: event.target.checked })
                    }
                  />
                  <span>
                    {label} <RequiredMark />
                  </span>
                </label>
              ))}
              <label>
                <input
                  type="checkbox"
                  checked={powerSupply}
                  onChange={(event) => setPowerSupply(event.target.checked)}
                />
                <span>Power supply included (optional)</span>
              </label>
            </fieldset>
          </>
        )}
        {state === "READY" && (
          <p className="atlas-muted">
            This records your readiness assessment. Deployment ports are
            assigned later through Insert miners.
          </p>
        )}
        <label>
          Notes (optional)
          <textarea
            rows={2}
            maxLength={2000}
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
          />
        </label>
        <button
          ref={addButton}
          className="atlas-action-primary"
          disabled={
            !options.assignment ||
            !state ||
            (state === "SCRAP" &&
              (!pallet || parts.some(([key]) => !checks[key])))
          }
        >
          {editingSerial ? "Update miner in list" : "Add miner"}
        </button>
      </fieldset>
    </form>
  )
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
          {stage === "serial" ? serialForm : entryForm}
          {expanded && (serial.trim() || editingSerial) && (
            <button
              className="atlas-text-button"
              disabled={busy || checking}
              onClick={reset}
            >
              {editingSerial ? "Cancel editing" : "Clear form"}
            </button>
          )}
        </section>
        {expanded && (
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
                  Add ready or scrap miners from the form. Nothing is created
                  until you confirm this list.
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
                          onClick={() => edit(entry)}
                        >
                          Edit
                          <span className="sr-only">
                            {" "}
                            {entry.skeletonSerial}
                          </span>
                        </button>
                        <button
                          className="atlas-text-button atlas-insert-remove"
                          type="button"
                          disabled={busy || checking}
                          onClick={() => remove(entry.skeletonSerial)}
                        >
                          Remove
                          <span className="sr-only">
                            {" "}
                            {entry.skeletonSerial}
                          </span>
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
                  disabled={
                    busy || checking || !entries.length || !!serial.trim()
                  }
                  onClick={reviewBatch}
                >
                  Create {entries.length || ""}{" "}
                  {entries.length === 1 ? "miner" : "miners"}
                </button>
                <button
                  type="button"
                  disabled={busy || checking}
                  onClick={onClose}
                >
                  Cancel
                </button>
              </div>
            </footer>
          </aside>
        )}
      </div>
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
            onClick={save}
          >
            {busy ? "Creating…" : "Yes, create miners"}
          </button>
        </div>
        {busy && <p role="status">Creating the whole batch…</p>}
      </dialog>
    </>
  )
}

function PalletPicker({
  options,
  selected,
  onSelect,
}: {
  options: ActionOptions
  selected: ActionLocation | null
  onSelect: (location: ActionLocation | null) => void
}) {
  const [site, setSite] = useState("")
  const [draft, setDraft] = useState("")
  const [query, setQuery] = useState("")
  const [page, setPage] = useState(1)
  const [revision, setRevision] = useState(0)
  const [data, setData] = useState<{
    items: ActionLocation[]
    total: number
  } | null>(null)
  const [error, setError] = useState("")
  useEffect(() => {
    if (!site || selected) return
    const controller = new AbortController()
    read<{ items: ActionLocation[]; total: number }>(
      {
        resource: "scrap-pallets",
        site,
        kind: "PALLET",
        search: query,
        page: String(page),
      },
      controller.signal
    )
      .then((value) => {
        if (!controller.signal.aborted) setData(value)
      })
      .catch((e) => {
        if (!controller.signal.aborted) setError(e.message)
      })
    return () => controller.abort()
  }, [site, selected, query, page, revision])
  return (
    <section className="atlas-action-picker" aria-label="Scrap pallet">
      <h3>
        Scrap pallet <RequiredMark />
      </h3>
      {selected ? (
        <div className="atlas-action-miner">
          <LocationLabel location={selected} />
          <button
            type="button"
            className="atlas-text-button"
            onClick={() => {
              onSelect(null)
              setData(null)
            }}
          >
            Choose another pallet
          </button>
        </div>
      ) : (
        <>
          <label>
            <span>
              Site <RequiredMark />
            </span>
            <select
              required
              value={site}
              onChange={(event) => {
                setSite(event.target.value)
                setPage(1)
                setData(null)
                setError("")
              }}
            >
              <option value="">Choose site</option>
              {options.sites.map((value) => (
                <option key={value.id} value={value.id}>
                  {value.name}
                </option>
              ))}
            </select>
          </label>
          <div className="atlas-action-location-search">
            <label>
              Pallet name or code
              <input
                value={draft}
                maxLength={200}
                onChange={(event) => setDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault()
                    setQuery(draft.trim())
                    setPage(1)
                    setData(null)
                    setRevision((value) => value + 1)
                  }
                }}
              />
            </label>
            <button
              type="button"
              className="atlas-chip"
              disabled={!site}
              onClick={() => {
                setQuery(draft.trim())
                setPage(1)
                setData(null)
                setRevision((value) => value + 1)
              }}
            >
              Find pallets
            </button>
          </div>
          {error && <p role="alert">{error}</p>}
          {!site ? (
            <p className="atlas-muted">
              Choose a site to see its active pallets.
            </p>
          ) : !data ? (
            <p role="status">Loading pallets…</p>
          ) : (
            <>
              <div className="atlas-action-results">
                {data.items.map((value) => (
                  <button
                    type="button"
                    key={value.id}
                    onClick={() => onSelect(value)}
                  >
                    <LocationLabel location={value} />
                  </button>
                ))}
                {!data.items.length && (
                  <p>
                    No active pallets match. Create a pallet from Quick actions
                    before adding scrap miners.
                  </p>
                )}
              </div>
              <div className="atlas-action-pagination">
                <button
                  type="button"
                  disabled={page === 1}
                  onClick={() => {
                    setPage((value) => value - 1)
                    setData(null)
                  }}
                >
                  Previous
                </button>
                <span>
                  {data.total} pallets · Page {page}
                </span>
                <button
                  type="button"
                  disabled={page * 20 >= data.total}
                  onClick={() => {
                    setPage((value) => value + 1)
                    setData(null)
                  }}
                >
                  Next
                </button>
              </div>
            </>
          )}
        </>
      )}
      <p className="atlas-muted">
        A pallet can hold several scrap miners. Only active pallets are listed.
      </p>
    </section>
  )
}
