"use client"

import { useEffect, useRef, useState } from "react"
import {
  Activity,
  ArrowRight,
  ChevronDown,
  Clock3,
  Cpu,
  LayoutDashboard,
  Map,
  Plus,
  Server,
  ShieldCheck,
  Hash,
  UserRound,
  Wrench,
  X,
  Zap,
} from "lucide-react"
import { type SiteId, demoSites, demoTechnician } from "@/lib/demo/technician"
import { createDemoMinerService } from "@/lib/demo/miner-service"
import { locationPath, reasonLabels } from "@/lib/miners/contracts"
import { AddMinerForm } from "./technician/add-miner-form"
import { BitcoinStrip } from "./technician/bitcoin-strip"
import { MovementHistory } from "./technician/movement-history"
import { MinerWorkspace } from "./technician/miner-workspace"
import { SiteMap } from "./technician/site-map"
import { SiteOverview } from "./technician/site-overview"
import { WeatherOutlook } from "./technician/weather-outlook"
import "./technician/technician-dashboard.css"

type View = "dashboard" | "miners" | "site-map"
type Overlay = "actions" | "account" | null

function WorkspaceClock() {
  const [now, setNow] = useState<Date | null>(null)
  useEffect(() => {
    const update = () => setNow(new Date())
    update()
    const timer = setInterval(update, 1000)
    return () => clearInterval(timer)
  }, [])
  return (
    <div className="atlas-clock">
      <Clock3 size={15} />
      <div>
        <time dateTime={now?.toISOString()}>
          {now
            ? now.toLocaleTimeString("en-US", {
                hour: "2-digit",
                minute: "2-digit",
                second: "2-digit",
                hour12: false,
                timeZone: "America/Chicago",
              })
            : "--:--:--"}
          <span> CT</span>
        </time>
        <p>
          {now
            ? now.toLocaleDateString("en-US", {
                weekday: "short",
                month: "short",
                day: "numeric",
                year: "numeric",
                timeZone: "America/Chicago",
              })
            : "Central Time"}
        </p>
      </div>
    </div>
  )
}

export function TechnicianDashboard() {
  const [view, setView] = useState<View>("dashboard")
  const [activeSiteId, setActiveSiteId] = useState<SiteId>("north")
  const [minerService] = useState(() => createDemoMinerService())
  function dashboardHistory() {
    return minerService.dashboardHistory().map((movement) => ({
      id: String(movement.id),
      serial: movement.serial_number,
      fromSiteId:
        demoSites[
          (movement.from_location?.site_id ?? movement.to_location.site_id) - 1
        ].id,
      toSiteId: demoSites[movement.to_location.site_id - 1].id,
      from: movement.from_location
        ? locationPath(movement.from_location)
        : "Source location not recorded",
      to: locationPath(movement.to_location),
      reason: reasonLabels[movement.reason],
      at: movement.recorded_at,
      by: movement.recorded_by.name,
    }))
  }
  const [history, setHistory] = useState(dashboardHistory)
  const [initialSerial, setInitialSerial] = useState("")
  const [repair, setRepair] = useState(false)
  const [minerSession, setMinerSession] = useState(0)
  const [overlay, setOverlay] = useState<Overlay>(null)
  const [actionStep, setActionStep] = useState<"choose" | "add">("choose")
  const [addPending, setAddPending] = useState(false)
  const dialogRef = useRef<HTMLDialogElement>(null)
  const headingRef = useRef<HTMLHeadingElement>(null)
  const site = demoSites.find((item) => item.id === activeSiteId)!
  const siteHistory = history.filter(
    (item) => item.fromSiteId === activeSiteId || item.toSiteId === activeSiteId
  )
  useEffect(() => {
    if (overlay && !dialogRef.current?.open) dialogRef.current?.showModal()
    else if (!overlay && dialogRef.current?.open) dialogRef.current.close()
  }, [overlay])
  useEffect(() => {
    headingRef.current?.focus()
    window.scrollTo({ top: 0, behavior: "instant" })
  }, [view, minerSession])
  function navigate(next: View, serial = "", isRepair = false) {
    setView(next)
    setInitialSerial(serial)
    setRepair(isRepair)
    setMinerSession((value) => value + 1)
    setOverlay(null)
  }
  return (
    <div className="atlas-workspace">
      <aside className="atlas-rail" aria-label="Main navigation">
        <div className="atlas-logo" title="Atlas">
          <Server size={23} />
        </div>
        <nav>
          <button
            title="Dashboard"
            aria-label="Dashboard"
            aria-current={view === "dashboard" ? "page" : undefined}
            className={view === "dashboard" ? "is-active" : ""}
            onClick={() => navigate("dashboard")}
          >
            <LayoutDashboard />
            <span>Dashboard</span>
          </button>
          <button
            title="Site map"
            aria-label="Site map"
            aria-current={view === "site-map" ? "page" : undefined}
            className={view === "site-map" ? "is-active" : ""}
            onClick={() => navigate("site-map")}
          >
            <Map />
            <span>Site map</span>
          </button>
          <button
            title="Miners"
            aria-label="Miners"
            aria-current={view === "miners" ? "page" : undefined}
            className={view === "miners" ? "is-active" : ""}
            onClick={() => navigate("miners")}
          >
            <Cpu />
            <span>Miners</span>
          </button>
          <button
            title="Actions"
            aria-label="Actions"
            aria-haspopup="dialog"
            onClick={() => {
              setActionStep("choose")
              setOverlay("actions")
            }}
          >
            <Zap />
            <span>Actions</span>
          </button>
        </nav>
        <div className="atlas-rail-bottom">
          <span className="atlas-rail-line" />
          <button
            title="Account"
            aria-label="Account"
            aria-haspopup="dialog"
            onClick={() => setOverlay("account")}
          >
            <UserRound />
            <span>Account</span>
          </button>
          <span className="atlas-rail-version">ATLAS / MVP</span>
        </div>
      </aside>
      <div className="atlas-shell">
        <header className="atlas-topbar">
          <div className="atlas-site-selector">
            <label htmlFor="active-site">
              Workspace / <span>Site</span>
            </label>
            <div>
              <span className="atlas-site-dot" />
              <select
                id="active-site"
                value={activeSiteId}
                onChange={(event) => {
                  setActiveSiteId(event.target.value as SiteId)
                  setInitialSerial("")
                  setRepair(false)
                  setMinerSession((value) => value + 1)
                }}
              >
                {demoSites.map((item) => (
                  <option value={item.id} key={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
              <ChevronDown size={14} />
            </div>
          </div>
          <WeatherOutlook siteId={activeSiteId} />
          <div className="atlas-topbar-right">
            <span className="atlas-demo-chip">Demo workspace</span>
            <WorkspaceClock />
          </div>
        </header>
        <main className="atlas-main">
          <div className="atlas-page-heading">
            <div>
              <p className="atlas-eyebrow">ATLAS / OPERATIONS / DEMO</p>
              <h1 ref={headingRef} tabIndex={-1}>
                {view === "dashboard"
                  ? "Site dashboard"
                  : view === "site-map"
                    ? "Site map"
                    : "Miner workspace"}
              </h1>
              <p className="atlas-muted">
                {view === "dashboard"
                  ? `Here’s what’s happening at ${site.name} today.`
                  : view === "site-map"
                    ? "Explore physical placement, find available slots, and inspect miners."
                    : "Find a miner, record its next move, and review your activity."}
              </p>
            </div>
            <div className="atlas-heading-meta">
              <span className="atlas-chip">
                <span className="atlas-small-dot" />
                {site.name}
              </span>
              <p className="atlas-muted">Synthetic operational data</p>
            </div>
          </div>
          {view === "dashboard" ? (
            <>
              <BitcoinStrip />
              <SiteOverview site={site} />
              <MovementHistory
                movements={siteHistory}
                onSelect={(serial) => navigate("miners", serial)}
              />
              <footer className="atlas-page-footer">
                <span>
                  <ShieldCheck size={13} />
                  Technician workspace · 4 assigned sites
                </span>
                <span>
                  Illustrative fleet snapshots · sample movements update
                  separately
                </span>
              </footer>
            </>
          ) : view === "site-map" ? (
            <SiteMap
              key={`${activeSiteId}-${minerSession}`}
              scope={{
                id: demoSites.findIndex((item) => item.id === activeSiteId) + 1,
                name: site.name,
              }}
              service={minerService}
              onInspect={(serial) => navigate("miners", serial)}
            />
          ) : (
            <MinerWorkspace
              key={`${activeSiteId}-${minerSession}`}
              scope={{
                id: demoSites.findIndex((item) => item.id === activeSiteId) + 1,
                name: site.name,
              }}
              service={minerService}
              initialSerial={initialSerial}
              repair={repair}
              onMovement={() => setHistory(dashboardHistory())}
            />
          )}
        </main>
      </div>
      <dialog
        ref={dialogRef}
        className={`atlas-dialog ${overlay === "actions" && actionStep === "add" ? "atlas-registration-dialog" : ""}`}
        aria-labelledby="workspace-dialog-title"
        onCancel={(event) => {
          if (addPending) event.preventDefault()
          else setOverlay(null)
        }}
        onClose={() => setOverlay(null)}
        onClick={(event) => {
          if (!addPending && event.target === event.currentTarget) {
            const rect = event.currentTarget.getBoundingClientRect()
            if (
              event.clientX < rect.left ||
              event.clientX > rect.right ||
              event.clientY < rect.top ||
              event.clientY > rect.bottom
            )
              setOverlay(null)
          }
        }}
      >
        <div className="atlas-dialog-header">
          <span className="atlas-eyebrow">
            {overlay === "account" ? "YOUR WORKSPACE" : "QUICK ACTIONS"}
          </span>
          <button
            aria-label="Close dialog"
            disabled={addPending}
            onClick={() => setOverlay(null)}
          >
            <X size={19} />
          </button>
        </div>
        {overlay === "account" ? (
          <>
            <div className="atlas-profile">
              <span className="atlas-avatar">AM</span>
              <div>
                <h2 id="workspace-dialog-title">{demoTechnician}</h2>
                <p className="atlas-muted">Technician · Demo profile</p>
              </div>
            </div>
            <div className="atlas-account-detail">
              <span className="atlas-muted">Assigned sites</span>
              <strong>North, South, East & West</strong>
            </div>
            <div className="atlas-account-detail">
              <span className="atlas-muted">Sign-in method</span>
              <strong>Slack · planned integration</strong>
            </div>
            <div className="atlas-slack-preview">
              <Hash size={23} />
              <div>
                <h3>Sign in with Slack</h3>
                <p>
                  Use your Slack identity to access Atlas. Connection and
                  workspace access will be configured in a later step.
                </p>
              </div>
            </div>
            <button className="atlas-placeholder-button" disabled>
              <Hash size={17} />
              Slack sign-in is not connected
            </button>
            <p className="atlas-dialog-note">
              You’re exploring a synthetic profile. No Slack login or account
              changes happen in this demo.
            </p>
          </>
        ) : actionStep === "add" ? (
          <AddMinerForm
            service={minerService}
            siteId={demoSites.findIndex((item) => item.id === activeSiteId) + 1}
            onBusy={setAddPending}
            onAdded={() => {
              setHistory(dashboardHistory())
              setMinerSession((value) => value + 1)
            }}
            onFind={(serial) => navigate("miners", serial)}
            onBack={() => setActionStep("choose")}
          />
        ) : (
          <>
            <h2 id="workspace-dialog-title">What would you like to do?</h2>
            <p className="atlas-muted">Choose an action to get started.</p>
            <div className="atlas-action-options">
              <button onClick={() => navigate("miners", "", true)}>
                <span className="atlas-action-icon">
                  <Wrench size={20} />
                </span>
                <div>
                  <strong>Move to repair area</strong>
                  <p>Record a physical location change</p>
                </div>
                <ArrowRight size={16} />
              </button>
              <button onClick={() => navigate("miners")}>
                <span className="atlas-action-icon">
                  <Activity size={20} />
                </span>
                <div>
                  <strong>Move a miner</strong>
                  <p>Record a new location and reason</p>
                </div>
                <ArrowRight size={16} />
              </button>
              <button onClick={() => setActionStep("add")}>
                <span className="atlas-action-icon">
                  <Plus size={20} />
                </span>
                <div>
                  <strong>Add a miner</strong>
                  <p>Register identity, companies, and initial location</p>
                </div>
                <ArrowRight size={16} />
              </button>
            </div>
            <p className="atlas-dialog-note">
              An early version of Actions. More workflows will follow.
            </p>
          </>
        )}
      </dialog>
    </div>
  )
}
