"use client"
/**
 * Reads /api/site-map/building and displays the selected building’s inventory plus
 * selected-can configuration details. onSummary shares assignment counts with the
 * parent selectors; this panel performs reads only.
 */

import "@/components/technician/site-map/live-site-map.css"
import {
  portDisplay,
  type BuildingMapSummary,
  type LiveCanMap,
} from "@/lib/site-map/live-contracts"
import { useEffect, useState } from "react"
export function BuildingInventory({
  siteId,
  buildingId,
  onSummary,
  canNumber,
  canMap,
  canError,
}: {
  siteId: number
  buildingId: number
  onSummary: (data: BuildingMapSummary | null) => void
  canNumber: string | null
  canMap: LiveCanMap | null
  canError: string
}) {
  const [data, setData] = useState<BuildingMapSummary | null>(null)
  const [error, setError] = useState("")
  const [retry, setRetry] = useState(0)
  useEffect(() => {
    onSummary(null)
    const controller = new AbortController()
    fetch(`/api/site-map/building?site=${siteId}&building=${buildingId}`, {
      signal: controller.signal,
      cache: "no-store",
      credentials: "same-origin",
    })
      .then(async (response) => {
        const body = await response.json()
        if (!response.ok)
          throw new Error(body.message ?? "Building inventory unavailable.")
        if (!controller.signal.aborted) {
          setData(body)
          onSummary(body)
        }
      })
      .catch((failure) => {
        if (!controller.signal.aborted)
          setError(
            failure instanceof Error
              ? failure.message
              : "Building inventory unavailable."
          )
      })
    return () => controller.abort()
  }, [siteId, buildingId, retry, onSummary])
  return (
    <section
      className="atlas-building-inventory"
      aria-label="Selected building inventory"
    >
      {error ? (
        <div role="alert">
          <p>{error}</p>
          <button
            className="atlas-text-button"
            onClick={() => {
              setError("")
              setRetry((v) => v + 1)
            }}
          >
            Retry building inventory
          </button>
        </div>
      ) : !data ? (
        <p className="atlas-muted" role="status">
          Loading building inventory…
        </p>
      ) : (
        <>
          <div className="atlas-building-summary-heading">
            <h2>Building {data.number} inventory</h2>
            <span>Database records{!data.active && " · Inactive"}</span>
          </div>
          <dl>
            {[
              ["Linked miners", data.linked],
              ["Deployed here", data.deployed],
              ["In repair", data.repair],
              ["In staging", data.staging],
              ["On pallets", data.pallet],
              ["Reserved ports", data.reserved],
            ].map(([label, value]) => (
              <div key={label}>
                <dt>{label}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>
        </>
      )}
      {canNumber !== null && (
        <div className="atlas-selected-can-summary" role="status">
          <strong>Can {canNumber}</strong>
          {canError ? (
            <span>Map data unavailable</span>
          ) : !canMap ? (
            <span>Loading can inventory…</span>
          ) : (
            <>
              <span>
                {canMap.cells.filter((cell) => cell.locationId !== null).length}{" "}
                locations
              </span>
              <span>
                {canMap.cells.filter((cell) => cell.occupant !== null).length}{" "}
                miners present
              </span>
              <span>
                {
                  canMap.cells.filter(
                    (cell) => portDisplay(cell).state === "repair"
                  ).length
                }{" "}
                repair reservations
              </span>
              {canMap.cells.every((cell) => cell.locationId === null) && (
                <span>Not configured</span>
              )}
            </>
          )}
        </div>
      )}
    </section>
  )
}
