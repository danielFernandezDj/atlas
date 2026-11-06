"use client"
/**
 * Reads /api/miners/[id] for the selected miner and coordinates Overview, Settings
 * and History tabs plus contextual update actions. Inventory details are database-backed;
 * live-miner-panels.tsx keeps firmware controls unavailable until a provider exists.
 */

import {
  LiveMinerOverview,
  LiveMinerSettings,
  MinerLogs,
} from "@/components/technician/miners/live-miner-panels"
import "@/components/technician/miners/miner-workspace.css"
import type { ActionContext } from "@/lib/inventory-actions/contracts"
import { type InventoryMinerDetail } from "@/lib/miners/inventory-contracts"
import { Cpu, MapPin, Pencil, RefreshCw } from "lucide-react"
import { useEffect, useState } from "react"

import { readMinerResource } from "./miner-api"
const time = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/Chicago",
  dateStyle: "medium",
  timeStyle: "short",
})
const timestamp = (value: string) => time.format(new Date(value))

export function LiveMinerWorkspace({
  onAction,
  selectedId,
  refreshKey,
}: {
  selectedId: number | null
  onAction: (context: ActionContext) => void
  refreshKey: string
}) {
  const [detail, setDetail] = useState<InventoryMinerDetail | null>(null)
  const [detailError, setDetailError] = useState("")
  const [detailRefresh, setDetailRefresh] = useState(0)
  const [tab, setTab] = useState<"overview" | "history" | "settings">(
    "overview"
  )
  useEffect(() => {
    if (selectedId === null) return
    const controller = new AbortController()
    readMinerResource<InventoryMinerDetail>(
      `/api/miners/${selectedId}`,
      controller.signal
    )
      .then((result) => {
        if (!controller.signal.aborted) setDetail(result)
      })
      .catch((failure) => {
        if (!controller.signal.aborted)
          setDetailError(
            failure instanceof Error ? failure.message : "Miner unavailable."
          )
      })
    return () => controller.abort()
  }, [selectedId, detailRefresh, refreshKey])
  function reload() {
    setDetail(null)
    setDetailError("")
    setDetailRefresh((value) => value + 1)
  }
  if (selectedId === null)
    return (
      <section className="atlas-card atlas-selected-miner-empty">
        <Cpu size={28} />
        <h2>No miner selected</h2>
        <p className="atlas-muted">
          Use the search above to find a miner and open its record.
        </p>
      </section>
    )
  return (
    <section
      className="atlas-card atlas-selected-miner"
      aria-labelledby="selected-miner-title"
    >
      <div className="atlas-section-header">
        <div>
          <h2 id="selected-miner-title">
            {detail ? `Miner #${detail.identity}` : "Miner details"}
          </h2>
          <p className="atlas-muted">
            {detail?.serial ?? "Recorded asset and component information"}
          </p>
        </div>
        <div className="atlas-selected-miner-actions">
          <button
            className="atlas-text-button"
            onClick={() =>
              onAction({ mode: "move", minerId: selectedId, lockedMiner: true })
            }
          >
            <MapPin size={14} />
            Update location
          </button>
          <button
            className="atlas-text-button"
            onClick={() =>
              onAction({ mode: "edit", minerId: selectedId, lockedMiner: true })
            }
          >
            <Pencil size={14} />
            Update miner
          </button>
          <button className="atlas-text-button" onClick={reload}>
            <RefreshCw size={14} />
            Refresh miner
          </button>
        </div>
      </div>
      {detailError ? (
        <div className="atlas-miner-state" role="alert">
          <p>{detailError}</p>
          <button className="atlas-text-button" onClick={reload}>
            Retry miner details
          </button>
        </div>
      ) : !detail ? (
        <p className="atlas-miner-state" role="status">
          Loading miner details…
        </p>
      ) : (
        <>
          <nav
            className="atlas-selected-miner-tabs"
            aria-label="Miner record sections"
          >
            <button
              aria-current={tab === "overview" ? "page" : undefined}
              onClick={() => setTab("overview")}
            >
              Overview
            </button>
            <button
              aria-current={tab === "history" ? "page" : undefined}
              onClick={() => setTab("history")}
            >
              History
            </button>
            <button
              aria-current={tab === "settings" ? "page" : undefined}
              onClick={() => setTab("settings")}
            >
              Miner settings
            </button>
          </nav>
          <div className="atlas-selected-miner-body">
            {tab === "overview" ? (
              <LiveMinerOverview miner={detail} />
            ) : tab === "settings" ? (
              <LiveMinerSettings />
            ) : (
              <>
                <section className="atlas-live-miner-section">
                  <h3>Movement history · {detail.movementCount} total</h3>
                  <p className="atlas-muted">
                    Latest 20 records · Central Time
                  </p>
                  {!detail.movements.length ? (
                    <p>No movements recorded.</p>
                  ) : (
                    <ol className="atlas-live-miner-events">
                      {detail.movements.map((movement) => (
                        <li key={movement.id}>
                          <strong>{movement.reason}</strong>
                          <time dateTime={movement.occurredAt}>
                            {timestamp(movement.occurredAt)}
                          </time>
                          <p>
                            {movement.from} → {movement.to}
                          </p>
                          <p>Recorded by {movement.by}</p>
                          {movement.notes && <p>{movement.notes}</p>}
                        </li>
                      ))}
                    </ol>
                  )}
                </section>
                <section className="atlas-live-miner-section">
                  <h3>
                    Component and asset history · {detail.eventCount} total
                  </h3>
                  <p className="atlas-muted">
                    Latest 20 entries · Central Time
                  </p>
                  {!detail.events.length ? (
                    <p>No asset history recorded.</p>
                  ) : (
                    <ol className="atlas-live-miner-events">
                      {detail.events.map((event) => (
                        <li key={event.id}>
                          <strong>{event.kind}</strong>
                          <time dateTime={event.occurredAt}>
                            {timestamp(event.occurredAt)}
                          </time>
                          {event.component && <p>{event.component}</p>}
                          <p>Recorded by {event.by}</p>
                          {event.notes && <p>{event.notes}</p>}
                        </li>
                      ))}
                    </ol>
                  )}
                </section>
              </>
            )}
          </div>
          <MinerLogs />
        </>
      )}
    </section>
  )
}
