"use client"
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type KeyboardEvent,
} from "react"
import {
  Activity,
  ArrowRight,
  ExternalLink,
  History,
  ScrollText,
  Info,
  LoaderCircle,
  MapPin,
  RefreshCw,
  Settings2,
  ShieldCheck,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  displayTime,
  isLocationActive,
  kindLabels,
  locationPath,
  modelLabel,
  type MinerDetail,
} from "@/lib/miners/contracts"
import type {
  MinerTelemetryProvider,
  TelemetryResult,
} from "@/lib/telemetry/contracts"
import {
  MockMinerTelemetryProvider,
  demoTelemetryScenarios,
  scenarioLabels,
  type DemoTelemetryScenario,
} from "@/lib/demo/miner-telemetry"
import { TelemetryOverview } from "./telemetry-overview"
import { TelemetryLog, LogHashrate } from "./telemetry-log"
import { TelemetrySettings } from "./telemetry-settings"
import "./miner-record.css"

type Tab = "overview" | "log" | "settings" | "history"
const tabs: { id: Tab; label: string; icon: typeof Activity }[] = [
  { id: "overview", label: "Overview", icon: Activity },
  { id: "log", label: "Log", icon: ScrollText },
  { id: "settings", label: "Settings", icon: Settings2 },
  { id: "history", label: "Movement history", icon: History },
]
const stateLabels = {
  healthy: "Healthy",
  degraded: "Degraded · board fault",
  offline: "Confirmed offline",
  partial: "Partial telemetry",
}
export function MinerRecord({
  detail,
  demo,
  serial,
  history,
  onMove,
  onRefresh,
  provider: integrationProvider,
}: {
  detail: MinerDetail
  demo: boolean
  serial: ReactNode
  history: ReactNode
  onMove: () => void
  onRefresh: () => void
  provider?: MinerTelemetryProvider
}) {
  const { miner, capabilities } = detail
  const [tab, setTab] = useState<Tab>("overview"),
    [scenario, setScenario] = useState<DemoTelemetryScenario>("assigned"),
    [refresh, setRefresh] = useState(0)
  const [result, setResult] = useState<TelemetryResult | { kind: "loading" }>({
    kind: "loading",
  })
  const provider = useMemo(
    () =>
      integrationProvider ??
      (demo ? new MockMinerTelemetryProvider(scenario) : null),
    [integrationProvider, demo, scenario]
  )
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([])
  useEffect(() => {
    const controller = new AbortController()
    const request = provider
      ? provider.getTelemetry(miner, controller.signal)
      : Promise.resolve<TelemetryResult>({
          kind: "unavailable",
          message:
            "Telemetry integration is not configured. Atlas asset information remains available.",
        })
    request
      .then((value) => {
        if (!controller.signal.aborted) setResult(value)
      })
      .catch(() => {
        if (!controller.signal.aborted)
          setResult({
            kind: "error",
            message:
              "Telemetry could not be retrieved. This does not confirm hardware failure.",
          })
      })
    return () => controller.abort()
  }, [provider, miner, refresh])
  const telemetry = result.kind === "ready" ? result.telemetry : null
  const simulated = telemetry
    ? telemetry.source === "mock-vnish"
    : demo && !integrationProvider
  function refreshTelemetry() {
    setResult({ kind: "loading" })
    setRefresh((value) => value + 1)
  }
  function tabKey(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    let next = index
    if (event.key === "ArrowRight") next = (index + 1) % tabs.length
    else if (event.key === "ArrowLeft")
      next = (index + tabs.length - 1) % tabs.length
    else if (event.key === "Home") next = 0
    else if (event.key === "End") next = tabs.length - 1
    else return
    event.preventDefault()
    setTab(tabs[next].id)
    tabRefs.current[next]?.focus()
  }
  return (
    <div className="atlas-record">
      <header className="atlas-record-summary">
        <div className="atlas-record-title-row">
          <div>
            <p className="atlas-eyebrow">ATLAS ASSET RECORD</p>
            <h2>{serial}</h2>
            <p>{modelLabel(miner)}</p>
          </div>
          <div className="atlas-record-actions">
            <button
              className="atlas-refresh-miner"
              aria-label="Refresh selected miner"
              onClick={onRefresh}
            >
              <RefreshCw size={15} />
            </button>
            {capabilities.can_move ? (
              <Button className="min-h-10 rounded-md px-4" onClick={onMove}>
                Move miner
                <ArrowRight size={14} />
              </Button>
            ) : (
              <span className="atlas-chip">View only</span>
            )}
          </div>
        </div>
        <dl className="atlas-record-custody">
          <div>
            <dt>Asset tag</dt>
            <dd>{miner.asset_tag ?? "Not assigned"}</dd>
          </div>
          <div>
            <dt>Owner</dt>
            <dd>{miner.owner.name}</dd>
          </div>
          <div>
            <dt>Managed by</dt>
            <dd>{miner.manager.name}</dd>
          </div>
          <div>
            <dt>Operational status · {simulated ? "demo" : "telemetry"}</dt>
            <dd>
              <span
                className={`atlas-record-state atlas-record-state-${telemetry?.freshness === "stale" ? "unknown" : (telemetry?.state ?? "unknown")}`}
              >
                {result.kind === "loading"
                  ? "Loading telemetry"
                  : telemetry
                    ? `${telemetry.freshness === "stale" ? "Last known: " : ""}${stateLabels[telemetry.state]}`
                    : result.kind === "not-found"
                      ? "Not found in VNish"
                      : "Telemetry unavailable"}
              </span>
            </dd>
          </div>
        </dl>
        <div className="atlas-record-location">
          <MapPin size={15} />
          <p>
            <strong>Current physical location</strong>
            {locationPath(miner.current_location)}
          </p>
          {miner.current_location && (
            <span className="atlas-chip">
              {kindLabels[miner.current_location.kind]}
            </span>
          )}
        </div>
        {miner.current_location &&
          !isLocationActive(miner.current_location) && (
            <p className="atlas-record-asset-note">
              Inactive location or hierarchy. The existing physical assignment
              remains recorded.
            </p>
          )}
        {miner.current_location?.kind === "REPAIR" && (
          <p className="atlas-record-asset-note">
            A repair-area location is a physical assignment; it does not
            establish a diagnosis or operational state.
          </p>
        )}
        {!capabilities.can_move && (
          <p className="atlas-record-asset-note">
            {capabilities.explanation ??
              "Movement is not available for this miner."}
          </p>
        )}
        <details className="atlas-record-metadata">
          <summary>Asset metadata · record version {miner.version}</summary>
          <p>
            Created {displayTime(miner.created_at)} · Updated{" "}
            {displayTime(miner.updated_at)} · Central Time
          </p>
          <p>
            Manufacturer: {miner.model?.manufacturer ?? "Not assigned"} · Model:{" "}
            {miner.model?.name ?? "Not assigned"} · Variant:{" "}
            {miner.model?.variant ?? "Not assigned"}
          </p>
        </details>
      </header>
      <div
        className="atlas-record-tabs"
        role="tablist"
        aria-label="Miner record sections"
      >
        {tabs.map(({ id, label, icon: Icon }, index) => (
          <button
            key={id}
            ref={(element) => {
              tabRefs.current[index] = element
            }}
            id={`miner-record-tab-${id}`}
            role="tab"
            aria-selected={tab === id}
            aria-controls={`miner-record-panel-${id}`}
            tabIndex={tab === id ? 0 : -1}
            onClick={() => setTab(id)}
            onKeyDown={(event) => tabKey(event, index)}
          >
            <Icon size={15} />
            {label}
            {id === "settings" && <span>Read-only</span>}
          </button>
        ))}
      </div>
      <section
        key={tab}
        className="atlas-record-panel"
        role="tabpanel"
        id={`miner-record-panel-${tab}`}
        aria-labelledby={`miner-record-tab-${tab}`}
        tabIndex={0}
      >
        {tab === "history" ? (
          history
        ) : (
          <>
            <div className="atlas-telemetry-toolbar">
              <div>
                <span className="atlas-telemetry-demo">
                  <ShieldCheck size={13} />
                  {simulated ? "SIMULATED TELEMETRY" : "TELEMETRY"}
                </span>
                <p>
                  {simulated
                    ? "VNish-style sample · no device connection"
                    : "Operational readings are separate from Atlas inventory"}
                </p>
              </div>
              <div>
                {demo && !integrationProvider && (
                  <label>
                    Demo scenario
                    <select
                      aria-label="Telemetry demo scenario"
                      value={scenario}
                      onChange={(event) => {
                        setResult({ kind: "loading" })
                        setScenario(event.target.value as DemoTelemetryScenario)
                      }}
                    >
                      {demoTelemetryScenarios.map((value) => (
                        <option value={value} key={value}>
                          {scenarioLabels[value]}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
                <button
                  className="atlas-refresh-miner"
                  aria-label="Refresh telemetry preview"
                  onClick={refreshTelemetry}
                  disabled={result.kind === "loading"}
                >
                  <RefreshCw size={14} />
                </button>
                <button
                  className="atlas-vnish-link"
                  disabled
                  title="VNish URL and navigation scheme are not configured"
                >
                  <ExternalLink size={13} />
                  Open in VNish<span>Not configured</span>
                </button>
              </div>
            </div>
            {telemetry ? (
              <>
                <div className="atlas-telemetry-context">
                  <span>Firmware: {telemetry.firmware}</span>
                  <span>
                    Uptime:{" "}
                    {telemetry.uptimeSeconds === null
                      ? "Not reported"
                      : `${Math.floor(telemetry.uptimeSeconds / 86400)}d ${Math.floor((telemetry.uptimeSeconds % 86400) / 3600)}h ${Math.floor((telemetry.uptimeSeconds % 3600) / 60)}m`}
                  </span>
                  <span>
                    Sample captured {displayTime(telemetry.capturedAt)} CT
                  </span>
                  <span>
                    Sample reference {displayTime(telemetry.sampleAsOf)} CT
                  </span>
                </div>
                {telemetry.freshness === "stale" && (
                  <p role="status" className="atlas-telemetry-warning">
                    <Info size={15} />
                    Stale sample · last reported 90 minutes before the sample
                    reference. Values are historical, not a current reading.
                  </p>
                )}
                {telemetry.state === "partial" && (
                  <p role="status" className="atlas-telemetry-warning">
                    <Info size={15} />
                    Partial readings. Board 2 is unknown, Fan 3 is stopped, and
                    Fan 4 is missing in this sample. Missing readings are not
                    confirmed hardware failures.
                  </p>
                )}
                {telemetry.state === "offline" && (
                  <p role="status" className="atlas-telemetry-warning">
                    <Info size={15} />
                    Confirmed offline demo scenario. Zero output is explicitly
                    reported; temperatures and fan readings are unavailable.
                  </p>
                )}
                {tab === "log" ? (
                  <TelemetryLog telemetry={telemetry} />
                ) : tab === "settings" ? (
                  <TelemetrySettings telemetry={telemetry} />
                ) : (
                  <TelemetryOverview telemetry={telemetry} />
                )}
              </>
            ) : (
              <>
                {tab === "log" && (
                  <LogHashrate
                    telemetry={null}
                    loading={result.kind === "loading"}
                  />
                )}
                <div
                  className="atlas-telemetry-empty"
                  role={result.kind === "error" ? "alert" : "status"}
                >
                  {result.kind === "loading" ? (
                    <LoaderCircle size={25} className="atlas-spin" />
                  ) : (
                    <Info size={25} />
                  )}
                  <h3>
                    {result.kind === "loading"
                      ? "Loading telemetry preview…"
                      : result.kind === "not-found"
                        ? "Miner not found in VNish"
                        : result.kind === "error"
                          ? "Telemetry request failed"
                          : "Telemetry unavailable"}
                  </h3>
                  <p>
                    {result.kind === "loading"
                      ? "Atlas identity, location, custody, and movement history remain independent of this read."
                      : result.kind === "ready"
                        ? ""
                        : result.message}
                  </p>
                  {result.kind === "error" && (
                    <button
                      className="atlas-text-button"
                      onClick={refreshTelemetry}
                    >
                      Retry telemetry preview
                    </button>
                  )}
                  <button
                    className="atlas-text-button"
                    onClick={() => setTab("history")}
                  >
                    <History size={14} />
                    View movement history
                  </button>
                </div>
              </>
            )}
          </>
        )}
      </section>
    </div>
  )
}
