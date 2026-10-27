"use client"

import { useEffect, useRef, useState, type FormEvent } from "react"
import {
  ArrowRight,
  CheckCircle2,
  LoaderCircle,
  MapPin,
  Plus,
  RefreshCw,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  MinerServiceError,
  kindLabels,
  locationKinds,
  locationPath,
  modelLabel,
  type DestinationQuery,
  type Miner,
  type MinerService,
  type RegisterMinerCommand,
  type RegistrationOptions,
} from "@/lib/miners/contracts"
import "./miner-workspace.css"
import "./add-miner-form.css"

export function AddMinerForm({
  service,
  siteId,
  onBusy,
  onAdded,
  onFind,
  onBack,
}: {
  service: MinerService
  siteId: number
  onBusy: (busy: boolean) => void
  onAdded: (miner: Miner) => void
  onFind: (serial: string) => void
  onBack: () => void
}) {
  const [options, setOptions] = useState<RegistrationOptions | null>(null)
  const [query, setQuery] = useState<DestinationQuery>({
    site_id: siteId,
    building_id: null,
    can_id: null,
    kind: "",
    page: 1,
    page_size: 10,
  })
  const [loading, setLoading] = useState(true)
  const [optionsError, setOptionsError] = useState("")
  const [reload, setReload] = useState(0)
  const [serial, setSerial] = useState("")
  const [assetTag, setAssetTag] = useState("")
  const [modelId, setModelId] = useState("")
  const [ownerId, setOwnerId] = useState("")
  const [managerId, setManagerId] = useState("")
  const [assignNow, setAssignNow] = useState(false)
  const [destinationId, setDestinationId] = useState("")
  const [notes, setNotes] = useState("")
  const [pending, setPending] = useState(false)
  const [error, setError] = useState("")
  const [serialError, setSerialError] = useState("")
  const [created, setCreated] = useState<Miner | null>(null)
  const inFlight = useRef(false)
  const submission = useRef<{ fingerprint: string; key: string } | null>(null)
  const successHeading = useRef<HTMLHeadingElement>(null)
  const selected = options?.locations.destinations.items.find(
    (item) => item.location.id === Number(destinationId)
  )
  useEffect(() => {
    const controller = new AbortController()
    service
      .getRegistrationOptions(query, controller.signal)
      .then((result) => {
        if (!controller.signal.aborted) setOptions(result)
      })
      .catch((failure) => {
        if (!controller.signal.aborted)
          setOptionsError(
            failure instanceof Error
              ? failure.message
              : "Registration choices could not be loaded."
          )
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })
    return () => controller.abort()
  }, [service, query, reload])
  useEffect(() => {
    if (created) successHeading.current?.focus()
  }, [created])
  function changeQuery(next: DestinationQuery) {
    setDestinationId("")
    setLoading(true)
    setOptionsError("")
    setQuery(next)
  }
  function retryOptions() {
    setLoading(true)
    setOptionsError("")
    setReload((value) => value + 1)
  }
  function reset() {
    setCreated(null)
    setSerial("")
    setAssetTag("")
    setModelId("")
    setOwnerId("")
    setManagerId("")
    setAssignNow(false)
    setDestinationId("")
    setNotes("")
    setError("")
    setSerialError("")
    submission.current = null
    changeQuery({
      site_id: siteId,
      building_id: null,
      can_id: null,
      kind: "",
      page: 1,
      page_size: 10,
    })
  }
  async function submit(event: FormEvent) {
    event.preventDefault()
    if (inFlight.current || loading || optionsError || !options?.can_register)
      return
    if (!serial.trim()) {
      setSerialError("Enter the miner’s serial number.")
      return
    }
    if (!ownerId || !managerId || (assignNow && !selected?.eligible)) return
    const payload = {
      serial_number: serial.trim(),
      asset_tag: assetTag.trim() || null,
      model_id: modelId ? Number(modelId) : null,
      owner_company_id: Number(ownerId),
      management_company_id: Number(managerId),
      initial_location_id: assignNow && selected ? selected.location.id : null,
      notes: assignNow ? notes.trim() || null : null,
    }
    const fingerprint = JSON.stringify(payload)
    if (submission.current?.fingerprint !== fingerprint)
      submission.current = { fingerprint, key: crypto.randomUUID() }
    const command: RegisterMinerCommand = {
      ...payload,
      submission_key: submission.current.key,
    }
    inFlight.current = true
    setPending(true)
    onBusy(true)
    setError("")
    setSerialError("")
    try {
      const result = await service.registerMiner(command)
      setCreated(result.miner)
      onAdded(result.miner)
    } catch (failure) {
      const message =
        failure instanceof Error
          ? failure.message
          : "The response could not be confirmed. Retry unchanged or find this serial in the inventory."
      if (
        failure instanceof MinerServiceError &&
        failure.code === "DUPLICATE_SERIAL"
      )
        setSerialError(message)
      else {
        setError(message)
        if (
          failure instanceof MinerServiceError &&
          ["SLOT_OCCUPIED", "INVALID", "FORBIDDEN"].includes(failure.code)
        ) {
          setDestinationId("")
          retryOptions()
        }
      }
    } finally {
      inFlight.current = false
      setPending(false)
      onBusy(false)
    }
  }
  if (created)
    return (
      <div className="atlas-add-success">
        <span className="atlas-add-success-icon">
          <CheckCircle2 size={28} />
        </span>
        <p className="atlas-eyebrow">DEMO REGISTRATION COMPLETE</p>
        <h2 id="workspace-dialog-title" tabIndex={-1} ref={successHeading}>
          Miner added
        </h2>
        <p className="atlas-added-serial">{created.serial_number}</p>
        <p className="atlas-muted">{modelLabel(created)}</p>
        <dl>
          <div>
            <dt>Owner</dt>
            <dd>{created.owner.name}</dd>
          </div>
          <div>
            <dt>Managed by</dt>
            <dd>{created.manager.name}</dd>
          </div>
          <div>
            <dt>Current location</dt>
            <dd>{locationPath(created.current_location)}</dd>
          </div>
        </dl>
        <p className="atlas-add-result-note">
          {created.current_location
            ? "An Initial registration movement was recorded with this location."
            : "No movement was recorded. You can assign a location from the miner record later."}
        </p>
        <div className="atlas-add-success-actions">
          <Button
            className="min-h-11 rounded-md px-5"
            onClick={() => onFind(created.serial_number)}
          >
            View miner
            <ArrowRight size={15} />
          </Button>
          <button className="atlas-text-button" onClick={reset}>
            <Plus size={13} />
            Add another miner
          </button>
        </div>
        <p className="atlas-dialog-note">
          Synthetic data only · changes reset when you refresh.
        </p>
      </div>
    )
  return (
    <div className="atlas-add-miner">
      <h2 id="workspace-dialog-title">Add a miner</h2>
      <p className="atlas-muted atlas-add-description">
        Register its identity and custody. Assign a physical location now or
        later.
      </p>
      <div className="atlas-add-demo-label">
        Synthetic registration · no database changes
      </div>
      {optionsError && (
        <div className="atlas-field-error" role="alert">
          <p>{optionsError}</p>
          <button
            type="button"
            className="atlas-text-button"
            onClick={retryOptions}
          >
            Reload registration choices
            <RefreshCw size={13} />
          </button>
        </div>
      )}
      {!options ? (
        <div className="atlas-add-loading" role="status">
          {loading && (
            <>
              <LoaderCircle size={18} className="atlas-spin" />
              Loading companies, models, and locations…
            </>
          )}
        </div>
      ) : !options.can_register ? (
        <div className="atlas-inline-notice" role="status">
          {options.explanation ??
            "Adding a miner is not available for this account."}
        </div>
      ) : (
        <form className="atlas-move-form atlas-add-form" onSubmit={submit}>
          <fieldset disabled={pending}>
            <section className="atlas-add-section">
              <h3>
                <span>01</span>Miner identity
              </h3>
              <div className="atlas-two-fields">
                <label>
                  Serial number <span className="atlas-required">*</span>
                  <input
                    autoFocus
                    aria-label="New miner serial number"
                    required
                    value={serial}
                    onChange={(event) => {
                      setSerial(event.target.value)
                      setSerialError("")
                    }}
                    autoComplete="off"
                    spellCheck={false}
                    placeholder="Enter the full serial number"
                    aria-invalid={Boolean(serialError)}
                    aria-describedby="registration-serial-help"
                  />
                </label>
                <label>
                  Asset tag <span className="atlas-muted">(optional)</span>
                  <input
                    aria-label="New miner asset tag"
                    value={assetTag}
                    onChange={(event) => setAssetTag(event.target.value)}
                    autoComplete="off"
                    placeholder="e.g. ASSET-204"
                  />
                </label>
              </div>
              <p className="atlas-add-help" id="registration-serial-help">
                Serial numbers are unique. Asset tags do not need to be unique.
              </p>
              {serialError && (
                <div className="atlas-field-error" role="alert">
                  <p>{serialError}</p>
                  <button
                    type="button"
                    className="atlas-text-button"
                    onClick={() => onFind(serial.trim())}
                  >
                    Find this serial in inventory
                    <ArrowRight size={13} />
                  </button>
                </div>
              )}
              <label>
                Manufacturer / model / variant{" "}
                <span className="atlas-muted">(optional)</span>
                <select
                  aria-label="New miner model"
                  value={modelId}
                  onChange={(event) => setModelId(event.target.value)}
                >
                  <option value="">Model not assigned</option>
                  {options.models.map((model) => (
                    <option key={model.id} value={model.id}>
                      {[model.manufacturer, model.name, model.variant]
                        .filter(Boolean)
                        .join(" ")}
                    </option>
                  ))}
                </select>
              </label>
            </section>
            <section className="atlas-add-section">
              <h3>
                <span>02</span>Ownership & management
              </h3>
              <div className="atlas-two-fields">
                <label>
                  Owner <span className="atlas-required">*</span>
                  <select
                    aria-label="New miner owner"
                    value={ownerId}
                    required
                    onChange={(event) => setOwnerId(event.target.value)}
                  >
                    <option value="">Choose owner company</option>
                    {options.companies.map((company) => (
                      <option key={company.id} value={company.id}>
                        {company.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Managed by <span className="atlas-required">*</span>
                  <select
                    aria-label="New miner managed by"
                    value={managerId}
                    required
                    onChange={(event) => setManagerId(event.target.value)}
                  >
                    <option value="">Choose management company</option>
                    {options.companies.map((company) => (
                      <option key={company.id} value={company.id}>
                        {company.name}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <p className="atlas-add-help">
                The owner and management company can be the same or different
                companies.
              </p>
            </section>
            <section className="atlas-add-section">
              <h3>
                <span>03</span>Initial physical location{" "}
                <span className="atlas-muted">(optional)</span>
              </h3>
              <div className="atlas-add-placement">
                <label className={!assignNow ? "is-selected" : ""}>
                  <input
                    type="radio"
                    name="initial-placement"
                    checked={!assignNow}
                    onChange={() => {
                      setAssignNow(false)
                      setDestinationId("")
                    }}
                  />
                  <span>
                    <strong>Assign later</strong>
                    <small>Location not assigned</small>
                  </span>
                </label>
                <label className={assignNow ? "is-selected" : ""}>
                  <input
                    type="radio"
                    name="initial-placement"
                    checked={assignNow}
                    onChange={() => setAssignNow(true)}
                  />
                  <span>
                    <strong>Choose existing location</strong>
                    <small>Record initial registration</small>
                  </span>
                </label>
              </div>
              {assignNow && (
                <div className="atlas-add-location-fields">
                  <div className="atlas-two-fields">
                    <label>
                      Site
                      <select
                        aria-label="Registration destination site"
                        value={query.site_id ?? ""}
                        required
                        disabled={loading}
                        onChange={(event) =>
                          changeQuery({
                            ...query,
                            site_id: Number(event.target.value) || null,
                            building_id: null,
                            can_id: null,
                            page: 1,
                          })
                        }
                      >
                        <option value="">Choose site</option>
                        {options.locations.sites.map((site) => (
                          <option value={site.id} key={site.id}>
                            {site.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      Building
                      <select
                        aria-label="Registration building"
                        value={query.building_id ?? ""}
                        required
                        disabled={loading || !query.site_id}
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
                        {options.locations.buildings.map((building) => (
                          <option value={building.id} key={building.id}>
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
                        aria-label="Registration can"
                        value={query.can_id ?? ""}
                        required
                        disabled={loading || !query.building_id}
                        onChange={(event) =>
                          changeQuery({
                            ...query,
                            can_id: Number(event.target.value) || null,
                            page: 1,
                          })
                        }
                      >
                        <option value="">Choose can</option>
                        {options.locations.cans.map((can) => (
                          <option value={can.id} key={can.id}>
                            Can {can.can_number}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      Location kind
                      <select
                        aria-label="Registration location kind"
                        value={query.kind}
                        disabled={loading || !query.can_id}
                        onChange={(event) =>
                          changeQuery({
                            ...query,
                            kind: event.target
                              .value as DestinationQuery["kind"],
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
                  <label>
                    Existing location
                    <select
                      aria-label="Registration destination location"
                      value={destinationId}
                      required
                      disabled={
                        loading || !query.can_id || Boolean(optionsError)
                      }
                      onChange={(event) => setDestinationId(event.target.value)}
                    >
                      <option value="">Select an existing location</option>
                      {!loading &&
                        options.locations.destinations.items.map((option) => (
                          <option
                            key={option.location.id}
                            value={option.location.id}
                            disabled={!option.eligible}
                          >
                            {option.location.name} · {option.location.code}
                            {option.unavailable_reason
                              ? ` — ${option.unavailable_reason}`
                              : ""}
                          </option>
                        ))}
                    </select>
                  </label>
                  {loading && (
                    <p className="atlas-form-loading" role="status">
                      <LoaderCircle size={13} className="atlas-spin" />
                      Updating destination choices…
                    </p>
                  )}
                  {!loading &&
                    query.can_id &&
                    !options.locations.destinations.total && (
                      <p className="atlas-add-help" role="status">
                        No active locations match these filters.
                      </p>
                    )}
                  {options.locations.destinations.total > query.page_size && (
                    <div className="atlas-mini-pagination">
                      <button
                        type="button"
                        disabled={loading || query.page === 1}
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
                          loading ||
                          query.page * query.page_size >=
                            options.locations.destinations.total
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
                        <span>{kindLabels[selected.location.kind]}</span>
                        <p>{locationPath(selected.location)}</p>
                      </div>
                    </div>
                  )}
                  <p className="atlas-add-help">
                    Only existing active locations can be selected. Occupied
                    deployment slots are unavailable. Coordinates are shown as
                    stored.
                  </p>
                  <label>
                    Movement notes{" "}
                    <span className="atlas-muted">(optional)</span>
                    <textarea
                      aria-label="Registration movement notes"
                      value={notes}
                      onChange={(event) => setNotes(event.target.value)}
                      rows={2}
                      placeholder="Context for the initial registration movement…"
                    />
                  </label>
                </div>
              )}
            </section>
            {error && (
              <div className="atlas-field-error" role="alert">
                <p>{error}</p>
                <button
                  type="button"
                  className="atlas-text-button"
                  onClick={() => onFind(serial.trim())}
                >
                  Find this serial in inventory
                  <ArrowRight size={13} />
                </button>
              </div>
            )}
            <div className="atlas-move-footer">
              <button
                type="button"
                className="atlas-text-button"
                onClick={onBack}
                disabled={pending}
              >
                Back to actions
              </button>
              <Button
                type="submit"
                className="min-h-11 rounded-md px-5"
                disabled={
                  pending ||
                  loading ||
                  Boolean(optionsError) ||
                  !serial.trim() ||
                  !ownerId ||
                  !managerId ||
                  (assignNow && !selected?.eligible)
                }
              >
                {pending ? (
                  <>
                    <LoaderCircle className="atlas-spin" size={15} />
                    Adding miner…
                  </>
                ) : (
                  <>
                    {error ? "Retry registration" : "Add miner"}
                    <Plus size={15} />
                  </>
                )}
              </Button>
            </div>
          </fieldset>
        </form>
      )}
      <p className="atlas-dialog-note">
        Synthetic data only. This flow does not create companies, models, or
        locations.
      </p>
    </div>
  )
}
