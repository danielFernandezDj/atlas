"use client"
import { useEffect, useRef, useState, type FormEvent } from "react"
import { X } from "lucide-react"
import {
  portOperationLabels,
  portCommandSchema,
  type PortOptions,
  type PortOperation,
} from "@/lib/port-actions/contracts"
import type { ActionMiner } from "@/lib/inventory-actions/contracts"
import { MinerInventorySearch } from "./live-miner-workspace"
import { RequiredMark } from "./action-fields"
import "./inventory-actions.css"
async function read<T>(url: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(url, { cache: "no-store", signal })
  const body = await response.json()
  if (!response.ok)
    throw new Error(body.message ?? "Port information unavailable.")
  return body
}
export function PortActions({
  locationId,
  operation,
  onClose,
  onSaved,
}: {
  locationId: number
  operation: PortOperation
  onClose: () => void
  onSaved: () => void
}) {
  const dialog = useRef<HTMLDialogElement>(null),
    opener = useRef<HTMLElement | null>(null)
  const [data, setData] = useState<PortOptions | null>(null),
    [error, setError] = useState("")
  const [revision, setRevision] = useState(0),
    [incomingId, setIncomingId] = useState<number | null>(null),
    [incoming, setIncoming] = useState<ActionMiner | null>(null)
  const [disposition, setDisposition] = useState<
      "REPAIR" | "STAGING" | "PALLET" | "UNASSIGNED"
    >("REPAIR"),
    [destinationId, setDestinationId] = useState<number | null>(null)
  const [keepReservation, setKeepReservation] = useState(true),
    [notes, setNotes] = useState(""),
    [busy, setBusy] = useState(false)
  const inFlight = useRef(false),
    receipt = useRef<{ fingerprint: string; key: string } | null>(null)
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
    const controller = new AbortController()
    read<PortOptions>(
      `/api/port-actions?locationId=${locationId}`,
      controller.signal
    )
      .then((value) => {
        if (!controller.signal.aborted) setData(value)
      })
      .catch((e) => {
        if (!controller.signal.aborted) setError(e.message)
      })
    return () => controller.abort()
  }, [locationId, revision])
  useEffect(() => {
    if (!incomingId) return
    const controller = new AbortController()
    read<ActionMiner>(
      `/api/inventory-actions?resource=miner&id=${incomingId}`,
      controller.signal
    )
      .then((value) => {
        if (!controller.signal.aborted) setIncoming(value)
      })
      .catch((e) => {
        if (!controller.signal.aborted) setError(e.message)
      })
    return () => controller.abort()
  }, [incomingId])
  function reload() {
    setData(null)
    setIncoming(null)
    setIncomingId(null)
    setDestinationId(null)
    setError("")
    setRevision((value) => value + 1)
  }
  const port = data?.port
  const needsIncoming = operation === "add" || operation === "replace"
  const relocates =
    operation === "pull" || (operation === "replace" && !!port?.occupant)
  async function save(event: FormEvent) {
    event.preventDefault()
    if (inFlight.current || !port) return
    const payload = {
      operation,
      locationId,
      snapshot: port.snapshot,
      incoming:
        needsIncoming && incoming
          ? { id: incoming.id, version: incoming.version }
          : null,
      disposition: relocates ? disposition : "UNASSIGNED",
      destinationId:
        relocates && disposition !== "UNASSIGNED" ? destinationId : null,
      keepReservation:
        operation === "pull" &&
        disposition === "REPAIR" &&
        keepReservation &&
        port.portActive &&
        port.hierarchyActive &&
        port.switchActive,
      notes: notes.trim(),
    }
    const fingerprint = JSON.stringify(payload)
    if (receipt.current?.fingerprint !== fingerprint)
      receipt.current = { fingerprint, key: crypto.randomUUID() }
    const command = { ...payload, submissionKey: receipt.current!.key },
      parsed = portCommandSchema.safeParse(command)
    if (!parsed.success) {
      setError(
        parsed.error.issues[0]?.message ?? "Complete the required information."
      )
      return
    }
    inFlight.current = true
    setBusy(true)
    setError("")
    try {
      const response = await fetch("/api/port-actions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(command),
      })
      const body = await response.json()
      if (!response.ok)
        throw new Error(
          body.message ??
            "Save could not be confirmed. Retry the unchanged form."
        )
      onSaved()
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save could not be confirmed.")
    } finally {
      inFlight.current = false
      setBusy(false)
    }
  }
  return (
    <dialog
      ref={dialog}
      className="atlas-dialog atlas-inventory-action-dialog atlas-port-workflow"
      aria-labelledby="port-action-title"
      onCancel={(event) => {
        event.preventDefault()
        if (!busy) onClose()
      }}
    >
      <div className="atlas-action-header">
        <div>
          <p className="atlas-eyebrow">SITE MAP / PORT ACTION</p>
          <h2 id="port-action-title">
            {portOperationLabels[operation]}
            {port ? ` · ${port.coordinate}` : ""}
          </h2>
        </div>
        <button
          aria-label="Close port action"
          disabled={busy}
          onClick={onClose}
        >
          <X size={20} />
        </button>
      </div>
      <div className="atlas-action-body">
        {error && (
          <div role="alert" className="atlas-action-error">
            <p>{error}</p>
            <button type="button" disabled={busy} onClick={reload}>
              Reload current port
            </button>
          </div>
        )}
        {!data ? (
          !error && <p role="status">Loading port…</p>
        ) : !data.canWrite ? (
          <p>
            Your account has read-only inventory access. A Technician, Manager
            or Administrator is required for port actions.
          </p>
        ) : (
          <>
            <div className="atlas-action-miner">
              <strong>Grid location {port!.coordinate}</strong>
              <span>{port!.label}</span>
              <span>
                Network switch {port!.switchName} · Socket {port!.socket}{" "}
                (separate from the grid coordinate)
              </span>
              <span>{port!.portActive ? "Enabled" : "Disabled"}</span>
            </div>
            {data.lastChange && (
              <section className="atlas-port-last-change">
                <h3>Last port change</h3>
                <p>
                  {data.lastChange.action.replaceAll("_", " ").toLowerCase()} ·{" "}
                  {data.lastChange.by} ·{" "}
                  {new Date(data.lastChange.at).toLocaleString("en-US", {
                    timeZone: "America/Chicago",
                  })}{" "}
                  CT
                </p>
                <p>{data.lastChange.notes ?? "No note recorded."}</p>
              </section>
            )}
            {port!.conflict && (
              <p role="alert" className="atlas-action-error">
                Conflicting assignments must be reconciled before using this
                port.
              </p>
            )}
            <fieldset disabled={busy} className="atlas-port-action-fields">
              {port!.occupant && (
                <section>
                  <h3>Miner at this port</h3>
                  <div className="atlas-action-miner">
                    <strong>
                      #{port!.occupant.identity} · {port!.occupant.serial}
                    </strong>
                    <span>{port!.occupant.location}</span>
                  </div>
                </section>
              )}
              {port!.reservation &&
                port!.reservation.id !== port!.occupant?.id && (
                  <section>
                    <h3>Reserved miner</h3>
                    <div className="atlas-action-miner">
                      <strong>
                        #{port!.reservation.identity} ·{" "}
                        {port!.reservation.serial}
                      </strong>
                      <span>
                        Current location · {port!.reservation.location}
                      </span>
                    </div>
                  </section>
                )}
              {operation === "disable" && (
                <p className="atlas-inline-notice">
                  Disabling marks this port unavailable and releases its
                  reservation. A miner assigned here becomes Unassigned in
                  Atlas. A reserved miner already elsewhere keeps its physical
                  location. A reason is required.
                </p>
              )}
              {operation === "enable" && (
                <p className="atlas-inline-notice">
                  Re-enable this port for use. Previous reservations will not be
                  restored.
                </p>
              )}
              {operation === "release" && (
                <p className="atlas-inline-notice">
                  Release this port’s reservation. The miner remains at its
                  recorded physical location.
                </p>
              )}
              {operation === "return" && (
                <p className="atlas-inline-notice">
                  Return the reserved miner to this grid location and record the
                  movement.
                </p>
              )}
              {operation === "replace" &&
                port!.reservation &&
                !port!.occupant && (
                  <p className="atlas-inline-notice">
                    The old reservation will be released. Its miner keeps the
                    location shown above.
                  </p>
                )}
              {needsIncoming && (
                <section className="atlas-port-incoming">
                  <h3>
                    Incoming miner <RequiredMark />
                  </h3>
                  <p className="atlas-muted">
                    The incoming miner will move here. Any previous port
                    reservation for it will be released.
                  </p>
                  {incoming ? (
                    <div className="atlas-action-miner">
                      <strong>
                        #{incoming.identity} · {incoming.serial}
                      </strong>
                      <span>Current location · {incoming.location}</span>
                      <button
                        type="button"
                        className="atlas-text-button"
                        onClick={() => {
                          setIncoming(null)
                          setIncomingId(null)
                        }}
                      >
                        Choose another miner
                      </button>
                    </div>
                  ) : incomingId ? (
                    <p role="status">Loading selected miner…</p>
                  ) : (
                    <MinerInventorySearch
                      key={revision}
                      sites={data.sites.map((site) => ({
                        ...site,
                        is_active: true,
                      }))}
                      initialSite={null}
                      onSelect={(id) => {
                        setIncoming(null)
                        setIncomingId(id)
                      }}
                    />
                  )}
                </section>
              )}
              {relocates && (
                <section>
                  <h3>
                    {operation === "replace"
                      ? "Outgoing miner destination"
                      : "Reason for pulling"}{" "}
                    <RequiredMark />
                  </h3>
                  <label className="atlas-port-reason-label">
                    Action
                    <select
                      value={disposition}
                      onChange={(event) => {
                        const value = event.target.value as typeof disposition
                        setDisposition(value)
                        setDestinationId(null)
                        setKeepReservation(value === "REPAIR")
                      }}
                    >
                      <option value="REPAIR">Send to repair</option>
                      <option value="STAGING">Move to staging</option>
                      <option value="PALLET">Move to a pallet</option>
                      <option value="UNASSIGNED">
                        Disconnect / mark Unassigned in Atlas
                      </option>
                    </select>
                  </label>
                  {disposition !== "UNASSIGNED" ? (
                    <PortDestinationPicker
                      key={`${revision}-${disposition}`}
                      sites={data.sites}
                      initialSite={port!.siteId}
                      kind={disposition}
                      onSelect={setDestinationId}
                    />
                  ) : (
                    <p className="atlas-muted">
                      The miner’s physical location becomes Unassigned. No
                      destination will be invented.
                    </p>
                  )}
                  {operation === "pull" &&
                    disposition === "REPAIR" &&
                    port!.portActive &&
                    port!.hierarchyActive &&
                    port!.switchActive && (
                      <label className="atlas-port-keep-reservation">
                        <input
                          type="checkbox"
                          checked={keepReservation}
                          onChange={(event) =>
                            setKeepReservation(event.target.checked)
                          }
                        />
                        Keep this port reserved for the miner while in repair
                      </label>
                    )}
                </section>
              )}
            </fieldset>
            <form className="atlas-action-form" onSubmit={save}>
              <label>
                <span>
                  Reason / notes <RequiredMark />
                </span>
                <textarea
                  required
                  minLength={3}
                  maxLength={2000}
                  rows={3}
                  disabled={busy}
                  value={notes}
                  onChange={(event) => setNotes(event.target.value)}
                  placeholder="Explain why you are making this change"
                />
              </label>
              <p className="atlas-muted">
                This updates Atlas inventory and history. It does not send a
                power-off or network command to the miner.
              </p>
              <div className="atlas-action-footer">
                <button
                  className={[
                    "atlas-action-primary",
                    operation === "disable" ? "atlas-port-danger" : "",
                  ].join(" ")}
                  disabled={
                    busy ||
                    port!.conflict ||
                    (needsIncoming && !incoming) ||
                    (relocates &&
                      disposition !== "UNASSIGNED" &&
                      !destinationId)
                  }
                >
                  {busy ? "Saving…" : portOperationLabels[operation]}
                </button>
                <button type="button" disabled={busy} onClick={onClose}>
                  Cancel
                </button>
              </div>
            </form>
          </>
        )}
      </div>
    </dialog>
  )
}
function PortDestinationPicker({
  sites,
  initialSite,
  kind,
  onSelect,
}: {
  sites: { id: number; name: string }[]
  initialSite: number
  kind: "REPAIR" | "STAGING" | "PALLET"
  onSelect: (id: number | null) => void
}) {
  const [site, setSite] = useState(String(initialSite)),
    [draft, setDraft] = useState(""),
    [query, setQuery] = useState(""),
    [page, setPage] = useState(1),
    [revision, setRevision] = useState(0)
  const [selected, setSelected] = useState<{
      id: number
      label: string
    } | null>(null),
    [data, setData] = useState<{
      items: { id: number; label: string }[]
      total: number
    } | null>(null),
    [error, setError] = useState("")
  useEffect(() => {
    if (selected) return
    const controller = new AbortController()
    read<{ items: { id: number; label: string }[]; total: number }>(
      `/api/port-actions?${new URLSearchParams({ resource: "destinations", site, kind, search: query, page: String(page) })}`,
      controller.signal
    )
      .then((value) => {
        if (!controller.signal.aborted) setData(value)
      })
      .catch((e) => {
        if (!controller.signal.aborted) setError(e.message)
      })
    return () => controller.abort()
  }, [site, kind, query, page, revision, selected])
  return (
    <section
      className="atlas-action-picker"
      aria-label="Outgoing miner location"
    >
      {selected ? (
        <div className="atlas-action-miner">
          <strong>{selected.label}</strong>
          <button
            type="button"
            className="atlas-text-button"
            onClick={() => {
              setSelected(null)
              onSelect(null)
            }}
          >
            Choose another destination
          </button>
        </div>
      ) : (
        <>
          <div className="atlas-action-fields">
            <label>
              Destination site
              <select
                value={site}
                onChange={(event) => {
                  setSite(event.target.value)
                  setPage(1)
                  setData(null)
                  setError("")
                }}
              >
                {sites.map((value) => (
                  <option key={value.id} value={value.id}>
                    {value.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Destination name or code
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
          </div>
          <button
            type="button"
            className="atlas-chip"
            onClick={() => {
              setQuery(draft.trim())
              setPage(1)
              setData(null)
              setRevision((value) => value + 1)
            }}
          >
            Find destinations
          </button>
          {error && <p role="alert">{error}</p>}
          {!data && !error ? (
            <p role="status">Loading destinations…</p>
          ) : (
            <>
              <div className="atlas-action-results">
                {data?.items.map((value) => (
                  <button
                    type="button"
                    key={value.id}
                    onClick={() => {
                      setSelected(value)
                      onSelect(value.id)
                    }}
                  >
                    {value.label}
                  </button>
                ))}
                {data && !data.items.length && (
                  <p>
                    No active destinations match. Configure a real destination,
                    or choose Unassigned.
                  </p>
                )}
              </div>
              {data && (
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
                    {data.total} locations · Page {page}
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
              )}
            </>
          )}
        </>
      )}
    </section>
  )
}
