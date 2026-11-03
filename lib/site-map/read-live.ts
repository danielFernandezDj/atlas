import "server-only"
import type { PrismaClient } from "@/lib/generated/prisma/client"
import type {
  BuildingMapSummary,
  LiveCanMap,
  MapCell,
  MapMiner,
} from "./live-contracts"
const minerSelect = {
  id: true,
  identify_miner_id: true,
  serial_number: true,
  miner_ip: true,
  current_location_id: true,
  current_location: { select: { kind: true } },
} as const
export async function readLiveCanMap(
  db: Pick<PrismaClient, "can">,
  siteId: number,
  canId: number
): Promise<LiveCanMap | null> {
  const can = await db.can.findFirst({
    where: { id: canId, building: { site_id: siteId } },
    select: {
      id: true,
      can_number: true,
      row_count: true,
      slot_per_row: true,
      is_active: true,
      building: {
        select: {
          building_number: true,
          is_active: true,
          site: { select: { is_active: true } },
        },
      },
      locations: {
        where: { kind: "DEPLOYMENT_SLOT" },
        take: 10001,
        select: {
          id: true,
          code: true,
          row_index: true,
          slot_index: true,
          is_active: true,
          current_miners: { take: 2, select: minerSelect },
          slot_occupant: { select: { id: true } },
          ports: {
            take: 2,
            select: {
              id: true,
              port_number: true,
              active: true,
              observed_mac: true,
              last_seen_at: true,
              switch: { select: { name: true, active: true } },
              reserved_miner: { select: minerSelect },
            },
          },
        },
      },
    },
  })
  if (!can) return null
  const rows = can.row_count,
    columns = can.slot_per_row
  if (
    !Number.isInteger(rows) ||
    !Number.isInteger(columns) ||
    rows < 1 ||
    columns < 1 ||
    rows * columns > 10000 ||
    can.locations.length > 10000
  )
    throw new Error("Unsupported map dimensions")
  const active =
    can.is_active && can.building.is_active && can.building.site.is_active
  type RowMiner = NonNullable<
    (typeof can.locations)[number]["current_miners"][number]
  >
  const miner = (m: RowMiner | null | undefined): MapMiner | null =>
    m
      ? {
          id: m.id,
          identity: m.identify_miner_id,
          serial: m.serial_number,
          ip: m.miner_ip,
          locationId: m.current_location_id,
          locationKind: m.current_location?.kind ?? null,
        }
      : null
  const byCoordinate = new Map<string, typeof can.locations>()
  let outside = 0
  for (const location of can.locations) {
    const row = location.row_index,
      column = location.slot_index
    if (
      row === null ||
      column === null ||
      row < 0 ||
      column < 0 ||
      row >= rows ||
      column >= columns
    ) {
      outside++
      continue
    }
    const key = `${row}:${column}`
    byCoordinate.set(key, [...(byCoordinate.get(key) ?? []), location])
  }
  const cells: MapCell[] = Array.from(
    { length: rows * columns },
    (_, index) => {
      const row = Math.floor(index / columns),
        column = index % columns
      const matches = byCoordinate.get(`${row}:${column}`) ?? [],
        location = matches[0],
        port = location?.ports[0],
        occupant = location?.current_miners[0]
      const reservation = port?.reserved_miner
      const conflict =
        matches.length > 1 ||
        (location?.current_miners.length ?? 0) > 1 ||
        (location?.ports.length ?? 0) > 1 ||
        (!!location?.slot_occupant &&
          location.slot_occupant.id !== occupant?.id) ||
        (!!reservation && !!occupant && reservation.id !== occupant.id)
      return {
        row,
        column,
        locationId: location?.id ?? null,
        code: location?.code ?? null,
        active:
          active &&
          (location?.is_active ?? true) &&
          (port?.active ?? true) &&
          (port?.switch.active ?? true),
        conflict,
        port: port
          ? {
              id: port.id,
              number: port.port_number,
              switch: port.switch.name,
              observedMac: port.observed_mac,
              lastSeenAt: port.last_seen_at?.toISOString() ?? null,
            }
          : null,
        occupant: miner(occupant),
        reservation: miner(reservation),
      }
    }
  )
  return {
    id: can.id,
    siteId,
    building: can.building.building_number,
    number: can.can_number,
    rows,
    columns,
    active,
    cells,
    issues: outside
      ? [
          `${outside} location record(s) have coordinates outside the configured layout.`,
        ]
      : [],
    loadedAt: new Date().toISOString(),
  }
}

export async function readBuildingMapSummary(
  db: Pick<PrismaClient, "$transaction">,
  siteId: number,
  buildingId: number
): Promise<BuildingMapSummary | null> {
  return db.$transaction(
    async (tx) => {
      const building = await tx.buildings.findFirst({
        where: { id: buildingId, site_id: siteId },
        select: {
          id: true,
          building_number: true,
          is_active: true,
          site: { select: { is_active: true } },
        },
      })
      if (!building) return null
      const linked = {
        OR: [
          { current_location: { building_id: buildingId } },
          { reserved_port: { location: { building_id: buildingId } } },
        ],
      }
      const [total, deployed, repair, staging, pallet, reserved] =
        await Promise.all([
          tx.miner.count({ where: linked }),
          tx.miner.count({
            where: {
              current_location: {
                building_id: buildingId,
                kind: "DEPLOYMENT_SLOT",
              },
            },
          }),
          tx.miner.count({
            where: { AND: [linked, { current_location: { kind: "REPAIR" } }] },
          }),
          tx.miner.count({
            where: { AND: [linked, { current_location: { kind: "STAGING" } }] },
          }),
          tx.miner.count({
            where: { AND: [linked, { current_location: { kind: "PALLET" } }] },
          }),
          tx.port_index.count({
            where: {
              location: { building_id: buildingId },
              reserved_miner_id: { not: null },
            },
          }),
        ])
      return {
        id: building.id,
        number: building.building_number,
        active: building.is_active && building.site.is_active,
        linked: total,
        deployed,
        repair,
        staging,
        pallet,
        reserved,
        loadedAt: new Date().toISOString(),
      }
    },
    { isolationLevel: "RepeatableRead" }
  )
}
