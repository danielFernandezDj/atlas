/**
 * Defines browser-safe miner directory, selected-miner and query DTOs for /api/miners.
 * The read-inventory adapter translates Prisma rows into these shapes; components
 * consume recorded inventory and history without importing the database layer.
 */
export const inventoryKinds = [
  "DEPLOYMENT_SLOT",
  "PALLET",
  "STAGING",
  "REPAIR",
] as const
export type InventoryKind = (typeof inventoryKinds)[number]
export const inventoryKindLabels: Record<InventoryKind, string> = {
  DEPLOYMENT_SLOT: "Deployment slot",
  PALLET: "Pallet",
  STAGING: "Staging",
  REPAIR: "Repair",
}
export type InventoryQuery = {
  search: string
  site: number | null
  kind: InventoryKind | "UNASSIGNED" | ""
  page: number
  pageSize: number
}
export type InventoryLocation = {
  id: number
  label: string
  kind: InventoryKind
  active: boolean
}
export type InventoryMiner = {
  id: number
  identity: number
  serial: string
  assetTag: string | null
  model: string | null
  owner: string
  manager: string
  location: InventoryLocation | null
  hashboards: number
}
export type InventoryPage = {
  items: InventoryMiner[]
  total: number
  page: number
  pageSize: number
}
export type InventoryPart = {
  id: number
  serial: string | null
  condition: string
}
export type InventoryMinerDetail = InventoryMiner & {
  registration: {
    state: "READY" | "SCRAP"
    by: string
    occurredAt: string
    componentConfirmation: {
      hashboards: number
      powerSupplyPresent: boolean
      confirmedAt: string
    } | null
  } | null

  ip: string | null
  lastApiIp: string | null
  createdAt: string
  updatedAt: string
  skeleton: InventoryPart | null
  controlBoard:
    (InventoryPart & { mac: string; firmware: string | null }) | null
  boards: (InventoryPart & { position: string | null })[]
  reservation: { location: string; switch: string; port: string } | null
  movements: {
    id: number
    from: string
    to: string
    reason: string
    by: string
    notes: string | null
    occurredAt: string
  }[]
  events: {
    id: number
    kind: string
    component: string | null
    by: string
    notes: string | null
    occurredAt: string
  }[]
  movementCount: number
  eventCount: number
}
