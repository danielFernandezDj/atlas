"use client"
/**
 * Coordinates building/can selection and reads /api/site-map for the selected can.
 * BuildingInventory reads summaries, CanGrid owns cell interaction, and the workspace
 * retains the last selected port and opens inventory or port action dialogs.
 */

import "@/components/technician/site-map/live-site-map.css"
import type { DashboardData } from "@/lib/dashboard/contracts"
import type { ActionContext } from "@/lib/inventory-actions/contracts"
import {
  canStageLabels,
  type BuildingMapSummary,
  type LastMapPort,
  type LiveCanMap,
  type PortState,
} from "@/lib/site-map/live-contracts"
import { useCallback, useEffect, useState } from "react"
import { BuildingInventory } from "./building-inventory"
import { CanGrid } from "./can-grid"
export function LiveSiteMap({
  siteId,
  buildings,
  lastPort,
  onPortSelect,
  onAction,
  refreshKey,
  onMiner,
}: {
  siteId: number
  buildings: DashboardData["buildings"]
  lastPort: LastMapPort | null
  onPortSelect: (port: LastMapPort) => void
  onAction: (context: ActionContext) => void
  refreshKey: string
  onMiner: (id: number) => void
}) {
  const [filters, setFilters] = useState<PortState[]>([])
  const [buildingId, setBuildingId] = useState<number | null>(
    buildings.find(
      (b) =>
        b.id === lastPort?.buildingId &&
        b.cans.some((c) => c.id === lastPort.canId)
    )?.id ??
      buildings[0]?.id ??
      null
  )
  const building = buildings.find((b) => b.id === buildingId)
  const cans = [...(building?.cans ?? [])].sort((a, b) =>
    a.number.localeCompare(b.number, undefined, { numeric: true })
  )
  const [canId, setCanId] = useState<number | null>(
    cans.find((c) => c.id === lastPort?.canId)?.id ?? cans[0]?.id ?? null
  )
  const [jumpToLast, setJumpToLast] = useState(0)
  const lastPortAvailable =
    !!lastPort &&
    buildings.some(
      (b) =>
        b.id === lastPort.buildingId &&
        b.cans.some((c) => c.id === lastPort.canId)
    )
  function returnToLastPort() {
    if (!lastPort || !lastPortAvailable) return
    setBuildingId(lastPort.buildingId)
    setCanId(lastPort.canId)
    setJumpToLast((v) => v + 1)
  }
  const [refresh, setRefresh] = useState(0)
  const mapKey = `${siteId}-${canId}-${refreshKey}-${refresh}`
  const summaryKey = `${siteId}-${buildingId}-${refreshKey}-${refresh}`
  const [buildingSummary, setBuildingSummary] = useState<{
    key: string
    data: BuildingMapSummary | null
  } | null>(null)
  const receiveSummary = useCallback(
    (data: BuildingMapSummary | null) =>
      setBuildingSummary({ key: summaryKey, data }),
    [summaryKey]
  )
  const canSummaries =
    buildingSummary?.key === summaryKey ? buildingSummary.data?.cans : undefined

  const [mapResult, setMapResult] = useState<{
    key: string
    map: LiveCanMap | null
    error: string
  } | null>(null)
  useEffect(() => {
    if (canId === null) return
    const controller = new AbortController()
    fetch(`/api/site-map?site=${siteId}&can=${canId}`, {
      signal: controller.signal,
      cache: "no-store",
      credentials: "same-origin",
    })
      .then(async (response) => {
        const data = await response.json()
        if (!response.ok) throw new Error(data.message ?? "Map unavailable.")
        if (!controller.signal.aborted)
          setMapResult({ key: mapKey, map: data, error: "" })
      })
      .catch((failure) => {
        if (!controller.signal.aborted)
          setMapResult({
            key: mapKey,
            map: null,
            error:
              failure instanceof Error ? failure.message : "Map unavailable.",
          })
      })
    return () => controller.abort()
  }, [siteId, canId, mapKey])
  const currentMap = mapResult?.key === mapKey ? mapResult : null

  function chooseBuilding(id: number) {
    setBuildingId(id)
    const next = [...(buildings.find((b) => b.id === id)?.cans ?? [])].sort(
      (a, b) => a.number.localeCompare(b.number, undefined, { numeric: true })
    )
    setCanId(next[0]?.id ?? null)
  }
  return (
    <div className="atlas-live-map">
      <section className="atlas-card atlas-map-selectors">
        <div className="atlas-map-choices">
          <fieldset>
            <legend>Building</legend>
            <div className="atlas-map-options atlas-map-building-options">
              {buildings.map((b) => (
                <button
                  key={b.id}
                  aria-label={`Building ${b.number}${!b.active ? " · Inactive" : ""}`}
                  aria-pressed={b.id === buildingId}
                  onClick={() => chooseBuilding(b.id)}
                >
                  <span className="atlas-map-building-full">
                    Building {b.number}
                  </span>
                  <span className="atlas-map-building-short" aria-hidden="true">
                    B{b.number}
                  </span>
                  {!b.active && <span>Inactive</span>}
                </button>
              ))}
              {!buildings.length && (
                <p>No buildings configured at this site.</p>
              )}
            </div>
          </fieldset>
          <fieldset>
            <legend>Can</legend>
            <div className="atlas-map-options atlas-map-can-options">
              {cans.map((c) => {
                const info = canSummaries?.find(
                  (summary) => summary.id === c.id
                )
                const description = info
                  ? `${info.miners} miners assigned · ${canStageLabels[info.stage]}`
                  : "Loading can inventory"
                return (
                  <button
                    key={c.id}
                    aria-label={`Can ${c.number}${!c.active ? " · Inactive" : ""}`}
                    style={
                      /^[1-8]$/.test(c.number)
                        ? {
                            gridColumn: Math.ceil(Number(c.number) / 2),
                            gridRow: Number(c.number) % 2 ? 1 : 2,
                          }
                        : undefined
                    }
                    data-can-stage={info?.stage ?? "loading"}
                    aria-describedby={`can-stage-${siteId}-${c.id}`}
                    aria-pressed={c.id === canId}
                    onClick={() => setCanId(c.id)}
                    title={`${description} · ${c.slots} configured locations${!c.active ? " · Inactive" : ""}`}
                  >
                    <span className="atlas-can-button-label">
                      <span className="atlas-map-can-prefix" aria-hidden="true">
                        Can{" "}
                      </span>
                      {c.number}
                    </span>
                    <span className="atlas-can-button-count" aria-hidden="true">
                      {info ? info.miners : "—"}
                    </span>
                    {!c.active && <span>Inactive</span>}
                    <span
                      className="sr-only"
                      id={`can-stage-${siteId}-${c.id}`}
                    >
                      {description}
                    </span>
                  </button>
                )
              })}
              {building && !cans.length && (
                <p>No cans configured in this building.</p>
              )}
            </div>
          </fieldset>
        </div>
        {buildingId !== null && (
          <BuildingInventory
            key={`${siteId}-${buildingId}-${refreshKey}-${refresh}`}
            siteId={siteId}
            buildingId={buildingId}
            onSummary={receiveSummary}
            canNumber={cans.find((c) => c.id === canId)?.number ?? null}
            canMap={currentMap?.map ?? null}
            canError={currentMap?.error ?? ""}
          />
        )}
      </section>
      {canId !== null && (
        <CanGrid
          key={mapKey}
          filters={filters}
          onFiltersChange={setFilters}
          map={currentMap?.map ?? null}
          error={currentMap?.error ?? ""}
          lastPort={lastPort}
          jumpToLast={jumpToLast}
          lastPortAvailable={lastPortAvailable}
          onReturnToLast={returnToLastPort}
          onPortSelect={(cell) => {
            if (!building || canId === null) return
            onPortSelect({
              siteId,
              buildingId: building.id,
              buildingNumber: building.number,
              canId,
              canNumber: cans.find((c) => c.id === canId)!.number,
              row: cell.row,
              column: cell.column,
              locationId: cell.locationId,
            })
          }}
          onMiner={onMiner}
          onAction={onAction}
          onRefresh={() => setRefresh((v) => v + 1)}
        />
      )}
    </div>
  )
}
