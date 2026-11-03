"use client"
import { useEffect, useRef, useState, type FormEvent } from "react"
import { ArrowRight, MapPin, Plus, SquarePen, X } from "lucide-react"
import type {
  ActionContext,
  ActionMiner,
  ActionLocation,
  ActionOptions,
} from "@/lib/inventory-actions/contracts"
import { LiveMinerSettings } from "./live-miner-panels"
import type { InventoryMinerDetail } from "@/lib/miners/inventory-contracts"
import {
  inventoryKindLabels,
  type InventoryPage,
} from "@/lib/miners/inventory-contracts"
import "./inventory-actions.css"
async function get<T>(
  params: Record<string, string>,
  signal?: AbortSignal
): Promise<T> {
  const response = await fetch(
    `/api/inventory-actions?${new URLSearchParams(params)}`,
    { cache: "no-store", signal }
  )
  const body = await response.json()
  if (!response.ok) throw new Error(body.message ?? "Inventory unavailable.")
  return body
}
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
  const dialog = useRef<HTMLDialogElement>(null)
  const opener = useRef<HTMLElement | null>(null)
  const [mode, setMode] = useState<"move" | "edit" | "create" | null>(
    context.mode ?? null
  )
  const [options, setOptions] = useState<ActionOptions | null>(null),
    [error, setError] = useState("")
  const [minerId, setMinerId] = useState<number | null>(
      context.minerId ?? null
    ),
    [miner, setMiner] = useState<ActionMiner | null>(null)
  const [detail, setDetail] = useState<InventoryMinerDetail | null>(null)
  const [serial, setSerial] = useState(""),
    [serialReady, setSerialReady] = useState(false)
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
    get<ActionOptions>({}, c.signal)
      .then(setOptions)
      .catch((e) => {
        if (!c.signal.aborted) setError(e.message)
      })
    return () => c.abort()
  }, [retry])
  useEffect(() => {
    if (!minerId) return
    const c = new AbortController()
    get<ActionMiner>({ resource: "miner", id: String(minerId) }, c.signal)
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
  function choose(next: "move" | "edit" | "create") {
    setMode(next)
    setError("")
  }
  async function checkSerial(event: FormEvent) {
    event.preventDefault()
    if (inFlight.current) return
    inFlight.current = true
    setBusy(true)
    setError("")
    try {
      await get({ resource: "skeleton", serial: serial.trim() })
      setSerialReady(true)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Cannot check skeleton.")
    } finally {
      inFlight.current = false
      setBusy(false)
    }
  }
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (inFlight.current || !mode) return
    const form = new FormData(event.currentTarget)
    const metadata = {
      ownerId: Number(form.get("ownerId")),
      managerId: Number(form.get("managerId")),
      modelId: form.get("modelId") ? Number(form.get("modelId")) : null,
      assetTag: String(form.get("assetTag") ?? "").trim() || null,
    }
    const payload =
      mode === "create"
        ? {
            kind: mode,
            skeletonSerial: serial.trim(),
            locationId: destination,
            ...metadata,
            notes: String(form.get("notes") ?? "").trim(),
          }
        : mode === "move"
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
              modelId: metadata.modelId,
              assetTag: metadata.assetTag,
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
  const title = result
    ? "Action completed"
    : mode === "create"
      ? "Create miner"
      : mode === "move"
        ? "Update location"
        : mode === "edit"
          ? "Update miner"
          : "Quick actions"
  return (
    <dialog
      ref={dialog}
      className="atlas-dialog atlas-inventory-action-dialog"
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
                "move",
                "Update location",
                "Move an existing miner to a deployment slot, repair, staging or a pallet.",
                MapPin,
              ],
              [
                "edit",
                "Update miner",
                "Review components and settings, or update the model and asset tag.",
                SquarePen,
              ],
              [
                "create",
                "Create miner",
                "Start with the skeleton serial number, then choose its location.",
                Plus,
              ],
            ].map(([key, label, description, Icon]) => {
              const I = Icon as typeof Plus
              return (
                <button
                  key={String(key)}
                  onClick={() => choose(key as "move" | "edit" | "create")}
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
            {mode !== "create" &&
              (!minerId ? (
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
              ))}
            {mode === "create" && !serialReady ? (
              <form onSubmit={checkSerial} className="atlas-action-form">
                <label>
                  Skeleton serial number
                  <input
                    required
                    autoComplete="off"
                    maxLength={200}
                    value={serial}
                    onChange={(e) => setSerial(e.target.value)}
                    placeholder="Scan or enter skeleton serial"
                    autoFocus
                  />
                </label>
                <p className="atlas-muted">
                  Enter the skeleton serial first to continue to the miner’s
                  details and location.
                </p>
                <button
                  className="atlas-action-primary"
                  disabled={busy || !serial.trim()}
                >
                  {busy ? "Checking…" : "Continue"}
                  <ArrowRight size={15} />
                </button>
              </form>
            ) : (
              ((mode === "create" && serialReady) ||
                (mode !== "create" && miner)) && (
                <form
                  key={`${mode}-${miner?.id ?? "new"}-${miner?.version ?? 0}`}
                  onSubmit={save}
                  className="atlas-action-form"
                >
                  <fieldset disabled={busy}>
                    {mode === "create" && (
                      <div className="atlas-action-miner">
                        <strong>Skeleton · {serial}</strong>
                        <button
                          type="button"
                          className="atlas-text-button"
                          onClick={() => setSerialReady(false)}
                        >
                          Change serial
                        </button>
                      </div>
                    )}
                    {mode === "edit" && detail && (
                      <MinerComponentDetails miner={detail} />
                    )}
                    {mode !== "move" && (
                      <div className="atlas-action-fields">
                        {mode === "create" && (
                          <>
                            <label>
                              Owner company
                              <select name="ownerId" required defaultValue="">
                                <option value="">Choose owner</option>
                                {options.companies.map((c) => (
                                  <option key={c.id} value={c.id}>
                                    {c.name}
                                  </option>
                                ))}
                              </select>
                            </label>
                            <label>
                              Management company
                              <select name="managerId" required defaultValue="">
                                <option value="">Choose manager</option>
                                {options.companies.map((c) => (
                                  <option key={c.id} value={c.id}>
                                    {c.name}
                                  </option>
                                ))}
                              </select>
                            </label>
                          </>
                        )}
                        <label>
                          Miner model
                          <select
                            name="modelId"
                            defaultValue={
                              mode === "edit" ? (miner!.modelId ?? "") : ""
                            }
                          >
                            <option value="">Not recorded</option>
                            {options.models.map((m) => (
                              <option key={m.id} value={m.id}>
                                {m.label}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label>
                          Asset tag
                          <input
                            name="assetTag"
                            maxLength={200}
                            defaultValue={
                              mode === "edit" ? (miner!.assetTag ?? "") : ""
                            }
                          />
                        </label>
                      </div>
                    )}
                    {mode !== "edit" && (
                      <LocationPicker
                        options={options}
                        initialId={context.locationId}
                        siteId={siteId}
                        onSelect={setDestination}
                      />
                    )}
                    {mode === "edit" && (
                      <section className="atlas-action-vnish">
                        <h3>VNish settings</h3>
                        <LiveMinerSettings />
                      </section>
                    )}
                    <label>
                      Reason / notes
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
                      {mode === "create"
                        ? "Creates the miner and skeleton, records its initial location, and reserves a port when configured."
                        : mode === "move"
                          ? "Updates physical location and movement history. A move to repair keeps the miner’s reserved port."
                          : "Updates this miner’s details and records who changed them."}
                    </p>
                    <div className="atlas-action-footer">
                      <button
                        className="atlas-action-primary"
                        disabled={busy || (mode !== "edit" && !destination)}
                      >
                        {busy
                          ? "Saving…"
                          : mode === "create"
                            ? "Create miner"
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
              )
            )}
          </>
        )}
      </div>
    </dialog>
  )
}
function MinerPicker({ onSelect }: { onSelect: (id: number) => void }) {
  const [searchRevision, setSearchRevision] = useState(0)
  const [draft, setDraft] = useState(""),
    [query, setQuery] = useState(""),
    [page, setPage] = useState(1),
    [data, setData] = useState<InventoryPage | null>(null),
    [error, setError] = useState("")
  useEffect(() => {
    const c = new AbortController()
    fetch(
      `/api/miners?${new URLSearchParams({ search: query, page: String(page), pageSize: "8" })}`,
      { signal: c.signal, cache: "no-store" }
    )
      .then(async (r) => {
        const b = await r.json()
        if (!r.ok) throw new Error(b.message)
        if (!c.signal.aborted) setData(b)
      })
      .catch((e) => {
        if (!c.signal.aborted) setError(e.message)
      })
    return () => c.abort()
  }, [query, page, searchRevision])
  return (
    <section className="atlas-action-picker" aria-label="Choose a miner">
      <form
        onSubmit={(e) => {
          e.preventDefault()
          setData(null)
          setError("")
          setPage(1)
          setQuery(draft.trim())
          setSearchRevision((v) => v + 1)
        }}
      >
        <label>
          Find a miner
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            maxLength={200}
            placeholder="ID, serial, component serial or MAC"
          />
        </label>
        <button className="atlas-chip">Find miners</button>
      </form>
      {error && <p role="alert">{error}</p>}
      {!data && !error ? (
        <p role="status">Loading miners…</p>
      ) : (
        <>
          <div className="atlas-action-results">
            {data?.items.map((m) => (
              <button key={m.id} type="button" onClick={() => onSelect(m.id)}>
                <strong>
                  #{m.identity} · {m.serial}
                </strong>
                <span>{m.location?.label ?? "Not assigned"}</span>
              </button>
            ))}
            {data && !data.items.length && <p>No matching miners.</p>}
          </div>
          {data && (
            <div className="atlas-action-pagination">
              <button
                disabled={page === 1}
                onClick={() => {
                  setData(null)
                  setPage((v) => v - 1)
                }}
              >
                Previous
              </button>
              <span>
                {data.total} miners · Page {page}
              </span>
              <button
                disabled={page * 8 >= data.total}
                onClick={() => {
                  setData(null)
                  setPage((v) => v + 1)
                }}
              >
                Next
              </button>
            </div>
          )}
        </>
      )}
    </section>
  )
}
function LocationPicker({
  options,
  initialId,
  siteId,
  onSelect,
}: {
  options: ActionOptions
  initialId?: number
  siteId: number | null
  onSelect: (id: number | null) => void
}) {
  const [searchRevision, setSearchRevision] = useState(0)
  const [selected, setSelected] = useState<ActionLocation | null>(null),
    [site, setSite] = useState(siteId ? String(siteId) : ""),
    [kind, setKind] = useState("DEPLOYMENT_SLOT"),
    [building, setBuilding] = useState(""),
    [can, setCan] = useState(""),
    [draft, setDraft] = useState(""),
    [query, setQuery] = useState(""),
    [page, setPage] = useState(1),
    [error, setError] = useState("")
  const [data, setData] = useState<{
    items: ActionLocation[]
    total: number
  } | null>(null)
  useEffect(() => {
    onSelect(null)
    if (!initialId) return
    const c = new AbortController()
    get<ActionLocation>(
      { resource: "location", id: String(initialId) },
      c.signal
    )
      .then((l) => {
        if (!c.signal.aborted) {
          setSelected(l)
          onSelect(l.active ? l.id : null)
        }
      })
      .catch((e) => {
        if (!c.signal.aborted) setError(e.message)
      })
    return () => c.abort()
  }, [initialId, onSelect])
  useEffect(() => {
    if (selected) return
    const c = new AbortController()
    get<{ items: ActionLocation[]; total: number }>(
      {
        resource: "locations",
        site,
        kind,
        building,
        can,
        search: query,
        page: String(page),
      },
      c.signal
    )
      .then((b) => {
        if (!c.signal.aborted) setData(b)
      })
      .catch((e) => {
        if (!c.signal.aborted) setError(e.message)
      })
    return () => c.abort()
  }, [selected, site, kind, building, can, query, page, searchRevision])
  function choose(l: ActionLocation) {
    setSelected(l)
    onSelect(l.id)
    setError("")
  }
  return (
    <section className="atlas-action-picker" aria-label="Destination location">
      <h3>Destination location</h3>
      {error && <p role="alert">{error}</p>}
      {selected ? (
        <div className="atlas-action-miner">
          <strong>{selected.label}</strong>
          {!selected.active && <span>Inactive location — choose another.</span>}
          <button
            type="button"
            className="atlas-text-button"
            onClick={() => {
              setSelected(null)
              onSelect(null)
              setData(null)
            }}
          >
            Choose another location
          </button>
        </div>
      ) : (
        <>
          <div className="atlas-action-fields">
            <label>
              Site
              <select
                value={site}
                onChange={(e) => {
                  setSite(e.target.value)
                  setBuilding("")
                  setCan("")
                  setPage(1)
                  setData(null)
                }}
              >
                <option value="">All sites</option>
                {options.sites.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Location kind
              <select
                value={kind}
                onChange={(e) => {
                  setKind(e.target.value)
                  setBuilding("")
                  setCan("")
                  setPage(1)
                  setData(null)
                }}
              >
                {["DEPLOYMENT_SLOT", "REPAIR", "STAGING", "PALLET"].map((k) => (
                  <option key={k} value={k}>
                    {k.replaceAll("_", " ").toLowerCase()}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {kind === "DEPLOYMENT_SLOT" && (
            <div className="atlas-action-fields">
              <label>
                Building
                <select
                  value={building}
                  disabled={!site}
                  onChange={(e) => {
                    setBuilding(e.target.value)
                    setCan("")
                    setPage(1)
                    setData(null)
                  }}
                >
                  <option value="">All buildings</option>
                  {options.sites
                    .find((s) => s.id === Number(site))
                    ?.buildings.map((b) => (
                      <option key={b.id} value={b.id}>
                        Building {b.building_number}
                      </option>
                    ))}
                </select>
              </label>
              <label>
                Can
                <select
                  value={can}
                  disabled={!building}
                  onChange={(e) => {
                    setCan(e.target.value)
                    setPage(1)
                    setData(null)
                  }}
                >
                  <option value="">All cans</option>
                  {options.sites
                    .find((s) => s.id === Number(site))
                    ?.buildings.find((b) => b.id === Number(building))
                    ?.cans.map((c) => (
                      <option key={c.id} value={c.id}>
                        Can {c.can_number}
                      </option>
                    ))}
                </select>
              </label>
            </div>
          )}
          <div className="atlas-action-location-search">
            <label>
              {kind === "DEPLOYMENT_SLOT"
                ? "Port index (row/column) or location code"
                : "Location name or code"}
              <input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                maxLength={200}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault()
                    setData(null)
                    setPage(1)
                    setQuery(draft.trim())
                    setSearchRevision((v) => v + 1)
                  }
                }}
              />
            </label>
            <button
              type="button"
              className="atlas-chip"
              onClick={() => {
                setData(null)
                setPage(1)
                setQuery(draft.trim())
                setSearchRevision((v) => v + 1)
              }}
            >
              Find locations
            </button>
          </div>
          {!data ? (
            <p role="status">Loading locations…</p>
          ) : (
            <>
              <div className="atlas-action-results">
                {data.items.map((l) => (
                  <button
                    key={l.id}
                    type="button"
                    disabled={!l.active}
                    onClick={() => choose(l)}
                  >
                    {l.label}
                    {!l.active && " · Inactive"}
                  </button>
                ))}
                {!data.items.length && <p>No matching locations.</p>}
              </div>
              <div className="atlas-action-pagination">
                <button
                  type="button"
                  disabled={page === 1}
                  onClick={() => {
                    setData(null)
                    setPage((v) => v - 1)
                  }}
                >
                  Previous
                </button>
                <span>
                  {data.total} locations · Page {page}
                </span>
                <button
                  type="button"
                  disabled={page * 20 >= data.total}
                  onClick={() => {
                    setData(null)
                    setPage((v) => v + 1)
                  }}
                >
                  Next
                </button>
              </div>
            </>
          )}
        </>
      )}
    </section>
  )
}

function MinerComponentDetails({ miner }: { miner: InventoryMinerDetail }) {
  return (
    <section className="atlas-action-components">
      <h3>Component information</h3>
      <dl>
        {[
          ["Skeleton serial", miner.skeleton?.serial ?? miner.serial],
          ["Control board serial", miner.controlBoard?.serial],
          ["Control board MAC", miner.controlBoard?.mac],
          ...[1, 2, 3].map((n) => {
            const b = miner.boards.find((b) => b.position === `SLOT_${n}`)
            return [
              `Hashboard ${n} serial`,
              b?.serial ??
                (b ? `ID #${b.id} · Serial not recorded` : "Not assigned"),
            ]
          }),
        ].map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{value ?? "Not recorded"}</dd>
          </div>
        ))}
      </dl>
    </section>
  )
}
function LocationHistory({ miner }: { miner: InventoryMinerDetail }) {
  return (
    <section className="atlas-action-location-history">
      <h3>Location history · {miner.movementCount} total</h3>
      <p className="atlas-muted">Latest 20 movements · Central Time</p>
      {miner.movements.length ? (
        <ol>
          {miner.movements.map((m) => (
            <li key={m.id}>
              <strong>
                {m.from} → {m.to}
              </strong>
              <span>
                {new Date(m.occurredAt).toLocaleString("en-US", {
                  timeZone: "America/Chicago",
                })}{" "}
                · {m.by}
              </span>
              <p>
                {m.reason}
                {m.notes ? ` · ${m.notes}` : ""}
              </p>
            </li>
          ))}
        </ol>
      ) : (
        <p>No movements recorded.</p>
      )}
    </section>
  )
}
