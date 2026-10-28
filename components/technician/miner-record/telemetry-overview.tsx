import {
  Activity,
  Cpu,
  Fan,
  Gauge,
  Thermometer,
  TriangleAlert,
  Zap,
} from "lucide-react"
import {
  summarizeTelemetry,
  temperatureState,
  type MinerTelemetry,
  type HashboardTelemetry,
} from "@/lib/telemetry/contracts"

export const number = (value: number | null, digits = 1) =>
  value === null
    ? "Not reported"
    : value.toLocaleString("en-US", { maximumFractionDigits: digits })
export const presetLabel = (preset: { powerW: number; hashrateThs: number }) =>
  `${number(preset.powerW, 0)} W · ${number(preset.hashrateThs)} TH/s`
export const boardLabels: Record<HashboardTelemetry["state"], string> = {
  mining: "Mining normally",
  "low-hashrate": "Low hashrate",
  "failed-asic": "Failed ASIC detection",
  missing: "Missing hashboard",
  offline: "Offline",
  unknown: "Unknown · not reported",
}
export function Fields({ items }: { items: [string, React.ReactNode][] }) {
  return (
    <dl className="atlas-telemetry-fields">
      {items.map(([label, value]) => (
        <div key={label}>
          <dt>{label}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  )
}
function Metric({ value, unit }: { value: number | null; unit: string }) {
  return (
    <>
      {number(value)}
      {value !== null && <small>{unit}</small>}
    </>
  )
}
export function TelemetryOverview({
  telemetry,
}: {
  telemetry: MinerTelemetry
}) {
  const totals = summarizeTelemetry(telemetry),
    temperature = temperatureState(totals.highestTemperatureC),
    settings = telemetry.settings
  return (
    <div className="atlas-telemetry-overview">
      <div className="atlas-telemetry-top-grid">
        <article className="atlas-card atlas-telemetry-metric">
          <h3>
            <Activity size={16} />
            Hashrate
          </h3>
          <div className="atlas-telemetry-big">
            <Metric value={totals.hashrateThs} unit="TH/s" />
          </div>
          <p>
            {totals.hashrateThs === null
              ? `${number(totals.reportedHashrateThs)} TH/s across reporting boards · total unknown`
              : `${number(totals.performancePercent)}% of configured output`}
          </p>
          <div className="atlas-telemetry-track">
            <span
              style={{
                width: `${Math.min(totals.performancePercent ?? 0, 100)}%`,
              }}
            />
          </div>
          <footer>
            <span>Configured {number(telemetry.expectedThs)} TH/s</span>
            <strong>
              {telemetry.state === "offline"
                ? "Confirmed offline"
                : telemetry.state === "degraded"
                  ? "Degraded output"
                  : telemetry.state === "partial"
                    ? "Partial coverage"
                    : "Normal output"}
            </strong>
          </footer>
        </article>
        <article
          className={`atlas-card atlas-telemetry-metric atlas-temperature-${temperature}`}
        >
          <h3>
            <Thermometer size={16} />
            Temperature
          </h3>
          <div className="atlas-telemetry-big">
            <Metric value={totals.temperatureC} unit="°C" />
          </div>
          <p>
            Average of reported board maxima · {totals.temperatureCoverage}/3
            boards
          </p>
          <footer>
            <span>
              Highest{" "}
              {totals.highestTemperatureC === null
                ? "not reported"
                : `${number(totals.highestTemperatureC)} °C`}
            </span>
            <strong>
              {temperature === "normal"
                ? "Within sample range"
                : temperature === "unknown"
                  ? "Not reported"
                  : temperature === "warning"
                    ? "Temperature warning"
                    : "Critical temperature"}
            </strong>
          </footer>
        </article>
        <article className="atlas-card atlas-telemetry-performance">
          <h3>
            <Gauge size={16} />
            Performance
          </h3>
          <p className="atlas-telemetry-preset">
            {presetLabel(settings.performance.preset)}
            <span>Configured power preset</span>
          </p>
          <Fields
            items={[
              [
                "Reported consumption",
                totals.powerW === null
                  ? "Not reported"
                  : `${number(totals.powerW, 0)} W`,
              ],
              [
                "Efficiency",
                totals.efficiencyJth === null
                  ? "Not available"
                  : `${number(totals.efficiencyJth)} J/TH`,
              ],
              ["PSU", telemetry.psuModel ?? "Not reported"],
              [
                "Autoswitch",
                settings.performance.autoswitch ? "Enabled" : "Disabled",
              ],
              ["Top preset", presetLabel(settings.performance.maximumPreset)],
            ]}
          />
        </article>
        <article className="atlas-card atlas-telemetry-cooling">
          <h3>
            <Fan size={16} />
            Cooling
          </h3>
          <div className="atlas-telemetry-fans">
            {telemetry.fans.map((fan) => (
              <div key={fan.number} data-fan-state={fan.state}>
                <span>
                  Fan {fan.number}
                  <Fan size={14} />
                </span>
                <strong>
                  {number(fan.rpm, 0)}
                  {fan.rpm !== null && <small>RPM</small>}
                </strong>
                <p>
                  {fan.state === "operating"
                    ? "Operating"
                    : fan.state === "stopped"
                      ? "Stopped · 0 RPM"
                      : fan.state === "missing"
                        ? "Missing · no reading"
                        : "Unknown · no reading"}
                </p>
              </div>
            ))}
          </div>
          <footer>
            Mode: {settings.cooling.mode}
            <span>Target: {settings.cooling.targetC} °C</span>Duty:{" "}
            {telemetry.fanDutyPercent === null
              ? "Not reported"
              : `${telemetry.fanDutyPercent}%`}
          </footer>
        </article>
      </div>
      <div className="atlas-telemetry-section-heading">
        <h3>
          <Cpu size={16} />
          Hashboards
        </h3>
        <p>Board measurements · simulated hardware health</p>
      </div>
      <div className="atlas-telemetry-boards">
        {telemetry.boards.map((board) => (
          <HashboardCard key={board.number} board={board} />
        ))}
      </div>
      <p className="atlas-telemetry-method">
        All operational values are synthetic. Efficiency uses reported board
        power ÷ total hashrate; incomplete readings remain unknown. Sample
        temperature bands: warning ≥78 °C, critical ≥85 °C; these are not a
        validated device policy.
      </p>
    </div>
  )
}
function HashboardCard({ board }: { board: HashboardTelemetry }) {
  const performance =
    board.hashrateThs !== null && board.expectedThs > 0
      ? (board.hashrateThs / board.expectedThs) * 100
      : null
  const tone =
    board.state === "failed-asic" || board.state === "missing"
      ? "critical"
      : board.state === "low-hashrate"
        ? "warning"
        : board.state === "mining"
          ? "healthy"
          : "unknown"
  return (
    <article className={`atlas-card atlas-hashboard atlas-hardware-${tone}`}>
      <header>
        <h3>Board {board.number}</h3>
        {tone === "critical" ? <TriangleAlert size={16} /> : <Cpu size={16} />}
      </header>
      <div className="atlas-board-rate">
        <Metric value={board.hashrateThs} unit="TH/s" />
        <span>
          {performance === null
            ? "Performance unknown"
            : `${number(performance)}% of ${number(board.expectedThs)} TH/s`}
        </span>
      </div>
      <Fields
        items={[
          ["Hardware errors", number(board.hardwareErrors, 0)],
          [
            "Temperature",
            board.temperatureMinC === null || board.temperatureMaxC === null
              ? "Not reported"
              : `${number(board.temperatureMinC)}–${number(board.temperatureMaxC)} °C`,
          ],
          [
            "Frequency",
            board.frequencyMhz === null
              ? "Not reported"
              : `${number(board.frequencyMhz)} MHz`,
          ],
          [
            "Voltage",
            board.voltageV === null
              ? "Not reported"
              : `${number(board.voltageV, 2)} V`,
          ],
          [
            "Consumption",
            board.powerW === null
              ? "Not reported"
              : `${number(board.powerW, 0)} W`,
          ],
          [
            "ASIC chips",
            board.chipsDetected === null
              ? "Not reported"
              : `${board.chipsDetected} / ${board.chipsExpected} detected`,
          ],
        ]}
      />
      <footer>
        {tone === "critical" ? <TriangleAlert size={14} /> : <Zap size={14} />}
        <strong>{boardLabels[board.state]}</strong>
      </footer>
    </article>
  )
}
