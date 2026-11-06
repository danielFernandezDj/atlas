"use client"
/**
 * Hosts Quick actions and contextual selected-miner edits/moves in one accessible
 * dialog. Dedicated creation, insertion and pallet components own their workflows;
 * this coordinator reads action options and submits selected-miner commands to
 * /api/inventory-actions, whose server services perform the actual writes.
 *
 * Navigation: modal/options/miner state; selected-miner submission; action menu; delegated workflows; selected-miner edit/move panels.
 */

import { RequiredMark } from "@/components/technician/inventory-actions/action-fields"
import { CreateMiners } from "@/components/technician/inventory-actions/creation/create-miners"
import "@/components/technician/inventory-actions/inventory-actions.css"
import { CreatePallet } from "@/components/technician/inventory-actions/pallets/create-pallet"
import { ManagePallets } from "@/components/technician/inventory-actions/pallets/manage-pallets"
import { LiveMinerSettings } from "@/components/technician/miners/live-miner-panels"
import type {
  ActionContext,
  ActionMiner,
  ActionOptions,
} from "@/lib/inventory-actions/contracts"
import type { InventoryMinerDetail } from "@/lib/miners/inventory-contracts"
import { inventoryKindLabels } from "@/lib/miners/inventory-contracts"
import { ArrowRight, MapPin, Package, Plus, X } from "lucide-react"
import { useEffect, useRef, useState, type FormEvent } from "react"
import { InsertMiners } from "./insert-miners"
import { readActionResource } from "./inventory-api"
import { LocationPicker } from "./location-picker"
import { MinerPicker } from "./miner-picker"
import {
  LocationHistory,
  MinerComponentDetails,
} from "./selected-miner-details"
export function InventoryActions({
  context,
  siteId,
  onClose,
  onSaved,
  onOpenMiner,
}: {
  context: ActionContext
  siteId: number | null
  onClose: () => void
  onSaved: () => void
  onOpenMiner: (id: number) => void
}) {
  // Shared dialog, options and selected-miner snapshot lifecycle.
  const dialog = useRef<HTMLDialogElement>(null)
  const opener = useRef<HTMLElement | null>(null)
  const [mode, setMode] = useState<
    "move" | "edit" | "create" | "insert" | "pallet" | "manage-pallets" | null
  >(context.mode ?? null)
  const [options, setOptions] = useState<ActionOptions | null>(null),
    [error, setError] = useState("")
  const [minerId, setMinerId] = useState<number | null>(
      context.minerId ?? null
    ),
    [miner, setMiner] = useState<ActionMiner | null>(null)
  const [detail, setDetail] = useState<InventoryMinerDetail | null>(null)
  const [createExpanded, setCreateExpanded] = useState(false)
  const [destination, setDestination] = useState<number | null>(null)
  const [busy, setBusy] = useState(false),
    [result, setResult] = useState<{ minerId: number; message: string } | null>(
      null
    )
  const inFlight = useRef(false),
    submission = useRef<{ fingerprint: string; key: string } | null>(null)
  const [retry, setRetry] = useState(0)
  useEffect(() => {
    opener.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null
    dialog.current?.showModal()
    return () => {
      if (opener.current?.isConnected) opener.current.focus()
    }
  }, [])
  useEffect(() => {
    const c = new AbortController()
    readActionResource<ActionOptions>({}, c.signal)
      .then(setOptions)
      .catch((e) => {
        if (!c.signal.aborted) setError(e.message)
      })
    return () => c.abort()
  }, [retry])
  useEffect(() => {
    if (!minerId) return
    const c = new AbortController()
    readActionResource<ActionMiner>(
      { resource: "miner", id: String(minerId) },
      c.signal
    )
      .then((value) => {
        if (!c.signal.aborted) setMiner(value)
      })
      .catch((e) => {
        if (!c.signal.aborted) setError(e.message)
      })
    fetch(`/api/miners/${minerId}`, { signal: c.signal, cache: "no-store" })
      .then(async (response) => {
        const body = await response.json()
        if (!response.ok)
          throw new Error(body.message ?? "Miner details unavailable.")
        if (!c.signal.aborted) setDetail(body)
      })
      .catch((e) => {
        if (!c.signal.aborted) setError(e.message)
      })
    return () => c.abort()
  }, [minerId, retry])
  function choose(
    next: "move" | "edit" | "create" | "insert" | "pallet" | "manage-pallets"
  ) {
    setMode(next)
    setError("")
  }
  // Only contextual move/edit commands are submitted here; batch and pallet flows own their saves.
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (inFlight.current || (mode !== "move" && mode !== "edit")) return
    const form = new FormData(event.currentTarget)
    const metadata = {
      modelId: form.get("modelId") ? Number(form.get("modelId")) : null,
      assetTag: String(form.get("assetTag") ?? "").trim() || null,
    }
    const payload =
      mode === "move"
        ? {
            kind: mode,
            minerId: miner!.id,
            version: miner!.version,
            locationId: destination,
            notes: String(form.get("notes") ?? "").trim(),
          }
        : {
            kind: mode,
            minerId: miner!.id,
            version: miner!.version,
            ...metadata,
            notes: String(form.get("notes") ?? "").trim(),
          }
    const fingerprint = JSON.stringify(payload)
    if (submission.current?.fingerprint !== fingerprint)
      submission.current = { fingerprint, key: crypto.randomUUID() }
    inFlight.current = true
    setBusy(true)
    setError("")
    try {
      const response = await fetch("/api/inventory-actions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...payload,
          submissionKey: submission.current!.key,
        }),
      })
      const body = await response.json()
      if (!response.ok)
        throw new Error(
          body.message ??
            "Save could not be confirmed. Retry the unchanged form."
        )
      setResult(body)
      onSaved()
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Save could not be confirmed. Retry the unchanged form."
      )
    } finally {
      inFlight.current = false
      setBusy(false)
    }
  }
  // Dialog shell delegates complete workflows instead of duplicating their draft state.
  const title = result
    ? "Action completed"
    : mode === "manage-pallets"
      ? "Manage pallets"
      : mode === "pallet"
        ? "Create pallet"
        : mode === "insert"
          ? "Insert miners"
          : mode === "create"
            ? createExpanded
              ? "Create miners"
              : "Create miner"
            : mode === "move"
              ? "Update location"
              : mode === "edit"
                ? "Update miner"
                : "Quick actions"
  return (
    <dialog
      ref={dialog}
      className={[
        "atlas-dialog",
        "atlas-inventory-action-dialog",
        mode === "insert" || (mode === "create" && createExpanded)
          ? "atlas-insert-dialog"
          : mode === "create"
            ? "atlas-create-serial-dialog"
            : mode === "pallet"
              ? "atlas-pallet-dialog"
              : "",
      ].join(" ")}
      aria-labelledby="inventory-action-title"
      onCancel={(event) => {
        event.preventDefault()
        if (!busy) onClose()
      }}
    >
      <div className="atlas-action-header">
        <div>
          <p className="atlas-eyebrow">ATLAS / INVENTORY</p>
          <h2 id="inventory-action-title">{title}</h2>
        </div>
        <button aria-label="Close actions" disabled={busy} onClick={onClose}>
          <X size={20} />
        </button>
      </div>
      <div className="atlas-action-body">
        {error && (
          <div role="alert" className="atlas-action-error">
            <p>{error}</p>
            {!options && (
              <button
                onClick={() => {
                  setError("")
                  setRetry((v) => v + 1)
                }}
              >
                Retry
              </button>
            )}
            {minerId && (
              <button
                onClick={() => {
                  setError("")
                  setMiner(null)
                  setDetail(null)
                  setRetry((v) => v + 1)
                }}
              >
                Reload miner details
              </button>
            )}
          </div>
        )}
        {result ? (
          <div className="atlas-action-success" role="status">
            <p>{result.message}</p>
            <p className="atlas-muted">
              History and your activity log have been recorded.
            </p>
            <div className="atlas-action-footer">
              <button
                className="atlas-action-primary"
                onClick={() => onOpenMiner(result.minerId)}
              >
                Open miner
                <ArrowRight size={15} />
              </button>
              <button onClick={onClose}>Done</button>
            </div>
          </div>
        ) : !options ? (
          <p role="status">Loading actions…</p>
        ) : !options.canWrite ? (
          <p role="status">
            Your Viewer account can read inventory. An Administrator, Manager or
            Technician account is required to make changes.
          </p>
        ) : !mode ? (
          <div className="atlas-action-menu">
            {[
              [
                "insert",
                "Insert miners",
                "Place existing miners in multiple available ports.",
                MapPin,
              ],
              [
                "create",
                "Create miner",
                "Register ready or scrap miners, then review and create the batch.",
                Plus,
              ],
              [
                "pallet",
                "Create pallet",
                "Add a shared pallet location at a site.",
                Package,
              ],
              [
                "manage-pallets",
                "Manage pallets",
                "View all pallets, edit details, archive or remove unused pallets.",
                Package,
              ],
            ].map(([key, label, description, Icon]) => {
              const I = Icon as typeof Plus
              return (
                <button
                  key={String(key)}
                  onClick={() =>
                    choose(
                      key as
                        | "move"
                        | "edit"
                        | "create"
                        | "insert"
                        | "pallet"
                        | "manage-pallets"
                    )
                  }
                >
                  <I size={20} />
                  <span>
                    <strong>{String(label)}</strong>
                    <small>{String(description)}</small>
                  </span>
                  <ArrowRight size={16} />
                </button>
              )
            })}
          </div>
        ) : mode === "manage-pallets" ? (
          <ManagePallets
            options={options}
            onBack={() => setMode(null)}
            onSaved={onSaved}
            onBusyChange={setBusy}
          />
        ) : mode === "pallet" ? (
          <CreatePallet
            options={options}
            siteId={siteId}
            onSaved={onSaved}
            onClose={onClose}
            onBack={() => setMode(null)}
            onBusyChange={setBusy}
          />
        ) : mode === "create" ? (
          <CreateMiners
            options={options}
            onExpandedChange={setCreateExpanded}
            onSaved={onSaved}
            onClose={onClose}
            onBack={() => {
              setCreateExpanded(false)
              setMode(null)
            }}
            onBusyChange={setBusy}
          />
        ) : mode === "insert" ? (
          <InsertMiners
            options={options}
            onSaved={onSaved}
            onClose={onClose}
            onBack={() => setMode(null)}
            onBusyChange={setBusy}
          />
        ) : (
          <>
            {!context.lockedMiner && (
              <button
                className="atlas-text-button atlas-action-back"
                disabled={busy}
                onClick={() => {
                  setMode(null)
                  setError("")
                }}
              >
                ← All actions
              </button>
            )}
            {!minerId ? (
              <MinerPicker
                onSelect={(id) => {
                  setDestination(null)
                  setMiner(null)
                  setDetail(null)
                  setMinerId(id)
                  setError("")
                }}
              />
            ) : !miner ? (
              <p role="status">Loading selected miner…</p>
            ) : (
              <div className="atlas-action-miner">
                <strong>
                  Miner #{miner.identity} · {miner.serial}
                </strong>
                <span>Current location · {miner.location}</span>
                {detail && (
                  <div className="atlas-action-company-info">
                    <span>Owner · {detail.owner}</span>
                    <span>
                      Location kind ·{" "}
                      {detail.location
                        ? inventoryKindLabels[detail.location.kind]
                        : "Not assigned"}
                    </span>
                    <span>Management · {detail.manager}</span>
                  </div>
                )}
                {!context.lockedMiner && (
                  <button
                    className="atlas-text-button"
                    disabled={busy}
                    onClick={() => {
                      setMinerId(null)
                      setMiner(null)
                      setDetail(null)
                    }}
                  >
                    Choose another miner
                  </button>
                )}
              </div>
            )}
            {miner && (
              <form
                key={`${mode}-${miner.id}-${miner.version}`}
                onSubmit={save}
                className="atlas-action-form"
              >
                <fieldset disabled={busy}>
                  {mode === "edit" && (
                    <>
                      {detail && <MinerComponentDetails miner={detail} />}
                      <div className="atlas-action-fields">
                        <label>
                          Miner model
                          <select
                            name="modelId"
                            defaultValue={miner.modelId ?? ""}
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
                            name="assetTag"
                            maxLength={200}
                            defaultValue={miner.assetTag ?? ""}
                          />
                        </label>
                      </div>
                      <section className="atlas-action-vnish">
                        <h3>VNish settings</h3>
                        <LiveMinerSettings />
                      </section>
                    </>
                  )}
                  {mode === "move" && (
                    <LocationPicker
                      options={options}
                      initialId={context.locationId}
                      siteId={siteId}
                      onSelect={setDestination}
                    />
                  )}
                  <label>
                    <span>
                      Reason / notes <RequiredMark />
                    </span>
                    <textarea
                      required
                      minLength={3}
                      maxLength={2000}
                      name="notes"
                      rows={2}
                      placeholder="Why are you making this change?"
                    />
                  </label>
                  <p className="atlas-action-save-note">
                    {mode === "move"
                      ? "Updates physical location and movement history. A move to repair keeps the miner’s reserved port."
                      : "Updates this miner’s details and records who changed them."}
                  </p>
                  <div className="atlas-action-footer">
                    <button
                      className="atlas-action-primary"
                      disabled={busy || (mode === "move" && !destination)}
                    >
                      {busy
                        ? "Saving…"
                        : mode === "move"
                          ? "Save location"
                          : "Save miner"}
                    </button>
                    <button type="button" onClick={onClose}>
                      Cancel
                    </button>
                  </div>
                </fieldset>
                {mode === "move" && detail && (
                  <LocationHistory miner={detail} />
                )}
              </form>
            )}
          </>
        )}
      </div>
    </dialog>
  )
}
