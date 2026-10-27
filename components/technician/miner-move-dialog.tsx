"use client"

import { useEffect, useRef, useState, type FormEvent } from "react"
import { ArrowRight, LoaderCircle, MapPin, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  MinerServiceError,
  kindLabels,
  locationKinds,
  locationPath,
  reasonLabels,
  type MinerService,
  type MinerDetail,
  type DestinationOptions,
  type DestinationQuery,
  type MoveCommand,
} from "@/lib/miners/contracts"

export function MinerMoveDialog({
  service,
  detail,
  repair,
  onClose,
  onSaved,
  onConflict,
}: {
  service: MinerService
  detail: MinerDetail
  repair: boolean
  onClose: () => void
  onSaved: () => void
  onConflict: (message: string) => void
}) {
  const { miner, capabilities } = detail
  const [query, setQuery] = useState<DestinationQuery>({
    site_id: miner.current_location?.site_id ?? null,
    building_id: null,
    can_id: null,
    kind: "",
    page: 1,
    page_size: 10,
  })
  const [options, setOptions] = useState<DestinationOptions | null>(null)
  const [loading, setLoading] = useState(true)
  const [optionsError, setOptionsError] = useState("")
  const [reload, setReload] = useState(0)
  const [destinationId, setDestinationId] = useState("")
  const [reason, setReason] = useState(
    repair && capabilities.allowed_reasons.includes("REPAIR") ? "REPAIR" : ""
  )
  const [notes, setNotes] = useState("")
  const [error, setError] = useState("")
  const [pending, setPending] = useState(false)
  const [blocked, setBlocked] = useState(false)
  const inFlight = useRef(false)
  const submission = useRef<{ fingerprint: string; key: string } | null>(null)
  const dialog = useRef<HTMLDialogElement>(null)
  const selected = options?.destinations.items.find(
    (item) => item.location.id === Number(destinationId)
  )
  useEffect(() => {
    dialog.current?.showModal()
    const element = dialog.current
    return () => element?.close()
  }, [])
  useEffect(() => {
    const controller = new AbortController()
    service
      .getDestinations(miner.id, query, controller.signal)
      .then((result) => {
        if (!controller.signal.aborted) setOptions(result)
      })
      .catch((failure) => {
        if (!controller.signal.aborted) {
          setOptions(null)
          setOptionsError(
            failure instanceof Error
              ? failure.message
              : "Destinations could not be loaded."
          )
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })
    return () => controller.abort()
  }, [service, miner.id, query, reload])
  function changeQuery(next: DestinationQuery) {
    setLoading(true)
    setOptionsError("")
    setDestinationId("")
    setQuery(next)
  }
  async function submit(event: FormEvent) {
    event.preventDefault()
    if (
      inFlight.current ||
      blocked ||
      loading ||
      !selected?.eligible ||
      !capabilities.can_move ||
      !capabilities.allowed_reasons.includes(reason as MoveCommand["reason"])
    )
      return
    const payload = {
      miner_id: miner.id,
      destination_location_id: selected.location.id,
      reason: reason as MoveCommand["reason"],
      notes: notes.trim() || null,
      expected_version: miner.version,
    }
    const fingerprint = JSON.stringify(payload)
    if (submission.current?.fingerprint !== fingerprint)
      submission.current = { fingerprint, key: crypto.randomUUID() }
    const command: MoveCommand = {
      ...payload,
      submission_key: submission.current.key,
    }
    inFlight.current = true
    setPending(true)
    setError("")
    try {
      await service.move(command)
      onSaved()
    } catch (failure) {
      if (
        failure instanceof MinerServiceError &&
        ["VERSION_CONFLICT", "SLOT_OCCUPIED", "FORBIDDEN"].includes(
          failure.code
        )
      ) {
        setBlocked(true)
        onConflict(failure.message)
      } else
        setError(
          failure instanceof Error
            ? failure.message
            : "The response could not be confirmed. Retry unchanged or review the latest miner details."
        )
    } finally {
      inFlight.current = false
      setPending(false)
    }
  }
  return (
    <dialog
      ref={dialog}
      className="atlas-dialog atlas-move-dialog"
      aria-labelledby="move-dialog-title"
      onCancel={(event) => {
        if (inFlight.current) event.preventDefault()
        else onClose()
      }}
    >
      <div className="atlas-dialog-header">
        <span className="atlas-eyebrow">
          {service.mode === "demo" ? "SIMULATED MOVEMENT" : "MINER MOVEMENT"}
        </span>
        <button
          aria-label="Close move dialog"
          onClick={onClose}
          disabled={pending}
        >
          <X size={19} />
        </button>
      </div>
      <h2 id="move-dialog-title">Move miner</h2>
      <p className="atlas-move-serial">{miner.serial_number}</p>
      <div className="atlas-move-source">
        <span className="atlas-muted">Current location</span>
        <p>{locationPath(miner.current_location)}</p>
      </div>
      <form onSubmit={submit} className="atlas-move-form">
        <fieldset disabled={pending || blocked}>
          <div className="atlas-two-fields">
            <label>
              Destination site
              <select
                aria-label="Destination site"
                value={query.site_id ?? ""}
                onChange={(event) =>
                  changeQuery({
                    ...query,
                    site_id: Number(event.target.value) || null,
                    building_id: null,
                    can_id: null,
                    page: 1,
                  })
                }
                required
                disabled={loading}
              >
                <option value="">Choose site</option>
                {options?.sites.map((site) => (
                  <option value={site.id} key={site.id}>
                    {site.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Building
              <select
                aria-label="Building"
                value={query.building_id ?? ""}
                required
                disabled={!query.site_id || loading}
                onChange={(event) =>
                  changeQuery({
                    ...query,
                    building_id: Number(event.target.value) || null,
                    can_id: null,
                    page: 1,
                  })
                }
              >
                <option value="">Choose building</option>
                {options?.buildings.map((building) => (
                  <option key={building.id} value={building.id}>
                    Building {building.building_number}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="atlas-two-fields">
            <label>
              Can
              <select
                aria-label="Can"
                value={query.can_id ?? ""}
                required
                disabled={!query.building_id || loading}
                onChange={(event) =>
                  changeQuery({
                    ...query,
                    can_id: Number(event.target.value) || null,
                    page: 1,
                  })
                }
              >
                <option value="">Choose can</option>
                {options?.cans.map((can) => (
                  <option value={can.id} key={can.id}>
                    Can {can.can_number}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Location kind
              <select
                aria-label="Location kind"
                value={query.kind}
                disabled={!query.can_id || loading}
                onChange={(event) =>
                  changeQuery({
                    ...query,
                    kind: event.target.value as DestinationQuery["kind"],
                    page: 1,
                  })
                }
              >
                <option value="">All physical locations</option>
                {locationKinds.map((kind) => (
                  <option value={kind} key={kind}>
                    {kindLabels[kind]}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {loading && (
            <p className="atlas-form-loading" role="status">
              <LoaderCircle size={14} className="atlas-spin" />
              Loading eligible destinations…
            </p>
          )}
          {optionsError && (
            <div className="atlas-field-error" role="alert">
              <p>{optionsError}</p>
              <button
                type="button"
                className="atlas-text-button"
                onClick={() => {
                  setLoading(true)
                  setOptionsError("")
                  setReload((value) => value + 1)
                }}
              >
                Retry loading destinations
              </button>
            </div>
          )}
          <label>
            Destination location
            <select
              aria-label="Destination location"
              value={destinationId}
              required
              disabled={!query.can_id || loading || Boolean(optionsError)}
              onChange={(event) => setDestinationId(event.target.value)}
            >
              <option value="">
                {query.can_id
                  ? "Select an existing location"
                  : "Choose a site, building, and can first"}
              </option>
              {!loading &&
                options?.destinations.items.map((item) => (
                  <option
                    value={item.location.id}
                    disabled={!item.eligible}
                    key={item.location.id}
                  >
                    {item.location.name} · {item.location.code}
                    {item.unavailable_reason
                      ? ` — ${item.unavailable_reason}`
                      : ""}
                  </option>
                ))}
            </select>
          </label>
          {!loading &&
            query.can_id &&
            !optionsError &&
            !options?.destinations.total && (
              <p className="atlas-muted" role="status">
                No active destinations match these filters.
              </p>
            )}
          {options &&
            options.destinations.total > options.destinations.page_size && (
              <div className="atlas-mini-pagination">
                <button
                  type="button"
                  disabled={query.page <= 1 || loading}
                  onClick={() =>
                    changeQuery({ ...query, page: query.page - 1 })
                  }
                >
                  Previous locations
                </button>
                <span>Page {query.page}</span>
                <button
                  type="button"
                  disabled={
                    query.page * query.page_size >=
                      options.destinations.total || loading
                  }
                  onClick={() =>
                    changeQuery({ ...query, page: query.page + 1 })
                  }
                >
                  Next locations
                </button>
              </div>
            )}
          {selected && !loading && (
            <div className="atlas-destination-preview">
              <MapPin size={16} />
              <div>
                <span>Destination · {kindLabels[selected.location.kind]}</span>
                <p>{locationPath(selected.location)}</p>
              </div>
            </div>
          )}
          <div className="atlas-two-fields">
            <label>
              Movement reason
              <select
                aria-label="Movement reason"
                value={reason}
                required
                onChange={(event) => setReason(event.target.value)}
              >
                <option value="">Select reason</option>
                {capabilities.allowed_reasons.map((item) => (
                  <option value={item} key={item}>
                    {reasonLabels[item]}
                  </option>
                ))}
              </select>
            </label>
            <p className="atlas-move-help">
              Select an existing active location. Occupied deployment slots
              cannot be selected. Row and slot values are shown as stored.
            </p>
          </div>
          <label>
            Movement notes <span className="atlas-muted">(optional)</span>
            <textarea
              aria-label="Movement notes"
              rows={3}
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              placeholder="Add context for this movement…"
            />
          </label>
          {error && (
            <div className="atlas-field-error" role="alert">
              <p>{error}</p>
              <button
                type="button"
                className="atlas-text-button"
                onClick={() =>
                  onConflict(
                    "Latest miner details refreshed. Review the current location before preparing a new move."
                  )
                }
              >
                Review latest miner details
              </button>
            </div>
          )}
          <div className="atlas-move-footer">
            <span className="atlas-muted">
              {service.mode === "demo"
                ? "Demo only · changes reset on refresh"
                : "Availability will be checked when saving"}
            </span>
            <Button
              type="submit"
              disabled={
                pending ||
                blocked ||
                loading ||
                !selected?.eligible ||
                !reason ||
                Boolean(optionsError)
              }
              className="min-h-11 rounded-md px-5"
            >
              {pending ? (
                <>
                  <LoaderCircle className="atlas-spin" size={15} />
                  Saving…
                </>
              ) : (
                <>
                  {error ? "Retry movement" : "Record movement"}
                  <ArrowRight size={15} />
                </>
              )}
            </Button>
          </div>
        </fieldset>
      </form>
    </dialog>
  )
}
