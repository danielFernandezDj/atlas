import {
  Activity,
  ArrowDown,
  ArrowUp,
  CircleAlert,
  Cpu,
  Gauge,
  Thermometer,
  Zap,
} from "lucide-react"
import {
  type DemoSite,
  buildingTemperatures,
  number,
  percent,
} from "@/lib/demo/technician"

export function SiteOverview({ site }: { site: DemoSite }) {
  const hashing = site.healthy + site.warning
  const capacity = site.installed + site.empty
  const statuses = [
    {
      name: "Healthy",
      count: site.healthy,
      color: "var(--atlas-green)",
      description: "Working at full output",
    },
    {
      name: "Warning",
      count: site.warning,
      color: "var(--atlas-amber)",
      description: "Hashing at reduced output",
    },
    {
      name: "Danger",
      count: site.danger,
      color: "var(--atlas-red)",
      description: "Not hashing · needs attention",
    },
    {
      name: "Disabled",
      count: site.empty,
      color: "var(--atlas-gray)",
      description: "Empty locations · no miner installed",
    },
  ]
  const healthyEnd = (site.healthy / capacity) * 100,
    warningEnd = ((site.healthy + site.warning) / capacity) * 100,
    dangerEnd = (site.installed / capacity) * 100
  const cards = [
    {
      label: "ASICs online",
      Icon: Cpu,
      value: number(hashing),
      unit: "",
      body: `of ${number(site.installed)} installed miners`,
      extra: `${percent(hashing, site.installed)}% online`,
      kind: "online",
    },
    {
      label: "Current hash rate",
      Icon: Zap,
      value: number(site.current),
      unit: "TH/s",
      body: "Combined output · selected site",
      extra: "Current snapshot",
      kind: "current",
    },
    {
      label: "ASICs hashing",
      Icon: Activity,
      value: number(hashing),
      unit: "",
      body: "Miners actively producing hashes",
      extra: `${number(site.warning)} at reduced output`,
      kind: "hashing",
    },
    {
      label: "Monthly hash range",
      Icon: Gauge,
      value: "",
      unit: "",
      body: "This month · site output",
      extra: "",
      kind: "range",
    },
    {
      label: "Daily hash rate",
      Icon: Activity,
      value: number(site.daily),
      unit: "TH/s",
      body: "Average output over the last 24h",
      extra: "24-hour average",
      kind: "daily",
    },
    {
      label: "Miners needing attention",
      Icon: CircleAlert,
      value: number(site.danger),
      unit: "",
      body: `of ${number(site.installed)} installed miners`,
      extra: "Not hashing · investigate",
      kind: "attention",
    },
  ]
  return (
    <div className="atlas-overview-grid">
      <section
        className="atlas-metrics"
        aria-label={`${site.name} mining metrics`}
      >
        {cards.map(({ label, Icon, value, unit, body, extra, kind }) => (
          <article
            key={kind}
            className={`atlas-card atlas-metric ${kind === "attention" ? "atlas-attention" : ""}`}
          >
            <div className="atlas-metric-heading">
              <h2>{label}</h2>
              <Icon size={17} />
            </div>
            {kind === "range" ? (
              <div className="atlas-month-range">
                <div>
                  <span className="atlas-muted">
                    <ArrowDown size={12} />
                    Min
                  </span>
                  <strong>
                    {number(site.min)} <small>TH/s</small>
                  </strong>
                </div>
                <div>
                  <span className="atlas-muted">
                    <ArrowUp size={12} />
                    Max
                  </span>
                  <strong>
                    {number(site.max)} <small>TH/s</small>
                  </strong>
                </div>
              </div>
            ) : (
              <div
                className={`atlas-metric-value ${kind === "attention" ? "atlas-red" : ""}`}
              >
                {value}
                <span>{unit}</span>
                {kind === "online" && (
                  <span className="atlas-percent">
                    {percent(hashing, site.installed)}%
                  </span>
                )}
              </div>
            )}
            <p className="atlas-muted">{body}</p>
            {kind === "online" ? (
              <div className="atlas-progress" aria-hidden="true">
                <span
                  style={{ width: `${(hashing / site.installed) * 100}%` }}
                />
              </div>
            ) : kind === "range" ? (
              <div className="atlas-range-track" aria-hidden="true">
                <span />
              </div>
            ) : (
              <p
                className={`atlas-metric-note ${kind === "attention" ? "atlas-red" : "atlas-subtle"}`}
              >
                <span className="atlas-small-dot" />
                {extra}
              </p>
            )}
          </article>
        ))}
      </section>
      <div className="atlas-overview-right">
        <section
          className="atlas-card atlas-temperature"
          aria-labelledby="temperature-title"
        >
          <div className="atlas-section-header">
            <div>
              <h2 id="temperature-title">Can temperatures</h2>
              <p className="atlas-muted">
                Average temperature in each can · °C
              </p>
            </div>
            <Thermometer size={18} className="atlas-subtle" />
          </div>
          {[1, 2].map((building) => {
            const temperatures = buildingTemperatures(site, building)
            const average =
              temperatures.reduce((sum, value) => sum + value, 0) /
              temperatures.length
            return (
              <div className="atlas-building" key={building}>
                <div className="atlas-building-heading">
                  <h3>Building {building}</h3>
                  <span className="atlas-muted">
                    10 cans <span aria-hidden="true">·</span> Avg{" "}
                    <strong>{average.toFixed(1)}°C</strong>
                  </span>
                </div>
                <div className="atlas-cans">
                  {temperatures.map((temp, index) => (
                    <div
                      className="atlas-can"
                      key={index}
                      title={`Building ${building}, Can ${index + 1}: ${temp}°C`}
                    >
                      <span>Can {String(index + 1).padStart(2, "0")}</span>
                      <strong>{temp}°</strong>
                    </div>
                  ))}
                </div>
              </div>
            )
          })}
        </section>
        <section
          className="atlas-card atlas-status"
          aria-labelledby="status-title"
        >
          <div className="atlas-section-header">
            <div>
              <h2 id="status-title">Miner status</h2>
              <p className="atlas-muted">A clear view of every location</p>
            </div>
            <span className="atlas-chip">{number(capacity)} locations</span>
          </div>
          <div className="atlas-status-body">
            <div
              className="atlas-donut"
              role="img"
              aria-label={statuses
                .map(
                  (status) =>
                    `${status.name}: ${number(status.count)} locations, ${percent(status.count, capacity)} percent`
                )
                .join(". ")}
              style={{
                background: `conic-gradient(var(--atlas-green) 0% ${healthyEnd}%, var(--atlas-amber) ${healthyEnd}% ${warningEnd}%, var(--atlas-red) ${warningEnd}% ${dangerEnd}%, var(--atlas-gray) ${dangerEnd}% 100%)`,
              }}
            >
              <div>
                <span className="atlas-muted">Installed</span>
                <strong>{number(site.installed)}</strong>
                <span className="atlas-muted">miners</span>
              </div>
            </div>
            <ul className="atlas-status-legend">
              {statuses.map((status) => (
                <li key={status.name}>
                  <span
                    className="atlas-status-dot"
                    style={{ background: status.color }}
                  />
                  <div>
                    <strong>{status.name}</strong>
                    <p className="atlas-muted">{status.description}</p>
                  </div>
                  <div className="atlas-status-count">
                    <strong>{number(status.count)}</strong>
                    <span className="atlas-muted">
                      {percent(status.count, capacity)}%
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          </div>
          <p className="atlas-status-footnote">
            Percentages are of all {number(capacity)} locations. Disabled
            locations are empty, not offline miners.
          </p>
        </section>
      </div>
    </div>
  )
}
