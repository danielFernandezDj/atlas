"use client"
/**
 * Displays recent recorded movements from the dashboard snapshot.
 * Miner links notify the workspace to select a miner; this component performs no
 * requests or database changes.
 */

import type { DashboardData } from "@/lib/dashboard/contracts"
import { History, Search } from "lucide-react"
import { useState } from "react"

const time = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/Chicago",
  month: "short",
  day: "numeric",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
})

export function MovementHistory({
  movements,
}: {
  movements: DashboardData["movements"]
}) {
  const [query, setQuery] = useState("")
  const filtered = movements.filter((item) =>
    `${item.identity} ${item.serial} ${item.from} ${item.to} ${item.reason} ${item.by}`
      .toLowerCase()
      .includes(query.trim().toLowerCase())
  )
  return (
    <section
      className="atlas-card atlas-history"
      aria-labelledby="movement-history-title"
    >
      <div className="atlas-section-header">
        <div>
          <h2 id="movement-history-title">
            <History size={17} aria-hidden="true" />
            Movement history
          </h2>
          <p className="atlas-muted">
            Latest 20 moves to or from this site · Central Time
          </p>
        </div>
        <label className="atlas-search">
          <Search size={16} aria-hidden="true" />
          <span className="sr-only">Search recent movements</span>
          <input
            type="search"
            placeholder="Search recent movements…"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
      </div>
      <div className="atlas-table-scroll">
        <table>
          <thead>
            <tr>
              <th scope="col">Miner</th>
              <th scope="col">Movement</th>
              <th scope="col">Reason</th>
              <th scope="col">Recorded by</th>
              <th scope="col">Occurred</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((movement) => (
              <tr key={movement.id}>
                <td>
                  <strong>Miner #{movement.identity}</strong>
                  <span className="atlas-table-from">{movement.serial}</span>
                </td>
                <td>
                  <span className="atlas-table-from">{movement.from}</span>
                  <span className="atlas-table-to">→ {movement.to}</span>
                </td>
                <td>
                  <span className="atlas-reason">{movement.reason}</span>
                </td>
                <td>{movement.by}</td>
                <td className="atlas-nowrap">
                  <time dateTime={movement.occurredAt}>
                    {time.format(new Date(movement.occurredAt))}
                  </time>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!filtered.length && (
        <p className="atlas-empty" role="status">
          {query
            ? "No matching recent movements."
            : "No movements have been recorded for this site yet."}
        </p>
      )}
      <footer className="atlas-history-footer">
        <span role="status">
          {filtered.length} of {movements.length} recent movements
        </span>
        <span>Moves across sites appear at both locations.</span>
      </footer>
    </section>
  )
}
