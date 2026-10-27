"use client"

import { useEffect, useId, useRef, useState } from "react"
import {
  Activity,
  ArrowUpRight,
  Boxes,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Flag,
  Info,
  MapPin,
  Search,
  Server,
  Unlink,
  X,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  SNAPSHOT_AT,
  categoryInfo,
  demoSites,
  formatDate,
  formatNumber as n,
  historyFor,
  issueCategories,
  percent,
  siteName,
  siteSummaries,
  statuses,
  summarize,
  type CategoryId,
  type DemoIssue,
  type HistoryPoint,
  type SiteFilter,
} from "./demo-data"
import styles from "./management.module.css"

const snapshotLabel = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
  timeZone: "America/Chicago",
}).format(new Date(SNAPSHOT_AT))
const pct = (part: number, total: number) =>
  `${percent(part, total).toFixed(1)}%`

function HistoryChart({ points }: { points: HistoryPoint[] }) {
  const [inspected, setInspected] = useState<number | null>(null)
  const gradientId = useId()
  const active = Math.min(inspected ?? points.length - 1, points.length - 1),
    point = points[active]
  const left = 52,
    right = 662,
    top = 18,
    bottom = 204
  const maximum = Math.max(
    1,
    ...points.map((item) => Math.max(item.hashing, item.other))
  )
  const step = Math.max(100, Math.ceil(maximum / 4 / 100) * 100),
    max = step * 4
  const x = (index: number) =>
      left + (index / (points.length - 1 || 1)) * (right - left),
    y = (value: number) => bottom - (value / max) * (bottom - top)
  const line = (key: "hashing" | "other") =>
    points.map((item, index) => `${x(index)},${y(item[key])}`).join(" ")
  const moveActive = (next: number) =>
    setInspected(Math.min(points.length - 1, Math.max(0, next)))
  return (
    <div className={styles.trend}>
      <div className={styles.chartReading} aria-live="polite">
        <time dateTime={point.at}>{formatDate(point.at)}</time>
        <span>
          <i style={{ background: statuses[0].color }} />
          {n(point.hashing)} hashing
        </span>
        <span>
          <i style={{ background: "#91a0b8" }} />
          {n(point.other)} other linked
        </span>
      </div>
      <svg
        viewBox="0 0 680 242"
        role="img"
        tabIndex={0}
        aria-label={`Status history from ${formatDate(points[0].at)} to ${formatDate(points.at(-1)!.at)}. Counts of hashing and other linked assets. Use left and right arrow keys to inspect days.`}
        onKeyDown={(event) => {
          if (["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) {
            event.preventDefault()
            moveActive(
              event.key === "Home"
                ? 0
                : event.key === "End"
                  ? points.length - 1
                  : active + (event.key === "ArrowRight" ? 1 : -1)
            )
          }
        }}
        onPointerMove={(event) => {
          const bounds = event.currentTarget.getBoundingClientRect()
          moveActive(
            Math.round(
              ((((event.clientX - bounds.left) / bounds.width) * 680 - left) /
                (right - left)) *
                (points.length - 1)
            )
          )
        }}
        onPointerLeave={() => setInspected(null)}
      >
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={statuses[0].color} stopOpacity=".15" />
            <stop offset="100%" stopColor={statuses[0].color} stopOpacity="0" />
          </linearGradient>
        </defs>
        {[0, 1, 2, 3, 4].map((tick) => (
          <g key={tick}>
            <line
              x1={left}
              x2={right}
              y1={y(tick * step)}
              y2={y(tick * step)}
              className={styles.gridLine}
            />
            <text
              x={left - 12}
              y={y(tick * step) + 4}
              textAnchor="end"
              className={styles.axisText}
            >
              {tick * step >= 1000
                ? `${((tick * step) / 1000).toLocaleString("en-US")}k`
                : tick * step}
            </text>
          </g>
        ))}
        <path
          d={`M${left},${bottom} L${line("hashing").replaceAll(" ", " L")} L${right},${bottom} Z`}
          fill={`url(#${gradientId})`}
        />
        <polyline
          points={line("hashing")}
          fill="none"
          stroke={statuses[0].color}
          strokeWidth="2.7"
          strokeLinejoin="round"
        />
        <polyline
          points={line("other")}
          fill="none"
          stroke="#91a0b8"
          strokeWidth="2"
          strokeDasharray="5 4"
        />
        <line
          x1={x(active)}
          x2={x(active)}
          y1={top}
          y2={bottom}
          className={styles.cursorLine}
        />
        <circle
          cx={x(active)}
          cy={y(point.hashing)}
          r="4.5"
          fill={statuses[0].color}
          stroke="var(--card)"
          strokeWidth="2"
        />
        {[
          0,
          Math.round((points.length - 1) / 3),
          Math.round(((points.length - 1) * 2) / 3),
          points.length - 1,
        ].map((index) => (
          <text
            key={index}
            x={x(index)}
            y="230"
            textAnchor={
              index === 0
                ? "start"
                : index === points.length - 1
                  ? "end"
                  : "middle"
            }
            className={styles.axisText}
          >
            {formatDate(points[index].at)}
          </text>
        ))}
      </svg>
      <p className={styles.chartHint}>
        Assets · hover or use arrow keys to inspect. “Other linked” includes
        every non-hashing status below.
      </p>
    </div>
  )
}

export function ManagementOverview() {
  const [scope, setScope] = useState<SiteFilter>("all")
  const [days, setDays] = useState<7 | 30>(30)
  const [category, setCategory] = useState<CategoryId | "all">("all")
  const [query, setQuery] = useState("")
  const [issuePage, setIssuePage] = useState(1)
  const [selectedIssue, setSelectedIssue] = useState<DemoIssue | null>(null)
  const drawer = useRef<HTMLDialogElement>(null)
  const summary = summarize(scope),
    points = historyFor(scope, days)
  const visibleSites = siteSummaries.filter(
    (site) => scope === "all" || site.id === scope
  )
  const trendChange = points.at(-1)!.hashing - points[0].hashing
  const filteredIssues = summary.scopedIssues.filter(
    (issue) =>
      (category === "all" || issue.category === category) &&
      `${issue.identifier} ${categoryInfo(issue.category).label} ${categoryInfo(issue.category).explanation} ${siteName(issue.siteId)}`
        .toLowerCase()
        .includes(query.trim().toLowerCase())
  )
  const issueRows = filteredIssues.slice((issuePage - 1) * 6, issuePage * 6)
  const topCategories = [...summary.categoryCounts]
    .sort((a, b) => b.count - a.count)
    .filter((item) => item.count > 0)
    .slice(0, 4)
  useEffect(() => {
    const element = drawer.current
    if (selectedIssue && !element?.open) element?.showModal()
    else if (!selectedIssue && element?.open) element.close()
  }, [selectedIssue])
  function selectScope(next: SiteFilter) {
    setScope(next)
    setIssuePage(1)
    setSelectedIssue(null)
  }
  const statusSegments: string[] = []
  let offset = 0
  for (const status of statuses) {
    const next = offset + percent(summary.counts[status.id], summary.linked)
    statusSegments.push(`${status.color} ${offset}% ${next}%`)
    offset = next
  }
  const kpis = [
    {
      label: "Total Assets Tracked",
      value: summary.total,
      Icon: Boxes,
      detail: "Registered inventory across the selected sites.",
      foot: `${visibleSites.length} ${visibleSites.length === 1 ? "site" : "sites"} in this view`,
      kind: "neutral",
    },
    {
      label: "Currently Hashing",
      value: summary.hashing,
      Icon: Activity,
      detail: "Assets hashing in the simulated Foreman-linked cohort.",
      foot: `${pct(summary.hashing, summary.linked)} of linked assets`,
      kind: "green",
    },
    {
      label: "Flagged for Review",
      value: summary.flagged,
      Icon: Flag,
      detail: "Distinct registered assets with one or more sample findings.",
      foot: `${n(summary.findings)} findings · assets counted once`,
      kind: "amber",
    },
    {
      label: "Logged in Last 7 Days",
      value: summary.recent,
      Icon: ClipboardList,
      detail:
        "Distinct assets with recent movement-log activity, not hashing activity.",
      foot: "Rolling 7 days before the sample snapshot",
      kind: "neutral",
    },
  ]
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
          <span className={styles.demoBadge}>Demo • Synthetic data</span>
        </div>
        <div className={styles.headerNote}>
          MANAGEMENT PREVIEW<span>Operational clarity, across every site.</span>
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
              <select
                aria-label="Management site"
                value={scope}
                onChange={(event) =>
                  selectScope(event.target.value as SiteFilter)
                }
              >
                <option value="all">All Sites</option>
                {demoSites.map((site) => (
                  <option key={site.id} value={site.id}>
                    {site.name}
                  </option>
                ))}
              </select>
            </label>
            <p>
              Sample snapshot{" "}
              <time dateTime={SNAPSHOT_AT}>{snapshotLabel} CT</time>
            </p>
          </div>
        </section>
        <div className={styles.snapshotHeading}>
          <span>
            <i />
            Current sample snapshot
          </span>
          <strong>
            {scope === "all" ? "All four sites" : siteName(scope)}
          </strong>
        </div>
        <section
          className={styles.kpiGrid}
          aria-label="Current snapshot metrics"
        >
          {kpis.map(({ label, value, Icon, detail, foot, kind }) => (
            <article key={label} className={`${styles.card} ${styles.kpi}`}>
              <div className={styles.kpiLabel}>
                <h2>{label}</h2>
                <span
                  className={
                    kind === "green"
                      ? styles.iconGreen
                      : kind === "amber"
                        ? styles.iconAmber
                        : styles.iconNeutral
                  }
                >
                  <Icon size={18} />
                </span>
              </div>
              <strong className={styles.kpiValue}>{n(value)}</strong>
              <p>{detail}</p>
              <footer>{foot}</footer>
            </article>
          ))}
        </section>
        <section
          className={`${styles.card} ${styles.reconciliation}`}
          aria-label="Telemetry reconciliation"
        >
          <div className={styles.reconciliationIntro}>
            <Unlink size={19} />
            <div>
              <h2>Telemetry reconciliation</h2>
              <p>Connections that need a closer look</p>
            </div>
          </div>
          <div className={styles.reconciliationMetric}>
            <span>Unlinked Telemetry</span>
            <strong>{n(summary.unlinkedTelemetry)}</strong>
            <p>Unmatched telemetry records · needs a decision</p>
          </div>
          <div className={styles.reconciliationMetric}>
            <span>Link Lost</span>
            <strong>{n(summary.lost)}</strong>
            <p>Registered assets previously linked, now not reporting</p>
          </div>
          <div className={styles.reconciliationMetric}>
            <span>Never Linked</span>
            <strong>{n(summary.never)}</strong>
            <p>Registered assets with no telemetry-link history</p>
          </div>
        </section>
        <p className={styles.populationNote}>
          Unmatched telemetry records are separate from tracked assets. Link
          Lost and Never Linked are mutually exclusive registered-asset groups.
        </p>
        <section
          className={styles.chartGrid}
          aria-label="Status and history charts"
        >
          <article className={`${styles.card} ${styles.statusCard}`}>
            <div className={styles.sectionHeader}>
              <div>
                <p className={styles.eyebrow}>CURRENT SNAPSHOT</p>
                <h2>Assets by current status</h2>
                <p>Foreman-linked assets only</p>
              </div>
              <span className={styles.pill}>
                {pct(summary.linked, summary.total)} of tracked
              </span>
            </div>
            <div className={styles.statusBody}>
              <div
                className={styles.donut}
                role="img"
                aria-label={`Foreman-linked population: ${n(summary.linked)}. ${statuses.map((status) => `${status.label}: ${n(summary.counts[status.id])}`).join(". ")}`}
                style={{
                  background: summary.linked
                    ? `conic-gradient(${statusSegments.join(",")})`
                    : "var(--muted)",
                }}
              >
                <div>
                  <span>Foreman-linked</span>
                  <strong>{n(summary.linked)}</strong>
                  <span>assets</span>
                </div>
              </div>
              <ul className={styles.legend}>
                {statuses.map((status) => (
                  <li key={status.id}>
                    <i style={{ background: status.color }} />
                    <span>{status.label}</span>
                    <strong>{n(summary.counts[status.id])}</strong>
                    <small>
                      {pct(summary.counts[status.id], summary.linked)}
                    </small>
                  </li>
                ))}
              </ul>
            </div>
            <footer className={styles.cardFootnote}>
              The {n(summary.total - summary.linked)} tracked assets without a
              current link are excluded from this breakdown. Physical location
              and operational status are independent sample concepts.
            </footer>
          </article>
          <article className={`${styles.card} ${styles.historyCard}`}>
            <div className={styles.sectionHeader}>
              <div>
                <p className={styles.eyebrow}>SAMPLED DAILY</p>
                <h2>Status history</h2>
                <p>
                  {scope === "all" ? "Company-wide" : siteName(scope)} ·{" "}
                  {formatDate(points[0].at)}–{formatDate(points.at(-1)!.at)}
                </p>
              </div>
              <div
                className={styles.rangeControl}
                role="group"
                aria-label="History range"
              >
                {([7, 30] as const).map((range) => (
                  <Button
                    key={range}
                    variant="ghost"
                    className={`${styles.rangeButton} ${days === range ? styles.rangeActive : ""}`}
                    aria-pressed={days === range}
                    onClick={() => setDays(range)}
                  >
                    {range} days
                  </Button>
                ))}
              </div>
            </div>
            <div className={styles.historySummary}>
              <strong>+{n(trendChange)}</strong>
              <span>
                hashing assets over {days} days{" "}
                <small>
                  Fixed current-linked cohort · metrics above remain at the
                  snapshot
                </small>
              </span>
            </div>
            <HistoryChart key={`${scope}-${days}`} points={points} />
          </article>
        </section>
        <section
          className={`${styles.card} ${styles.siteSection}`}
          aria-labelledby="site-performance-title"
        >
          <div className={styles.sectionHeader}>
            <div>
              <p className={styles.eyebrow}>
                ASSET DISTRIBUTION & AUDIT PROGRESS
              </p>
              <h2 id="site-performance-title">Site performance</h2>
              <p>Tracking coverage and telemetry reconciliation at a glance.</p>
            </div>
            <span className={styles.pill}>
              {n(summary.linked)} / {n(summary.total)} linked
            </span>
          </div>
          <div className={styles.tableScroll}>
            <table className={styles.siteTable}>
              <thead>
                <tr>
                  <th>Site</th>
                  <th>Tracked assets</th>
                  <th>Currently hashing</th>
                  <th>Flagged assets</th>
                  <th>Linked assets / total</th>
                  <th>Inventory audit progress</th>
                </tr>
              </thead>
              <tbody>
                {visibleSites.map((site) => (
                  <tr key={site.id}>
                    <td>
                      <button
                        className={styles.siteButton}
                        aria-label={`Filter dashboard to ${site.name}`}
                        onClick={() => selectScope(site.id)}
                      >
                        <span className={styles.siteIcon}>
                          <MapPin size={14} />
                        </span>
                        {site.name}
                        <ArrowUpRight size={13} />
                      </button>
                    </td>
                    <td>{n(site.total)}</td>
                    <td>
                      {n(site.hashing)}
                      <small>{pct(site.hashing, site.linked)} of linked</small>
                    </td>
                    <td>
                      <span className={styles.flagValue}>
                        {n(site.flagged)}
                      </span>
                    </td>
                    <td>
                      {n(site.linked)}{" "}
                      <span className={styles.muted}>/ {n(site.total)}</span>
                    </td>
                    <td>
                      <div className={styles.progressCell}>
                        <progress
                          aria-label={`${site.name} linked assets`}
                          max={site.total || 1}
                          value={site.linked}
                        />
                        <strong>{pct(site.linked, site.total)}</strong>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td>
                    {scope === "all" ? "Company total" : "Selected site total"}
                  </td>
                  <td>{n(summary.total)}</td>
                  <td>{n(summary.hashing)}</td>
                  <td>{n(summary.flagged)}</td>
                  <td>
                    {n(summary.linked)} / {n(summary.total)}
                  </td>
                  <td>{pct(summary.linked, summary.total)} linked</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </section>
        <section
          className={`${styles.card} ${styles.attention}`}
          aria-labelledby="attention-title"
        >
          <div className={styles.sectionHeader}>
            <div>
              <p className={styles.eyebrow}>REVIEW QUEUE</p>
              <h2 id="attention-title">Needs attention</h2>
              <p>
                Representative reconciliation findings · read-only sample
                evidence
              </p>
            </div>
            <span className={styles.reviewPill}>
              <Flag size={13} />
              {n(summary.findings)} open sample findings
            </span>
          </div>
          <div className={styles.attentionSummary}>
            <div>
              <strong>{n(summary.flagged)}</strong>
              <span>Distinct assets flagged</span>
            </div>
            <div>
              <strong>{n(summary.movementIssues)}</strong>
              <span>Movement-log integrity findings</span>
            </div>
            <p>
              One asset can have several findings. Unregistered log references
              are findings, but are not counted as flagged registered assets.
            </p>
          </div>
          <div className={styles.issueChips}>
            {topCategories.map((item) => (
              <button
                key={item.id}
                className={category === item.id ? styles.chipActive : ""}
                onClick={() => {
                  setCategory(category === item.id ? "all" : item.id)
                  setIssuePage(1)
                }}
                aria-pressed={category === item.id}
              >
                {item.label}
                <strong>{n(item.count)}</strong>
              </button>
            ))}
          </div>
          <div className={styles.issueFilters}>
            <label className={styles.searchField}>
              <Search size={15} />
              <span className="sr-only">Search sample findings</span>
              <input
                value={query}
                onChange={(event) => {
                  setQuery(event.target.value)
                  setIssuePage(1)
                }}
                placeholder="Search demo ID or finding…"
                type="search"
              />
            </label>
            <select
              aria-label="Finding category"
              value={category}
              onChange={(event) => {
                setCategory(event.target.value as CategoryId | "all")
                setIssuePage(1)
              }}
            >
              <option value="all">All issue categories</option>
              {issueCategories.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.label}
                </option>
              ))}
            </select>
            <p role="status">{n(filteredIssues.length)} matching findings</p>
          </div>
          <div className={styles.tableScroll}>
            <table className={styles.issueTable}>
              <thead>
                <tr>
                  <th>Sample identifier</th>
                  <th>Site</th>
                  <th>Issue category</th>
                  <th>Why it needs review</th>
                  <th>
                    <span className="sr-only">Read sample evidence</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {issueRows.map((issue) => (
                  <tr key={issue.id}>
                    <td>
                      <span className={styles.assetId}>{issue.identifier}</span>
                      {!issue.assetId && (
                        <small>Unregistered log reference</small>
                      )}
                    </td>
                    <td>{siteName(issue.siteId)}</td>
                    <td>
                      <span className={styles.issueCategory}>
                        {categoryInfo(issue.category).label}
                      </span>
                    </td>
                    <td>{categoryInfo(issue.category).explanation}</td>
                    <td>
                      <button
                        className={styles.evidenceButton}
                        aria-label={`View evidence for ${issue.id}`}
                        onClick={() => setSelectedIssue(issue)}
                      >
                        View
                        <ChevronRight size={14} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!issueRows.length && (
            <div className={styles.emptyState}>
              <Search size={23} />
              <h3>No sample findings match these filters.</h3>
              <Button
                variant="outline"
                className={styles.clearButton}
                onClick={() => {
                  setCategory("all")
                  setQuery("")
                  setIssuePage(1)
                }}
              >
                Clear issue filters
              </Button>
            </div>
          )}
          <div className={styles.tableFooter}>
            <span>Sample findings, not production detection rules</span>
            <div>
              <span>
                {filteredIssues.length
                  ? `${(issuePage - 1) * 6 + 1}–${Math.min(issuePage * 6, filteredIssues.length)} of ${n(filteredIssues.length)}`
                  : "0 results"}
              </span>
              <Button
                variant="outline"
                size="icon-sm"
                aria-label="Previous findings page"
                disabled={issuePage === 1}
                onClick={() => setIssuePage(issuePage - 1)}
              >
                <ChevronLeft size={14} />
              </Button>
              <Button
                variant="outline"
                size="icon-sm"
                aria-label="Next findings page"
                disabled={issuePage * 6 >= filteredIssues.length}
                onClick={() => setIssuePage(issuePage + 1)}
              >
                <ChevronRight size={14} />
              </Button>
            </div>
          </div>
        </section>
        <footer className={styles.footer}>
          <Info size={15} />
          <p>
            Telemetry, links, reconciliation findings, and status history are
            simulated future reporting capabilities. No production integration,
            sync, detection, or write is performed. All identifiers and people
            shown here are invented.
          </p>
          <span>ATLAS / MANAGEMENT DEMO</span>
        </footer>
      </main>
      <dialog
        ref={drawer}
        className={styles.drawer}
        aria-labelledby="management-evidence-title"
        onCancel={() => setSelectedIssue(null)}
        onClose={() => setSelectedIssue(null)}
        onClick={(event) => {
          if (event.target !== event.currentTarget) return
          const bounds = event.currentTarget.getBoundingClientRect()
          if (
            event.clientX < bounds.left ||
            event.clientX > bounds.right ||
            event.clientY < bounds.top ||
            event.clientY > bounds.bottom
          )
            setSelectedIssue(null)
        }}
      >
        <header>
          <div>
            <p className={styles.eyebrow}>READ-ONLY · SYNTHETIC EVIDENCE</p>
            <h2 id="management-evidence-title">Finding details</h2>
          </div>
          <button
            aria-label="Close finding details"
            onClick={() => setSelectedIssue(null)}
          >
            <X size={20} />
          </button>
        </header>
        {selectedIssue && (
          <div className={styles.drawerBody}>
            <span className={styles.reviewPill}>
              Sample reconciliation finding
            </span>
            <h3>{categoryInfo(selectedIssue.category).label}</h3>
            <p className={styles.drawerDescription}>
              {categoryInfo(selectedIssue.category).explanation}
            </p>
            <dl>
              <div>
                <dt>
                  {selectedIssue.assetId
                    ? "Synthetic asset identifier"
                    : "Unregistered log reference"}
                </dt>
                <dd className={styles.assetId}>{selectedIssue.identifier}</dd>
              </div>
              <div>
                <dt>Site</dt>
                <dd>{siteName(selectedIssue.siteId)}</dd>
              </div>
              <div>
                <dt>Sample recorded-by person</dt>
                <dd>{selectedIssue.recordedBy}</dd>
              </div>
              <div>
                <dt>Sample snapshot</dt>
                <dd>{snapshotLabel} CT</dd>
              </div>
            </dl>
            <section>
              <h4>Movement-log evidence</h4>
              <p>{categoryInfo(selectedIssue.category).movement}</p>
            </section>
            <section>
              <h4>Telemetry evidence</h4>
              <p>{categoryInfo(selectedIssue.category).telemetry}</p>
            </section>
            <div className={styles.drawerDisclaimer}>
              <Info size={16} />
              <p>
                Illustrative supporting details only. This preview does not
                resolve, acknowledge, relink, or modify any record. Physical
                location does not establish operational status.
              </p>
            </div>
          </div>
        )}
      </dialog>
    </div>
  )
}
