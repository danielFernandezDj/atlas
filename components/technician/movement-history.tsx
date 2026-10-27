"use client"

import { useState } from "react"
import { ArrowUpRight, History, Search } from "lucide-react"
import { type DemoMovement, movementTime } from "@/lib/demo/technician"

export function MovementHistory({
  movements,
  personal = false,
  onSelect,
}: {
  movements: DemoMovement[]
  personal?: boolean
  onSelect: (serial: string) => void
}) {
  const [query, setQuery] = useState("")
  const filtered = movements.filter((item) =>
    `${item.serial} ${item.from} ${item.to} ${item.reason} ${item.by}`
      .toLowerCase()
      .includes(query.trim().toLowerCase())
  )
  return (
    <section
      className="atlas-card atlas-history"
      aria-labelledby={
        personal ? "personal-history-title" : "movement-history-title"
      }
    >
      <div className="atlas-section-header">
        <div>
          <h2
            id={personal ? "personal-history-title" : "movement-history-title"}
          >
            <History size={17} />
            {personal ? "Your miner activity" : "Movement history"}
          </h2>
          <p className="atlas-muted">
            {personal
              ? "Miners you’ve handled at the selected site."
              : "Recent moves to and from the selected site."}{" "}
            <span className="atlas-subtle">Sample records · Central Time</span>
          </p>
        </div>
        <label className="atlas-search">
          <Search size={16} />
          <span className="sr-only">Search movement history</span>
          <input
            type="search"
            placeholder="Search movements…"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
      </div>
      <div className="atlas-table-scroll">
        <table>
          <thead>
            <tr>
              <th>Miner serial</th>
              <th>Movement</th>
              <th>Reason</th>
              <th>Technician</th>
              <th>Recorded</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((movement) => (
              <tr key={movement.id}>
                <td>
                  <button
                    className="atlas-serial-button"
                    onClick={() => onSelect(movement.serial)}
                  >
                    {movement.serial}
                    <ArrowUpRight size={13} />
                  </button>
                </td>
                <td>
                  <span className="atlas-table-from">{movement.from}</span>
                  <span className="atlas-table-to">→ {movement.to}</span>
                </td>
                <td>
                  <span className="atlas-reason">{movement.reason}</span>
                </td>
                <td>{movement.by}</td>
                <td className="atlas-nowrap">{movementTime(movement.at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!filtered.length && (
        <p className="atlas-empty" role="status">
          {query
            ? "No matching movements. Try a serial, location, reason, or technician."
            : "No movement records at this site yet."}
        </p>
      )}
      <footer className="atlas-history-footer">
        <span role="status">
          {filtered.length} movement{filtered.length === 1 ? "" : "s"}
        </span>
        <span>Demo changes reset on refresh</span>
      </footer>
    </section>
  )
}
