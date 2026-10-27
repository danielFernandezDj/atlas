/** Proposed integration boundary. No miner HTTP API currently exists in Atlas.
 * Implement this interface on the server-backed adapter before production use.
 * These presentation DTOs deliberately exclude occupied_slot_id and actor input.
 */
export const locationKinds = [
  "DEPLOYMENT_SLOT",
  "PALLET",
  "STAGING",
  "REPAIR",
] as const
export type LocationKind = (typeof locationKinds)[number]
export const movementReasons = [
  "INITIAL_REGISTRATION",
  "DEPLOYMENT",
  "READY_FOR_DEPLOYMENT",
  "REPAIR",
  "RELOCATION",
] as const
export type MovementReason = (typeof movementReasons)[number]
export const kindLabels: Record<LocationKind, string> = {
  DEPLOYMENT_SLOT: "Deployment slot",
  PALLET: "Pallet",
  STAGING: "Staging",
  REPAIR: "Repair area",
}
export const reasonLabels: Record<MovementReason, string> = {
  INITIAL_REGISTRATION: "Initial registration",
  DEPLOYMENT: "Deployment",
  READY_FOR_DEPLOYMENT: "Ready for deployment",
  REPAIR: "Repair",
  RELOCATION: "Relocation",
}
export type Site = { id: number; name: string; is_active: boolean }
export type Building = {
  id: number
  site_id: number
  building_number: number
  is_active: boolean
}
export type Can = {
  id: number
  building_id: number
  can_number: string
  row_count: number
  slot_per_row: number
  is_active: boolean
}
export type Location = {
  id: number
  site_id: number
  building_id: number
  can_id: number
  kind: LocationKind
  code: string
  name: string
  row_index: number | null
  slot_index: number | null
  is_active: boolean
  site: Site
  building: Building | null
  can: Can
}
export type Miner = {
  id: number
  serial_number: string
  asset_tag: string | null
  model: { manufacturer: string; name: string; variant: string | null } | null
  owner: { id: number; name: string }
  manager: { id: number; name: string }
  current_location: Location | null
  version: number
  created_at: string
  updated_at: string
}
export type Movement = {
  id: number
  miner_id: number
  serial_number: string
  from_location: Location | null
  to_location: Location
  reason: MovementReason
  notes: string | null
  recorded_by: { id: number; name: string }
  occurred_at: string
  recorded_at: string
  submission_key: string
}
export type Page<T> = {
  items: T[]
  total: number
  page: number
  page_size: number
}
export type MinerQuery = {
  search: string
  site_id: number | null
  kind: LocationKind | "UNASSIGNED" | ""
  page: number
  page_size: number
}
export type MinerCapabilities = {
  can_move: boolean
  explanation: string | null
  allowed_reasons: MovementReason[]
}
export type MinerDetail = { miner: Miner; capabilities: MinerCapabilities }
export type DestinationQuery = {
  site_id: number | null
  building_id: number | null
  can_id: number | null
  kind: LocationKind | ""
  page: number
  page_size: number
}
export type DestinationOption = {
  location: Location
  eligible: boolean
  unavailable_reason: string | null
}
export type DestinationOptions = {
  sites: Site[]
  buildings: Building[]
  cans: Can[]
  destinations: Page<DestinationOption>
}
export type MoveCommand = {
  miner_id: number
  destination_location_id: number
  reason: MovementReason
  notes: string | null
  expected_version: number
  submission_key: string
}
export type RegisterMinerCommand = {
  serial_number: string
  asset_tag: string | null
  model_id: number | null
  owner_company_id: number
  management_company_id: number
  initial_location_id: number | null
  notes: string | null
  submission_key: string
}
export type RegistrationOptions = {
  can_register: boolean
  explanation: string | null
  companies: { id: number; name: string }[]
  models: {
    id: number
    manufacturer: string
    name: string
    variant: string | null
  }[]
  locations: DestinationOptions
}
export type ServiceErrorCode =
  | "DUPLICATE_SERIAL"
  | "NETWORK"
  | "VERSION_CONFLICT"
  | "SLOT_OCCUPIED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "INVALID"
export class MinerServiceError extends Error {
  constructor(
    public code: ServiceErrorCode,
    message: string
  ) {
    super(message)
    this.name = "MinerServiceError"
  }
}
export interface MinerService {
  readonly mode: "demo" | "production"
  searchMiners(query: MinerQuery, signal?: AbortSignal): Promise<Page<Miner>>
  getMiner(id: number, signal?: AbortSignal): Promise<MinerDetail>
  getHistory(
    id: number,
    page: number,
    pageSize: number,
    signal?: AbortSignal
  ): Promise<Page<Movement>>
  getDestinations(
    minerId: number,
    query: DestinationQuery,
    signal?: AbortSignal
  ): Promise<DestinationOptions>
  move(command: MoveCommand): Promise<{ movement_id: number }>
  getRegistrationOptions(
    query: DestinationQuery,
    signal?: AbortSignal
  ): Promise<RegistrationOptions>
  registerMiner(command: RegisterMinerCommand): Promise<{ miner: Miner }>
}
export const modelLabel = (miner: Miner) =>
  miner.model
    ? [miner.model.manufacturer, miner.model.name, miner.model.variant]
        .filter(Boolean)
        .join(" ")
    : "Model not assigned"
export function locationPath(location: Location | null): string {
  if (!location) return "Location not assigned"
  const coordinates =
    location.kind === "DEPLOYMENT_SLOT"
      ? ` · Row ${location.row_index ?? "not set"} / Slot ${location.slot_index ?? "not set"}`
      : ""
  return `${location.site.name} / ${location.building ? `Building ${location.building.building_number}` : "Building unavailable"} / Can ${location.can.can_number} / ${location.name} (${location.code})${coordinates}`
}
export const isLocationActive = (location: Location) =>
  location.is_active &&
  location.site.is_active &&
  Boolean(location.building?.is_active) &&
  location.can.is_active
export const displayTime = (value: string) =>
  new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "America/Chicago",
  }).format(new Date(value))
