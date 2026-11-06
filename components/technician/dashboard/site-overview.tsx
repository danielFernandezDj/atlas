/**
 * Displays recorded site counts and the assignment-status chart from DashboardData.
 * The workspace supplies a server-loaded snapshot; missing operational telemetry
 * remains unknown instead of being inferred from inventory.
 */
import type { DashboardData } from "@/lib/dashboard/contracts"
import { Cpu, MapPin, Wrench } from "lucide-react"
const number = (value: number) => new Intl.NumberFormat("en-US").format(value)
export function SiteOverview({ dashboard }: { dashboard: DashboardData }) {
  const { summary } = dashboard
  if (!summary) return null
  const total = summary.linked,
    repair = summary.repairReserved,
    unknown = Math.max(0, total - repair)
  const percentage = (value: number) =>
    total ? `${((value / total) * 100).toFixed(1)}%` : "0%"
  const circumference = 2 * Math.PI * 46
  const cards = [
    {
      label: "Miners at this site",
      value: summary.miners,
      Icon: Cpu,
      note: "Physical inventory",
    },
    {
      label: "Deployed miners",
      value: summary.deployed,
      Icon: MapPin,
      note: "At deployment locations",
    },
    {
      label: "Miners in repair",
      value: summary.repair,
      Icon: Wrench,
      note: `${number(summary.staging)} staging · ${number(summary.pallet)} on pallets`,
    },
  ]
  return (
    <>
      <div className="atlas-overview-grid atlas-compact-overview">
        <section className="atlas-metrics" aria-label="Site inventory counts">
          {cards.map(({ label, value, Icon, note }) => (
            <article key={label} className="atlas-card atlas-metric">
              <div className="atlas-metric-heading">
                <h2>{label}</h2>
                <Icon size={15} aria-hidden="true" />
              </div>
              <div className="atlas-metric-value">{number(value)}</div>
              <p className="atlas-muted">{note}</p>
            </article>
          ))}
        </section>
        <section
          className="atlas-card atlas-status atlas-miner-status"
          aria-labelledby="miner-status-title"
        >
          <div className="atlas-section-header">
            <h2 id="miner-status-title">Miner status</h2>
            <span className="atlas-muted">
              At site or reserved to its ports
            </span>
          </div>
          <div className="atlas-miner-status-body">
            <svg
              viewBox="0 0 120 120"
              role="img"
              aria-label={`${number(total)} linked miners; ${number(repair)} in repair with a reserved port (${percentage(repair)}). ${number(unknown)} have unavailable live mining status.`}
            >
              <circle
                cx="60"
                cy="60"
                r="46"
                fill="none"
                stroke="var(--border)"
                strokeWidth="12"
              />
              {total > 0 && repair > 0 && (
                <circle
                  cx="60"
                  cy="60"
                  r="46"
                  fill="none"
                  stroke="#4a83e7"
                  strokeWidth="12"
                  strokeDasharray={`${(repair / total) * circumference} ${circumference}`}
                  transform="rotate(-90 60 60)"
                />
              )}
              <text
                x="60"
                y="59"
                textAnchor="middle"
                className="atlas-status-total"
              >
                {number(total)}
              </text>
              <text
                x="60"
                y="75"
                textAnchor="middle"
                className="atlas-status-total-label"
              >
                linked miners
              </text>
            </svg>
            <dl className="atlas-miner-status-legend">
              {[
                {
                  label: "Healthy / hashing",
                  color: "#3fb87c",
                  count: "—",
                  percent: "—",
                },
                {
                  label: "Warning",
                  color: "#e9a03b",
                  count: "—",
                  percent: "—",
                },
                {
                  label: "Zero hash",
                  color: "#e65e65",
                  count: "—",
                  percent: "—",
                },
                {
                  label: "Repair · reserved",
                  color: "#4a83e7",
                  count: number(repair),
                  percent: percentage(repair),
                },
                {
                  label: "Status unavailable",
                  color: "var(--muted-foreground)",
                  count: number(unknown),
                  percent: percentage(unknown),
                },
              ].map((item) => (
                <div key={item.label}>
                  <dt>
                    <i style={{ background: item.color }} />
                    {item.label}
                  </dt>
                  <dd>
                    {item.count}
                    <span>{item.percent}</span>
                  </dd>
                </div>
              ))}
            </dl>
          </div>
          <p className="atlas-status-data-note">
            Live hashing data is not connected. Repair reservations are recorded
            inventory, not telemetry.
          </p>
        </section>
      </div>
      <section
        className="atlas-card atlas-mining-readings"
        aria-labelledby="mining-readings-title"
      >
        <h2 id="mining-readings-title">Mining readings</h2>
        <div className="atlas-mining-readings-placeholder" />
      </section>
    </>
  )
}
