import { Server } from "lucide-react"
import styles from "./management.module.css"

// Unavailable data is intentionally not represented as zero or as a demo snapshot.
export function ManagementOverview() {
  return (
    <div className={styles.overview}>
      <header className={styles.header}>
        <div className={styles.brand}>
          <span className={styles.logo}>
            <Server size={23} />
          </span>
          <div>
            <strong>Atlas</strong>
            <span>Inventory intelligence</span>
          </div>
        </div>
        <div className={styles.headerNote}>
          MANAGEMENT<span>Operational clarity, across every site.</span>
        </div>
      </header>
      <main className={styles.main}>
        <section className={styles.titleRow}>
          <div>
            <p className={styles.eyebrow}>FLEET INTELLIGENCE</p>
            <h1>Management Overview</h1>
            <p className={styles.subtitle}>
              Inventory, reconciliation, and the exceptions worth a closer look.
            </p>
          </div>
          <div className={styles.scopeControls}>
            <label>
              Reporting scope
              <select aria-label="Management site" disabled>
                <option>No sites loaded</option>
              </select>
            </label>
          </div>
        </section>
        <section className={styles.kpiGrid} aria-label="Fleet metrics">
          {[
            "Registered assets",
            "Currently hashing",
            "Assets needing attention",
            "Logged in last 7 days",
          ].map((label) => (
            <article key={label} className={`${styles.card} ${styles.kpi}`}>
              <div className={styles.kpiLabel}>
                <h2>{label}</h2>
              </div>
              <p
                aria-label={`${label} unavailable`}
                style={{ fontSize: 32, margin: "18px 0" }}
              >
                —
              </p>
              <p className={styles.subtitle}>Awaiting operational data</p>
            </article>
          ))}
        </section>
        <section
          className={styles.card}
          style={{ padding: 32, marginTop: 24 }}
          aria-label="Management data availability"
        >
          <h2>No fleet records loaded</h2>
          <p className={styles.subtitle}>
            Site reports, findings, and history will appear when operational
            data is connected.
          </p>
        </section>
      </main>
    </div>
  )
}
