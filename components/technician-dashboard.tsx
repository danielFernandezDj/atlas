"use client"

import { useState, useTransition } from "react"
import {
  Activity,
  Cpu,
  LayoutDashboard,
  Map,
  Server,
  UserRound,
  Zap,
} from "lucide-react"
import { useRouter } from "next/navigation"
import type { DashboardData } from "@/lib/dashboard/contracts"
import { LiveMinerWorkspace } from "./technician/live-miner-workspace"
import { SiteOverview } from "./technician/site-overview"
import { MovementHistory } from "./technician/movement-history"
import { BitcoinStrip } from "./technician/bitcoin-strip"
import "./technician/technician-dashboard.css"

type View = "dashboard" | "site-map" | "miners" | "actions" | "account"
const views = [
  { id: "dashboard", label: "Dashboard", Icon: LayoutDashboard },
  { id: "site-map", label: "Site map", Icon: Map },
  { id: "miners", label: "Miners", Icon: Cpu },
  { id: "actions", label: "Actions", Icon: Zap },
  { id: "account", label: "Account", Icon: UserRound },
] as const
const titles: Record<View, string> = {
  dashboard: "Site dashboard",
  "site-map": "Site map",
  miners: "Miner workspace",
  actions: "Actions",
  account: "Account",
}

type TechnicianDashboardProps = {
  dashboard: DashboardData
  viewer: { name: string; role: string }
}

export function TechnicianDashboard({
  dashboard,
  viewer,
}: TechnicianDashboardProps) {
  const [view, setView] = useState<View>("dashboard")
  const [pending, startTransition] = useTransition()
  const router = useRouter()
  const { sites, selectedSite } = dashboard
  function changeSite(value: string) {
    if (!value) return
    const params = new URLSearchParams(window.location.search)
    params.set("site", value)
    startTransition(() =>
      router.replace(`/technician?${params.toString()}`, { scroll: false })
    )
  }
  return (
    <div className="atlas-workspace">
      <aside className="atlas-rail" aria-label="Main navigation">
        <div className="atlas-logo" title="Atlas">
          <Server size={23} />
        </div>
        <nav>
          {views.map(({ id, label, Icon }) => (
            <button
              key={id}
              title={label}
              aria-label={label}
              aria-current={view === id ? "page" : undefined}
              className={view === id ? "is-active" : ""}
              onClick={() => setView(id)}
            >
              <Icon />
              <span>{label}</span>
            </button>
          ))}
        </nav>
        <div className="atlas-rail-bottom">
          <span className="atlas-rail-version">ATLAS / MVP</span>
        </div>
      </aside>
      <div className="atlas-shell">
        <header className="atlas-topbar">
          <div className="atlas-site-selector">
            <label htmlFor="active-site">
              Workspace / <span>Site</span>
            </label>
            <select
              id="active-site"
              aria-label="Workspace site"
              value={selectedSite?.id ?? ""}
              disabled={!sites.length || pending}
              onChange={(event) => changeSite(event.target.value)}
            >
              {!selectedSite && (
                <option value="">
                  {sites.length ? "Choose a site" : "No sites yet"}
                </option>
              )}
              {sites.map((site) => (
                <option key={site.id} value={site.id}>
                  {site.name}
                  {!site.is_active && " · Inactive"}
                </option>
              ))}
            </select>
          </div>
          <div className="atlas-topbar-right">
            <span className="atlas-muted" role="status">
              {pending
                ? "Updating site…"
                : selectedSite
                  ? `${selectedSite.name}${!selectedSite.is_active ? " · Inactive site" : ""}`
                  : "No site selected"}
            </span>
            <button
              className="atlas-chip"
              disabled={pending}
              onClick={() => startTransition(() => router.refresh())}
            >
              Refresh
            </button>
          </div>
        </header>
        <main className="atlas-main" aria-busy={pending}>
          <div className="atlas-page-heading">
            <div>
              <p className="atlas-eyebrow">ATLAS / OPERATIONS</p>
              <h1>{titles[view]}</h1>
              <p className="atlas-muted">
                {selectedSite?.description ??
                  "Site inventory and recent recorded movements."}
              </p>
            </div>
          </div>
          {view === "dashboard" && (
            <>
              <BitcoinStrip />
              {selectedSite ? (
                <>
                  <SiteOverview dashboard={dashboard} />
                  <MovementHistory
                    key={selectedSite.id}
                    movements={dashboard.movements}
                  />
                </>
              ) : (
                <section
                  className="atlas-card"
                  style={{ padding: 32 }}
                  role="status"
                >
                  <h2>
                    {dashboard.siteUnavailable
                      ? "Site unavailable"
                      : "No sites yet"}
                  </h2>
                  <p className="atlas-muted">
                    {dashboard.siteUnavailable
                      ? "Choose an available site to load its dashboard."
                      : "Your site configuration and inventory will appear here once records are added."}
                  </p>
                </section>
              )}
              <footer className="atlas-page-footer">
                <span>Read-only inventory · {viewer.name}</span>
                <span>
                  Loaded{" "}
                  <time dateTime={dashboard.loadedAt}>
                    {new Intl.DateTimeFormat("en-US", {
                      timeZone: "America/Chicago",
                      hour: "numeric",
                      minute: "2-digit",
                    }).format(new Date(dashboard.loadedAt))}{" "}
                    CT
                  </time>
                </span>
              </footer>
            </>
          )}
          {view === "miners" && (
            <LiveMinerWorkspace
              key={selectedSite?.id ?? "all"}
              sites={sites}
              initialSite={selectedSite?.id ?? null}
              refreshKey={dashboard.loadedAt}
            />
          )}
          {view !== "dashboard" && view !== "miners" && (
            <section
              className="atlas-card"
              aria-label={`${titles[view]} availability`}
              style={{ padding: 32 }}
            >
              <Activity size={24} aria-hidden="true" />
              <h2>
                {view === "site-map"
                  ? "No site configuration loaded"
                  : view === "actions"
                    ? "Actions unavailable"
                    : "No profile loaded"}
              </h2>
              <p className="atlas-muted">
                {view === "site-map"
                  ? "Sites, buildings, cans, and positions will appear when configuration is connected."
                  : view === "actions"
                    ? "Registration and movement recording will be available when inventory and account access are connected."
                    : view === "account"
                      ? "Your identity and assigned sites will appear after sign-in is connected."
                      : "Connect operational data to see records here."}
              </p>
            </section>
          )}
        </main>
      </div>
    </div>
  )
}
