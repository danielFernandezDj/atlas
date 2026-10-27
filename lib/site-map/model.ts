import type { Building, Can, Location, Miner, Site } from "../miners/contracts"

export type SlotState =
  "occupied" | "empty" | "inactive" | "not-configured" | "unknown" | "conflict"
export const stateLabels: Record<SlotState, string> = {
  occupied: "Occupied",
  empty: "Available",
  inactive: "Inactive / unavailable",
  "not-configured": "Not configured",
  unknown: "Unknown",
  conflict: "Data conflict",
}
export type MapContext = { site: Site; building: Building; can: Can }
export type SlotCell = {
  row: number
  slot: number
  state: SlotState
  locations: Location[]
  miners: Miner[]
}
export type MapCounts = Record<SlotState, number>
export type CanSummary = {
  can: Can
  counts: MapCounts
  sharedMiners: number
  warnings: string[]
}
export type SiteMapOverview = {
  site: Site
  buildings: { building: Building; cans: CanSummary[] }[]
}
export type CanMapDetail = MapContext & {
  locations: Location[]
  miners: Miner[]
}
/** Proposed read interface only; no map HTTP endpoint exists in this MVP. */
export interface SiteMapService {
  getSiteMapOverview(
    siteId: number,
    signal?: AbortSignal
  ): Promise<SiteMapOverview>
  getCanMap(canId: number, signal?: AbortSignal): Promise<CanMapDetail>
}
export function validCoordinate(location: Location, can: Can) {
  return (
    location.kind === "DEPLOYMENT_SLOT" &&
    Number.isInteger(location.row_index) &&
    Number.isInteger(location.slot_index) &&
    location.row_index! >= 0 &&
    location.slot_index! >= 0 &&
    location.row_index! < can.row_count &&
    location.slot_index! < can.slot_per_row
  )
}
export function mapAddress(context: MapContext, row: number, slot: number) {
  return `${context.site.name} / B${context.building.building_number} / Can ${context.can.can_number} / ${row}-${slot}`
}
export function buildCells(
  context: MapContext,
  locations: Location[] | null,
  miners: Miner[] = []
): SlotCell[] {
  const byCoordinate = new Map<string, Location[]>()
  for (const location of locations ?? [])
    if (
      location.can_id === context.can.id &&
      validCoordinate(location, context.can)
    ) {
      const key = `${location.row_index}-${location.slot_index}`
      byCoordinate.set(key, [...(byCoordinate.get(key) ?? []), location])
    }
  const occupants = new Map<number, Miner[]>()
  for (const miner of miners)
    if (miner.current_location)
      occupants.set(miner.current_location.id, [
        ...(occupants.get(miner.current_location.id) ?? []),
        miner,
      ])
  return Array.from(
    { length: context.can.row_count * context.can.slot_per_row },
    (_, index) => {
      const row = Math.floor(index / context.can.slot_per_row),
        slot = index % context.can.slot_per_row
      if (locations === null)
        return { row, slot, state: "unknown", locations: [], miners: [] }
      const records = byCoordinate.get(`${row}-${slot}`) ?? [],
        assigned = records.flatMap(
          (location) => occupants.get(location.id) ?? []
        )
      const active =
        records.length === 1 &&
        context.site.is_active &&
        context.building.is_active &&
        context.can.is_active &&
        records[0].is_active
      const state: SlotState = !records.length
        ? "not-configured"
        : records.length > 1 || assigned.length > 1
          ? "conflict"
          : !active
            ? "inactive"
            : assigned.length === 1
              ? "occupied"
              : "empty"
      return { row, slot, state, locations: records, miners: assigned }
    }
  )
}
export function countCells(cells: SlotCell[]): MapCounts {
  const counts: MapCounts = {
    occupied: 0,
    empty: 0,
    inactive: 0,
    "not-configured": 0,
    unknown: 0,
    conflict: 0,
  }
  for (const cell of cells) counts[cell.state]++
  return counts
}
export function mapWarnings(
  context: MapContext,
  locations: Location[]
): string[] {
  const invalid = locations.filter(
    (location) =>
      location.can_id === context.can.id &&
      location.kind === "DEPLOYMENT_SLOT" &&
      !validCoordinate(location, context.can)
  ).length
  return invalid
    ? [
        `${invalid} deployment location record${invalid === 1 ? "" : "s"} have invalid or missing coordinates and cannot be placed on this grid.`,
      ]
    : []
}
/** SOP reference metadata only. Never applied to or merged into the existing demo topology. */
export const sopReference = {
  standardCan: { row_count: 11, slot_per_row: 35 },
  sites: [
    {
      name: "Rebel",
      buildings: [
        [1, 6],
        [7, 14],
        [15, 22],
      ],
    },
    {
      name: "Garden City",
      buildings: [
        [1, 4],
        [5, 10],
      ],
    },
    {
      name: "Stiles",
      buildings: [
        [1, 8],
        [9, 18],
      ],
    },
    {
      name: "East Stiles",
      buildings: [
        [1, 8],
        [9, 14],
        [15, 22],
        [23, 28],
      ],
    },
  ],
} as const
