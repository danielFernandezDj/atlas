"use client"

import { useState } from "react"
import {
  Activity,
  Cpu,
  LayoutDashboard,
  Map,
  Server,
  UserRound,
  Zap,
} from "lucide-react"
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

// The workspace has no operational data source yet. Do not fall back to demo fixtures.
export function TechnicianDashboard() {
  const [view, setView] = useState<View>("dashboard")
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
            <select id="active-site" disabled aria-label="Workspace site">
              <option>No sites loaded</option>
            </select>
          </div>
          <span className="atlas-muted">Awaiting site data</span>
        </header>
        <main className="atlas-main">
          <div className="atlas-page-heading">
            <div>
              <p className="atlas-eyebrow">ATLAS / OPERATIONS</p>
              <h1>{titles[view]}</h1>
              <p className="atlas-muted">
                Your workspace is ready for operational data.
              </p>
            </div>
          </div>
          {view === "dashboard" && (
            <>
              <BitcoinStrip />
              <section
                className="atlas-card"
                aria-label="Mining metrics"
                style={{ padding: 24, marginBottom: 20 }}
              >
                <h2>Mining metrics</h2>
                <p className="atlas-muted">
                  Hash rate, miner status, and temperatures are unavailable
                  until site data is connected.
                </p>
              </section>
            </>
          )}
          <section
            className="atlas-card"
            aria-label={`${titles[view]} availability`}
            style={{ padding: 32 }}
          >
            <Activity size={24} aria-hidden="true" />
            <h2>
              {view === "dashboard"
                ? "No movement history loaded"
                : view === "site-map"
                  ? "No site configuration loaded"
                  : view === "miners"
                    ? "No miner inventory loaded"
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
        </main>
      </div>
    </div>
  )
}
