"use client"

import { useState, useTransition } from "react"
import {
  Check,
  ChevronDown,
  MapPin,
  Cpu,
  LayoutDashboard,
  Map,
  Server,
  Zap,
} from "lucide-react"
import { Select } from "@base-ui/react/select"
import { useRouter } from "next/navigation"
import type { DashboardData } from "@/lib/dashboard/contracts"
import {
  LiveMinerWorkspace,
  MinerInventorySearch,
} from "./technician/live-miner-workspace"
import type { LastMapPort } from "@/lib/site-map/live-contracts"
import { LiveSiteMap } from "./technician/live-site-map"
import { SiteOverview } from "./technician/site-overview"
import { MovementHistory } from "./technician/movement-history"
import { WeatherOutlook } from "./technician/weather-outlook"
import { SiteClock } from "./technician/site-clock"
import { InventoryActions } from "./technician/inventory-actions"
import { AccountMenu } from "./technician/account-menu"
import type { ActionContext } from "@/lib/inventory-actions/contracts"
import { BitcoinStrip } from "./technician/bitcoin-strip"
import "./technician/technician-dashboard.css"

type View = "dashboard" | "site-map" | "miners"
const views = [
  { id: "dashboard", label: "Dashboard", Icon: LayoutDashboard },
  { id: "site-map", label: "Site map", Icon: Map },
  { id: "miners", label: "Miners", Icon: Cpu },
] as const
const titles: Record<View, string> = {
  dashboard: "Site dashboard",
  "site-map": "Site map",
  miners: "Miner workspace",
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
  const [selectedMinerId, setSelectedMinerId] = useState<number | null>(null)
  const [lastPorts, setLastPorts] = useState<Record<number, LastMapPort>>({})
  const [actionContext, setActionContext] = useState<ActionContext | null>(null)
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
          <button
            title="Actions"
            aria-label="Actions"
            onClick={() =>
              setActionContext(
                view === "miners" && selectedMinerId
                  ? { minerId: selectedMinerId }
                  : {}
              )
            }
          >
            <Zap />
            <span>Actions</span>
          </button>
        </nav>
        <div className="atlas-rail-bottom">
          <AccountMenu viewer={viewer} />
          <span className="atlas-rail-version">ATLAS / MVP</span>
        </div>
      </aside>
      <div className="atlas-shell">
        <header className="atlas-topbar">
          <div className="atlas-site-selector">
            <label htmlFor="active-site">
              Workspace / <span>Site</span>
            </label>
            <Select.Root
              value={selectedSite ? String(selectedSite.id) : null}
              items={sites.map((site) => ({
                value: String(site.id),
                label: `${site.name}${!site.is_active ? " · Inactive" : ""}`,
              }))}
              disabled={!sites.length || pending}
              onValueChange={(value) => {
                if (value) changeSite(value)
              }}
            >
              <Select.Trigger
                id="active-site"
                className="atlas-site-trigger"
                aria-label="Workspace site"
              >
                <MapPin size={16} aria-hidden="true" />
                <Select.Value
                  placeholder={sites.length ? "Choose a site" : "No sites yet"}
                />
                <Select.Icon className="atlas-site-chevron">
                  <ChevronDown size={15} aria-hidden="true" />
                </Select.Icon>
              </Select.Trigger>
              <Select.Portal>
                <Select.Positioner
                  className="atlas-site-positioner"
                  sideOffset={7}
                  align="start"
                  alignItemWithTrigger={false}
                >
                  <Select.Popup className="atlas-site-popup">
                    <Select.List>
                      {sites.map((site) => (
                        <Select.Item
                          key={site.id}
                          value={String(site.id)}
                          className="atlas-site-option"
                        >
                          <Select.ItemText>
                            {site.name}
                            {!site.is_active && " · Inactive"}
                          </Select.ItemText>
                          <Select.ItemIndicator>
                            <Check size={15} aria-hidden="true" />
                          </Select.ItemIndicator>
                        </Select.Item>
                      ))}
                    </Select.List>
                  </Select.Popup>
                </Select.Positioner>
              </Select.Portal>
            </Select.Root>
          </div>
          {selectedSite && (
            <WeatherOutlook
              key={selectedSite.id}
              siteName={selectedSite.name}
              refreshKey={dashboard.loadedAt}
            />
          )}
          <div className="atlas-topbar-right">
            <span className="sr-only" role="status">
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
            <SiteClock />
          </div>
        </header>
        <main className="atlas-main" aria-busy={pending}>
          {view !== "site-map" && (
            <div className="atlas-page-heading">
              <div>
                <p className="atlas-eyebrow">ATLAS / OPERATIONS</p>
                <h1>{titles[view]}</h1>
                <p className="atlas-muted">
                  {view === "miners"
                    ? "Selected miner identity, components and recorded history."
                    : (selectedSite?.description ??
                      "Site inventory and recent recorded movements.")}
                </p>
              </div>
              {view === "miners" && (
                <button
                  className="atlas-action-primary"
                  disabled={!selectedMinerId}
                  onClick={() =>
                    setActionContext({ minerId: selectedMinerId! })
                  }
                >
                  <Zap size={15} />
                  Miner actions
                </button>
              )}
              {view === "dashboard" && (
                <MinerInventorySearch
                  key={selectedSite?.id ?? "all"}
                  sites={sites}
                  initialSite={selectedSite?.id ?? null}
                  onSelect={(id) => {
                    setSelectedMinerId(id)
                    setView("miners")
                  }}
                />
              )}
            </div>
          )}
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
          {view === "site-map" &&
            (selectedSite ? (
              <LiveSiteMap
                key={selectedSite.id}
                siteId={selectedSite.id}
                buildings={dashboard.buildings}
                lastPort={lastPorts[selectedSite.id] ?? null}
                onPortSelect={(port) =>
                  setLastPorts((previous) => ({
                    ...previous,
                    [port.siteId]: port,
                  }))
                }
                refreshKey={dashboard.loadedAt}
                onAction={setActionContext}
                onMiner={(id) => {
                  setSelectedMinerId(id)
                  setView("miners")
                }}
              />
            ) : (
              <section className="atlas-card" style={{ padding: 32 }}>
                <h2>Choose a site</h2>
                <p className="atlas-muted">
                  Select a site to see its buildings, cans and port locations.
                </p>
              </section>
            ))}
          {view === "miners" && (
            <LiveMinerWorkspace
              key={`${selectedMinerId ?? "none"}-${dashboard.loadedAt}`}
              selectedId={selectedMinerId}
              onSearch={() => setView("dashboard")}
              refreshKey={dashboard.loadedAt}
            />
          )}
        </main>
      </div>
      {actionContext && (
        <InventoryActions
          key={JSON.stringify(actionContext)}
          context={actionContext}
          siteId={selectedSite?.id ?? null}
          onClose={() => setActionContext(null)}
          onSaved={() => startTransition(() => router.refresh())}
          onOpenMiner={(id) => {
            setActionContext(null)
            setSelectedMinerId(id)
            setView("miners")
          }}
        />
      )}
    </div>
  )
}
