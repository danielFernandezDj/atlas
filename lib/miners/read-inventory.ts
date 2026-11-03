import "server-only"
import type { Prisma, PrismaClient } from "@/lib/generated/prisma/client"
import {
  inventoryKinds,
  type InventoryQuery,
  type InventoryLocation,
  type InventoryMiner,
  type InventoryPage,
  type InventoryMinerDetail,
} from "./inventory-contracts"

export class InventoryInputError extends Error {}
const positiveInteger = (
  value: string | null,
  fallback: number,
  maximum: number
) => {
  if (value === null) return fallback
  if (
    !/^[1-9]\d*$/.test(value) ||
    !Number.isSafeInteger(Number(value)) ||
    Number(value) > maximum
  )
    throw new InventoryInputError("Invalid inventory filter or page.")
  return Number(value)
}

export function parseInventoryQuery(params: URLSearchParams): InventoryQuery {
  for (const key of ["search", "site", "kind", "page", "pageSize"]) {
    if (params.getAll(key).length > 1)
      throw new InventoryInputError(
        "Repeated inventory filters are not supported."
      )
  }
  const search = (params.get("search") ?? "").trim()
  if (search.length > 200)
    throw new InventoryInputError("Keep searches under 201 characters.")
  const kind = params.get("kind") ?? ""
  if (
    kind !== "" &&
    kind !== "UNASSIGNED" &&
    !inventoryKinds.some((value) => value === kind)
  )
    throw new InventoryInputError("Invalid location kind.")
  return {
    search,
    site: params.has("site")
      ? positiveInteger(params.get("site"), 1, 2147483647)
      : null,
    kind: kind as InventoryQuery["kind"],
    page: positiveInteger(params.get("page"), 1, 1000000),
    pageSize: positiveInteger(params.get("pageSize"), 12, 50),
  }
}

export function parseMinerId(value: string) {
  return positiveInteger(value, 1, 2147483647)
}

const locationSelect = {
  id: true,
  name: true,
  code: true,
  kind: true,
  is_active: true,
  row_index: true,
  slot_index: true,
  site: { select: { name: true, is_active: true } },
  building: { select: { building_number: true, is_active: true } },
  can: { select: { can_number: true, is_active: true } },
} satisfies Prisma.locationsSelect
const minerSelect = {
  id: true,
  identify_miner_id: true,
  serial_number: true,
  asset_tag: true,
  model: { select: { manufacturer: true, name: true } },
  owner: { select: { name: true } },
  manager: { select: { name: true } },
  current_location: { select: locationSelect },
  _count: { select: { hash_boards: true } },
} satisfies Prisma.minerSelect
type LocationRow = Prisma.locationsGetPayload<{ select: typeof locationSelect }>
type MinerRow = Prisma.minerGetPayload<{ select: typeof minerSelect }>

function locationDto(location: LocationRow | null): InventoryLocation | null {
  if (!location) return null
  const path = [
    location.site.name,
    location.building ? `Building ${location.building.building_number}` : null,
    location.can ? `Can ${location.can.can_number}` : null,
    location.kind === "DEPLOYMENT_SLOT"
      ? `Row ${location.row_index ?? "?"} / Slot ${location.slot_index ?? "?"} (${location.code})`
      : `${location.name} (${location.code})`,
  ].filter(Boolean)
  return {
    id: location.id,
    kind: location.kind,
    label: path.join(" / "),
    active:
      location.is_active &&
      location.site.is_active &&
      (location.building?.is_active ?? true) &&
      (location.can?.is_active ?? true),
  }
}
function minerDto(miner: MinerRow): InventoryMiner {
  return {
    id: miner.id,
    identity: miner.identify_miner_id,
    serial: miner.serial_number,
    assetTag: miner.asset_tag,
    model: miner.model
      ? `${miner.model.manufacturer} ${miner.model.name}`
      : null,
    owner: miner.owner.name,
    manager: miner.manager.name,
    location: locationDto(miner.current_location),
    hashboards: miner._count.hash_boards,
  }
}

function inventoryWhere(query: InventoryQuery): Prisma.minerWhereInput {
  const AND: Prisma.minerWhereInput[] = []
  if (query.kind === "UNASSIGNED") AND.push({ current_location_id: null })
  else if (query.kind) AND.push({ current_location: { kind: query.kind } })
  if (query.site !== null)
    AND.push({ current_location: { site_id: query.site } })
  if (query.search) {
    const contains = { contains: query.search, mode: "insensitive" as const }
    const OR: Prisma.minerWhereInput[] = [
      { serial_number: contains },
      { asset_tag: contains },
      { model: { OR: [{ name: contains }, { manufacturer: contains }] } },
      { owner: { name: contains } },
      { manager: { name: contains } },
      { skeleton: { serial_number: contains } },
      {
        control_board: {
          OR: [{ serial_number: contains }, { mac_address: contains }],
        },
      },
      { hash_boards: { some: { serial_number: contains } } },
      {
        current_location: {
          OR: [
            { name: contains },
            { code: contains },
            { site: { name: contains } },
            { can: { can_number: contains } },
          ],
        },
      },
    ]
    if (/^[1-9]\d*$/.test(query.search) && Number(query.search) <= 2147483647)
      OR.push({ identify_miner_id: Number(query.search) })
    AND.push({ OR })
  }
  return { AND }
}

// Call only after the server request's staff authorization check.
export async function readMinerInventory(
  db: Pick<PrismaClient, "$transaction">,
  query: InventoryQuery
): Promise<InventoryPage> {
  const where = inventoryWhere(query)
  return db.$transaction(
    async (tx) => {
      const total = await tx.miner.count({ where })
      const page = Math.min(
        query.page,
        Math.max(1, Math.ceil(total / query.pageSize))
      )
      const rows = await tx.miner.findMany({
        where,
        select: minerSelect,
        orderBy: [{ identify_miner_id: "asc" }, { id: "asc" }],
        skip: (page - 1) * query.pageSize,
        take: query.pageSize,
      })
      return {
        items: rows.map(minerDto),
        total,
        page,
        pageSize: query.pageSize,
      }
    },
    { isolationLevel: "RepeatableRead", maxWait: 10000, timeout: 20000 }
  )
}

export async function readMinerInventoryDetail(
  db: Pick<PrismaClient, "miner">,
  id: number
): Promise<InventoryMinerDetail | null> {
  const partSelect = { id: true, serial_number: true, condition: true } as const
  const actor = { select: { first_name: true, last_name: true } } as const
  const miner = await db.miner.findUnique({
    where: { id },
    select: {
      ...minerSelect,
      miner_ip: true,
      last_api_ip: true,
      dateCreated: true,
      dateUpdated: true,
      skeleton: { select: partSelect },
      control_board: {
        select: { ...partSelect, mac_address: true, firmware_version: true },
      },
      hash_boards: {
        orderBy: [{ position: "asc" }, { id: "asc" }],
        select: { ...partSelect, position: true },
      },
      reserved_port: {
        select: {
          port_number: true,
          switch: { select: { name: true } },
          location: { select: locationSelect },
        },
      },
      movements: {
        take: 20,
        orderBy: [{ occurred_at: "desc" }, { id: "desc" }],
        select: {
          id: true,
          reason: true,
          source: true,
          notes: true,
          occurred_at: true,
          recorded_by: actor,
          from_location: { select: locationSelect },
          to_location: { select: locationSelect },
        },
      },
      history: {
        where: { dateDeleted: null },
        take: 20,
        orderBy: [{ occurred_at: "desc" }, { id: "desc" }],
        select: {
          id: true,
          kind: true,
          source: true,
          notes: true,
          occurred_at: true,
          user: actor,
          skeleton_id: true,
          control_board_id: true,
          hash_board_id: true,
          position: true,
        },
      },
      _count: {
        select: {
          hash_boards: true,
          movements: true,
          history: { where: { dateDeleted: null } },
        },
      },
    },
  })
  if (!miner) return null
  const partDto = (part: {
    id: number
    serial_number: string | null
    condition: string
  }) => ({ id: part.id, serial: part.serial_number, condition: part.condition })
  const who = (
    person: { first_name: string; last_name: string } | null,
    source: string
  ) =>
    person
      ? `${person.first_name} ${person.last_name}`.trim()
      : `${source.toLowerCase()} integration`
  return {
    ...minerDto(miner),
    ip: miner.miner_ip,
    lastApiIp: miner.last_api_ip,
    createdAt: miner.dateCreated.toISOString(),
    updatedAt: miner.dateUpdated.toISOString(),
    skeleton: miner.skeleton ? partDto(miner.skeleton) : null,
    controlBoard: miner.control_board
      ? {
          ...partDto(miner.control_board),
          mac: miner.control_board.mac_address,
          firmware: miner.control_board.firmware_version,
        }
      : null,
    boards: miner.hash_boards.map((board) => ({
      ...partDto(board),
      position: board.position,
    })),
    reservation: miner.reserved_port
      ? {
          location: locationDto(miner.reserved_port.location)!.label,
          switch: miner.reserved_port.switch.name,
          port: miner.reserved_port.port_number,
        }
      : null,
    movements: miner.movements.map((movement) => ({
      id: movement.id,
      from: locationDto(movement.from_location)?.label ?? "Not assigned",
      to: locationDto(movement.to_location)!.label,
      reason: movement.reason.replaceAll("_", " ").toLowerCase(),
      by: who(movement.recorded_by, movement.source),
      notes: movement.notes,
      occurredAt: movement.occurred_at.toISOString(),
    })),
    events: miner.history.map((event) => ({
      id: event.id,
      kind:
        event.kind === "COMPONENT_UPDATED" &&
        !event.skeleton_id &&
        !event.control_board_id &&
        !event.hash_board_id
          ? "miner details updated"
          : event.kind.replaceAll("_", " ").toLowerCase(),
      component:
        event.skeleton_id !== null
          ? `Skeleton #${event.skeleton_id}`
          : event.control_board_id !== null
            ? `Control board #${event.control_board_id}`
            : event.hash_board_id !== null
              ? `Hashboard #${event.hash_board_id}${event.position ? ` · ${event.position.replace("SLOT_", "Position ")}` : ""}`
              : null,
      by: who(event.user, event.source),
      notes: event.notes,
      occurredAt: event.occurred_at.toISOString(),
    })),
    movementCount: miner._count.movements,
    eventCount: miner._count.history,
  }
}
