import { Activity, ScrollText } from "lucide-react"
import {
  summarizeTelemetry,
  type MinerTelemetry,
} from "@/lib/telemetry/contracts"
import { number } from "./telemetry-overview"

const logTime = (timestamp: string) =>
  new Intl.DateTimeFormat("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
    timeZone: "America/Chicago",
  }).format(new Date(timestamp))
export function LogHashrate({
  telemetry,
  loading = false,
}: {
  telemetry: MinerTelemetry | null
  loading?: boolean
}) {
  const totals = telemetry ? summarizeTelemetry(telemetry) : null
  return (
    <div
      className="atlas-log-hashrate"
      aria-label="Hashrate while viewing logs"
    >
      <div>
        <span>
          <Activity size={15} />
          Hashrate ·{" "}
          {telemetry?.freshness === "stale"
            ? "last known sample"
            : "sample snapshot"}
        </span>
        <strong>
          {loading ? (
            "Loading…"
          ) : totals?.hashrateThs === null || !totals ? (
            "Not reported"
          ) : (
            <>
              {number(totals.hashrateThs)}
              <small>TH/s</small>
            </>
          )}
        </strong>
      </div>
      <p>
        {!telemetry
          ? "Hashrate is unavailable until telemetry can be read."
          : totals?.hashrateThs === null
            ? `Total unknown · ${number(totals?.reportedHashrateThs ?? null)} TH/s across reporting boards`
            : `${number(totals?.performancePercent ?? null)}% of configured ${number(telemetry.expectedThs)} TH/s`}
      </p>
    </div>
  )
}
export function TelemetryLog({ telemetry }: { telemetry: MinerTelemetry }) {
  return (
    <div className="atlas-telemetry-log">
      <LogHashrate telemetry={telemetry} />
      <article className="atlas-card atlas-device-log">
        <header>
          <div>
            <h3>
              <ScrollText size={16} />
              Miner log
            </h3>
            <p>
              {telemetry.source === "mock-vnish"
                ? "Simulated VNish-style messages · not a connected device log"
                : "Device log snapshot"}{" "}
              · Central Time
            </p>
          </div>
          <span className="atlas-chip">
            {telemetry.logs === null
              ? "Unavailable"
              : `${telemetry.logs.length} entries`}
          </span>
        </header>
        {telemetry.logs?.length ? (
          <div
            className="atlas-log-console"
            tabIndex={0}
            role="region"
            aria-label="Miner log entries, oldest first"
          >
            <ol>
              {telemetry.logs.map((entry, index) => (
                <li
                  key={`${entry.timestamp}-${index}`}
                  data-level={entry.level}
                >
                  <time dateTime={entry.timestamp} title={entry.timestamp}>
                    {logTime(entry.timestamp)}
                  </time>
                  <strong>{entry.level}</strong>
                  <span className="atlas-log-component">{entry.component}</span>
                  <p>{entry.message}</p>
                </li>
              ))}
            </ol>
          </div>
        ) : (
          <p className="atlas-log-empty">
            {telemetry.logs === null
              ? "Log data is unavailable for this snapshot. This does not imply a miner fault."
              : "No log entries in this snapshot."}
          </p>
        )}
        <footer>
          Snapshot only · oldest entries first. Refresh the telemetry preview to
          reload this sample.
        </footer>
      </article>
    </div>
  )
}
