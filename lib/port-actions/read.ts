import "server-only"
import type { PrismaClient, Prisma } from "@/lib/generated/prisma/client"
import { ActionError } from "@/lib/inventory-actions/contracts"
import { locationLabel, activeLocation } from "@/lib/inventory-actions/read"
import type { PortDetail, PortMiner } from "./contracts"
const currentLocationSelect = {
  name: true,
  code: true,
  kind: true,
  site: { select: { name: true } },
  building: { select: { building_number: true } },
  can: { select: { can_number: true } },
  row_index: true,
  slot_index: true,
} as const
const minerSelect = {
  id: true,
  identify_miner_id: true,
  serial_number: true,
  version: true,
  current_location_id: true,
  occupied_slot_id: true,
  current_location: { select: currentLocationSelect },
} as const
export async function readPortDetail(
  db: Pick<PrismaClient, "locations">,
  locationId: number
): Promise<PortDetail> {
  const l = await db.locations.findUnique({
    where: { id: locationId },
    select: {
      id: true,
      kind: true,
      code: true,
      name: true,
      site_id: true,
      is_active: true,
      row_index: true,
      slot_index: true,
      site: { select: { name: true, is_active: true } },
      building: { select: { building_number: true, is_active: true } },
      can: { select: { can_number: true, is_active: true } },
      current_miners: { take: 2, select: minerSelect },
      slot_occupant: { select: { id: true } },
      ports: {
        take: 2,
        select: {
          id: true,
          port_number: true,
          active: true,
          switch: { select: { name: true, active: true } },
          reserved_miner: { select: minerSelect },
        },
      },
    },
  })
  if (!l || l.kind !== "DEPLOYMENT_SLOT")
    throw new ActionError(404, "Deployment location not found.")
  if (l.ports.length !== 1)
    throw new ActionError(
      409,
      "Configure exactly one network port for this location before using port actions."
    )
  const p = l.ports[0],
    current = l.current_miners[0] ?? null
  const dto = (m: NonNullable<typeof current> | null): PortMiner | null =>
    m
      ? {
          id: m.id,
          identity: m.identify_miner_id,
          serial: m.serial_number,
          version: m.version,
          locationId: m.current_location_id,
          occupiedSlotId: m.occupied_slot_id,
          location: m.current_location
            ? locationLabel(m.current_location)
            : "Unassigned",
        }
      : null
  const occupant = dto(current),
    reservation = dto(p.reserved_miner)
  const conflict =
    l.current_miners.length > 1 ||
    (!!l.slot_occupant && l.slot_occupant.id !== current?.id) ||
    (!!current && current.occupied_slot_id !== l.id) ||
    (!!current && !!reservation && current.id !== reservation.id)
  return {
    locationId: l.id,
    portId: p.id,
    coordinate: `${l.row_index}/${l.slot_index}`,
    label: locationLabel(l),
    code: l.code,
    siteId: l.site_id,
    portActive: p.active,
    hierarchyActive: activeLocation(l),
    switchActive: p.switch.active,
    switchName: p.switch.name,
    socket: p.port_number,
    conflict,
    occupant,
    reservation,
    snapshot: {
      occupantId: occupant?.id ?? null,
      occupantVersion: occupant?.version ?? null,
      reservationId: reservation?.id ?? null,
      reservationVersion: reservation?.version ?? null,
      portActive: p.active,
    },
  }
}
export async function readPortDestinations(
  db: Pick<PrismaClient, "locations">,
  params: URLSearchParams
) {
  const site = params.get("site") ?? "",
    kind = params.get("kind") ?? "REPAIR",
    search = (params.get("search") ?? "").trim(),
    page = Number(params.get("page") ?? 1)
  if (
    !["REPAIR", "STAGING", "PALLET"].includes(kind) ||
    !/^[1-9]\d{0,8}$/.test(site) ||
    !Number.isInteger(page) ||
    page < 1 ||
    page > 10000 ||
    search.length > 200
  )
    throw new ActionError(400, "Choose valid destination filters.")
  const where: Prisma.locationsWhereInput = {
    site_id: Number(site),
    kind: kind as "REPAIR",
    is_active: true,
    site: { is_active: true },
    AND: [
      { OR: [{ building_id: null }, { building: { is_active: true } }] },
      { OR: [{ can_id: null }, { can: { is_active: true } }] },
    ],
    ...(search
      ? {
          OR: [
            { name: { contains: search, mode: "insensitive" } },
            { code: { contains: search, mode: "insensitive" } },
          ],
        }
      : {}),
  }
  const [total, locations] = await Promise.all([
    db.locations.count({ where }),
    db.locations.findMany({
      where,
      orderBy: [{ code: "asc" }, { id: "asc" }],
      skip: (page - 1) * 20,
      take: 20,
      select: { id: true, ...currentLocationSelect },
    }),
  ])
  return {
    total,
    items: locations.map((l) => ({ id: l.id, label: locationLabel(l) })),
  }
}
