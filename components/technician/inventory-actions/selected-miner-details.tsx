"use client"
/**
 * Displays component identifiers and recent movement history inside selected-miner
 * action forms. InventoryActions supplies the /api/miners/[id] snapshot; these
 * read-only sections do not edit components or fetch data themselves.
 */

import type { InventoryMinerDetail } from "@/lib/miners/inventory-contracts"

export function MinerComponentDetails({
  miner,
}: {
  miner: InventoryMinerDetail
}) {
  return (
    <section className="atlas-action-components">
      <h3>Component information</h3>
      <dl>
        {[
          ["Skeleton serial", miner.skeleton?.serial ?? miner.serial],
          ["Control board serial", miner.controlBoard?.serial],
          ["Control board MAC", miner.controlBoard?.mac],
          ...[1, 2, 3].map((n) => {
            const b = miner.boards.find((b) => b.position === `SLOT_${n}`)
            return [
              `Hashboard ${n} serial`,
              b?.serial ??
                (b ? `ID #${b.id} · Serial not recorded` : "Not assigned"),
            ]
          }),
        ].map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{value ?? "Not recorded"}</dd>
          </div>
        ))}
      </dl>
    </section>
  )
}
export function LocationHistory({ miner }: { miner: InventoryMinerDetail }) {
  return (
    <section className="atlas-action-location-history">
      <h3>Location history · {miner.movementCount} total</h3>
      <p className="atlas-muted">Latest 20 movements · Central Time</p>
      {miner.movements.length ? (
        <ol>
          {miner.movements.map((m) => (
            <li key={m.id}>
              <strong>
                {m.from} → {m.to}
              </strong>
              <span>
                {new Date(m.occurredAt).toLocaleString("en-US", {
                  timeZone: "America/Chicago",
                })}{" "}
                · {m.by}
              </span>
              <p>
                {m.reason}
                {m.notes ? ` · ${m.notes}` : ""}
              </p>
            </li>
          ))}
        </ol>
      ) : (
        <p>No movements recorded.</p>
      )}
    </section>
  )
}
