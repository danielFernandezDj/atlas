"use client"
import { useEffect, useRef, useState, type FormEvent } from "react"
import { ArrowRight, MapPin, Plus, Package, X } from "lucide-react"
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
import { ManagePallets } from "./manage-pallets"
import { CreatePallet } from "./create-pallet"
import { CreateMiners } from "./create-miners"
import { RequiredMark, LocationLabel } from "./action-fields"
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
  function choose(
    next: "move" | "edit" | "create" | "insert" | "pallet" | "manage-pallets"
  ) {
    setMode(next)
    setError("")
  }
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
function MinerPicker({
  onSelect,
  searchOnly = false,
}: {
  onSelect: (id: number) => void
  searchOnly?: boolean
}) {
  const [searchRevision, setSearchRevision] = useState(0)
  const [draft, setDraft] = useState(""),
    [query, setQuery] = useState(""),
    [page, setPage] = useState(1),
    [data, setData] = useState<InventoryPage | null>(null),
    [error, setError] = useState("")
  useEffect(() => {
    if (searchOnly && searchRevision === 0) return
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
  }, [query, page, searchRevision, searchOnly])
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
      {searchOnly && searchRevision === 0 ? (
        <p className="atlas-muted">
          Search for an existing miner to add a placement.
        </p>
      ) : !data && !error ? (
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
  onChoice,
  excluded = [],
  portsOnly = false,
}: {
  onChoice?: (location: ActionLocation | null) => void
  excluded?: number[]
  portsOnly?: boolean
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
          onSelect(l.available ? l.id : null)
          onChoice?.(l.available ? l : null)
        }
      })
      .catch((e) => {
        if (!c.signal.aborted) setError(e.message)
      })
    return () => c.abort()
  }, [initialId, onSelect, onChoice])
  useEffect(() => {
    if (
      selected ||
      !site ||
      (kind === "DEPLOYMENT_SLOT" && (!building || !can))
    )
      return
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
    if (!l.available) return
    setSelected(l)
    onSelect(l.id)
    onChoice?.(l)
    setError("")
  }
  return (
    <section className="atlas-action-picker" aria-label="Destination location">
      <h3>
        Destination location <RequiredMark />
      </h3>
      {error && <p role="alert">{error}</p>}
      {selected ? (
        <div className="atlas-action-miner">
          <LocationLabel location={selected} />
          {!selected.available && (
            <span>This location is no longer available — choose another.</span>
          )}
          <button
            type="button"
            className="atlas-text-button"
            onClick={() => {
              setSelected(null)
              onSelect(null)
              onChoice?.(null)
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
              <span>
                Site <RequiredMark />
              </span>
              <select
                required
                value={site}
                onChange={(e) => {
                  setSite(e.target.value)
                  setBuilding("")
                  setCan("")
                  setPage(1)
                  setData(null)
                }}
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
                Location kind <RequiredMark />
              </span>
              <select
                required
                disabled={portsOnly}
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
                <span>
                  Building <RequiredMark />
                </span>
                <select
                  required
                  value={building}
                  disabled={!site}
                  onChange={(e) => {
                    setBuilding(e.target.value)
                    setCan("")
                    setPage(1)
                    setData(null)
                  }}
                >
                  <option value="">Choose building</option>
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
                <span>
                  Can <RequiredMark />
                </span>
                <select
                  required
                  value={can}
                  disabled={!building}
                  onChange={(e) => {
                    setCan(e.target.value)
                    setPage(1)
                    setData(null)
                  }}
                >
                  <option value="">Choose can</option>
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
          {!site || (kind === "DEPLOYMENT_SLOT" && (!building || !can)) ? (
            <p className="atlas-muted">
              Choose a site
              {kind === "DEPLOYMENT_SLOT" ? ", building and can" : ""} to see
              available locations.
            </p>
          ) : !data ? (
            <p role="status">Loading available locations…</p>
          ) : (
            <>
              <div className="atlas-action-results">
                {data.items
                  .filter((l) => !excluded.includes(l.id))
                  .map((l) => (
                    <button
                      key={l.id}
                      type="button"
                      disabled={!l.available}
                      onClick={() => choose(l)}
                    >
                      <LocationLabel location={l} />
                    </button>
                  ))}
                {!data.items.length && (
                  <p>No available locations match these filters.</p>
                )}
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
                  {data.total} available locations · Page {page}
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

function InsertMiners({
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
    get<ActionMiner>(
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
