import { Building2, Cpu, Layers, MapPin, Wrench } from "lucide-react"
import type { DashboardData } from "@/lib/dashboard/contracts"

const number = (value: number) => new Intl.NumberFormat("en-US").format(value)

export function SiteOverview({ dashboard }: { dashboard: DashboardData }) {
  const { summary, buildings } = dashboard
  if (!summary) return null
  const cards = [
    {
      label: "Miners at this site",
      value: summary.miners,
      Icon: Cpu,
      note: "Physical location recorded at this site",
    },
    {
      label: "Deployed miners",
      value: summary.deployed,
      Icon: MapPin,
      note: "Assigned to deployment slots · live status unknown",
    },
    {
      label: "Miners in repair",
      value: summary.repair,
      Icon: Wrench,
      note: `${number(summary.staging)} in staging · ${number(summary.pallet)} on pallets`,
    },
    {
      label: "Configured deployment slots",
      value: summary.slots,
      Icon: Layers,
      note: `${number(summary.occupied)} occupied · ${number(summary.reserved)} reserved`,
    },
  ]
  return (
    <>
      <div className="atlas-overview-grid">
        <section className="atlas-metrics" aria-label="Site inventory counts">
          {cards.map(({ label, value, Icon, note }) => (
            <article key={label} className="atlas-card atlas-metric">
              <div className="atlas-metric-heading">
                <h2>{label}</h2>
                <Icon size={17} aria-hidden="true" />
              </div>
              <div className="atlas-metric-value">{number(value)}</div>
              <p className="atlas-muted">{note}</p>
            </article>
          ))}
        </section>
        <section
          className="atlas-card atlas-status"
          aria-labelledby="installed-components-title"
        >
          <div className="atlas-section-header">
            <h2 id="installed-components-title">Installed components</h2>
          </div>
          <p className="atlas-muted">
            Parts assigned to miners physically at this site.
          </p>
          <dl className="atlas-dashboard-components">
            <div>
              <dt>Skeletons</dt>
              <dd>{number(summary.skeletons)}</dd>
            </div>
            <div>
              <dt>Control boards</dt>
              <dd>{number(summary.controlBoards)}</dd>
            </div>
            <div>
              <dt>Hashboards</dt>
              <dd>{number(summary.hashBoards)}</dd>
            </div>
          </dl>
          <p className="atlas-subtle">
            Loose inventory is excluded. Installed counts do not indicate mining
            health.
          </p>
        </section>
      </div>
      <section
        className="atlas-card atlas-temperature atlas-dashboard-section"
        aria-labelledby="site-configuration-title"
      >
        <div className="atlas-section-header">
          <div>
            <h2 id="site-configuration-title">
              <Building2 size={17} aria-hidden="true" /> Site configuration
            </h2>
            <p className="atlas-muted">
              Registered buildings, cans, and deployment slots. Inactive
              configuration remains visible.
            </p>
          </div>
        </div>
        {!buildings.length ? (
          <p className="atlas-empty">
            No buildings have been configured at this site yet.
          </p>
        ) : (
          buildings.map((building) => (
            <div className="atlas-building" key={building.id}>
              <div className="atlas-building-heading">
                <h3>
                  Building {building.number}
                  {!building.active && " · Inactive"}
                </h3>
                <span className="atlas-muted">
                  {number(building.cans.length)} cans
                </span>
              </div>
              {!building.cans.length ? (
                <p className="atlas-muted">No cans configured.</p>
              ) : (
                <div className="atlas-dashboard-cans">
                  {building.cans.map((can) => (
                    <div className="atlas-can" key={can.id}>
                      <span>
                        Can {can.number}
                        {!can.active && " · Inactive"}
                      </span>
                      <strong>{number(can.slots)}</strong>
                      <span>configured slots</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))
        )}
      </section>
      <section
        className="atlas-card atlas-temperature atlas-dashboard-section"
        aria-labelledby="mining-readings-title"
      >
        <h2 id="mining-readings-title">Mining readings</h2>
        <p className="atlas-muted">
          No live hash-rate, temperature, or online-status readings have been
          received yet.
        </p>
      </section>
    </>
  )
}
