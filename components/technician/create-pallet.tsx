"use client"
import { useRef, useState, type FormEvent } from "react"
import {
  createPalletSchema,
  type ActionOptions,
} from "@/lib/inventory-actions/contracts"
import { RequiredMark } from "./action-fields"
type Result = {
  locationId: number
  name: string
  code: string
  siteName: string
  message: string
}
export function CreatePallet({
  options,
  siteId,
  onSaved,
  onClose,
  onBack,
  onBusyChange,
}: {
  options: ActionOptions
  siteId: number | null
  onSaved: () => void
  onClose: () => void
  onBack: () => void
  onBusyChange: (busy: boolean) => void
}) {
  const [site, setSite] = useState(
    siteId && options.sites.some((s) => s.id === siteId) ? String(siteId) : ""
  )
  const [name, setName] = useState(""),
    [code, setCode] = useState(""),
    [notes, setNotes] = useState("")
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [result, setResult] = useState<Result | null>(null)
  const inFlight = useRef(false),
    receipt = useRef<{ fingerprint: string; key: string } | null>(null)
  async function save(event: FormEvent) {
    event.preventDefault()
    if (inFlight.current) return
    const payload = {
        kind: "create-pallet",
        siteId: Number(site),
        name: name.trim(),
        code: code.trim().toUpperCase(),
        notes: notes.trim(),
      },
      fingerprint = JSON.stringify(payload)
    if (receipt.current?.fingerprint !== fingerprint)
      receipt.current = { fingerprint, key: crypto.randomUUID() }
    const parsed = createPalletSchema.safeParse({
      ...payload,
      submissionKey: receipt.current!.key,
    })
    if (!parsed.success) {
      setError(
        parsed.error.issues[0]?.message ?? "Complete the required fields."
      )
      return
    }
    inFlight.current = true
    setBusy(true)
    onBusyChange(true)
    setError("")
    try {
      const response = await fetch("/api/inventory-actions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(parsed.data),
      })
      const body = await response.json()
      if (!response.ok)
        throw new Error(
          body.message ??
            "Creation could not be confirmed. Retry the unchanged form."
        )
      setResult(body)
      onSaved()
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Creation could not be confirmed."
      )
    } finally {
      inFlight.current = false
      setBusy(false)
      onBusyChange(false)
    }
  }
  if (result)
    return (
      <section className="atlas-action-success" role="status">
        <h3>Pallet created</h3>
        <div className="atlas-action-miner">
          <strong>
            {result.name} · {result.code}
          </strong>
          <span>{result.siteName}</span>
        </div>
        <p>
          Available now in Scrap creation, location selection and port-action
          pallet destinations.
        </p>
        <button
          type="button"
          className="atlas-action-primary"
          onClick={onClose}
        >
          Done
        </button>
      </section>
    )
  return (
    <>
      <button
        type="button"
        className="atlas-text-button atlas-action-back"
        disabled={busy}
        onClick={onBack}
      >
        ← All actions
      </button>
      <p className="atlas-muted">
        Create a shared pallet location at a site. Several miners can be
        assigned to the same pallet.
      </p>
      {error && (
        <p role="alert" className="atlas-action-error">
          {error}
        </p>
      )}
      <form
        className="atlas-action-form atlas-create-pallet-form"
        onSubmit={save}
      >
        <fieldset disabled={busy}>
          <label>
            <span>
              Site <RequiredMark />
            </span>
            <select
              required
              value={site}
              onChange={(e) => setSite(e.target.value)}
            >
              <option value="">Choose site</option>
              {options.sites.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>
              Pallet name <RequiredMark />
            </span>
            <input
              required
              autoFocus
              autoComplete="off"
              maxLength={200}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Pallet 001"
            />
          </label>
          <label>
            <span>
              Pallet code <RequiredMark />
            </span>
            <input
              required
              autoComplete="off"
              maxLength={100}
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="PALLET-001"
              aria-describedby="pallet-code-hint"
            />
          </label>
          <p id="pallet-code-hint" className="atlas-muted">
            A unique code at this site. Letters, numbers, dots, hyphens and
            underscores are allowed.
          </p>
          <label>
            Notes (optional)
            <textarea
              rows={2}
              maxLength={2000}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </label>
          <div className="atlas-action-footer">
            <button
              className="atlas-action-primary"
              disabled={!site || !name.trim() || !code.trim()}
            >
              {busy ? "Creating…" : "Create pallet"}
            </button>
            <button type="button" onClick={onClose}>
              Cancel
            </button>
          </div>
        </fieldset>
      </form>
    </>
  )
}
