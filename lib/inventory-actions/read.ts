import "server-only"
import type { PrismaClient, Prisma } from "@/lib/generated/prisma/client"
import { ActionError, canWriteInventory } from "./contracts"
export const locationSelect = {
  id: true,
  kind: true,
  code: true,
  name: true,
  is_active: true,
  site_id: true,
  site: { select: { name: true, is_active: true } },
  building: { select: { building_number: true, is_active: true } },
  can: { select: { can_number: true, is_active: true } },
  current_miners: { select: { id: true }, take: 1 },
  slot_occupant: { select: { id: true } },
  ports: {
    select: {
      reserved_miner_id: true,
      active: true,
      switch: { select: { active: true } },
    },
  },
  row_index: true,
  slot_index: true,
} as const
export function locationLabel(l: {
  name: string
  code: string
  kind: string
  site: { name: string }
  building: { building_number: number } | null
  can: { can_number: string } | null
  row_index: number | null
  slot_index: number | null
}) {
  return [
    l.site.name,
    l.building ? `B${l.building.building_number}` : null,
    l.can ? `Can ${l.can.can_number}` : null,
    l.kind === "DEPLOYMENT_SLOT"
      ? `${l.row_index}/${l.slot_index} (${l.code})`
      : `${l.name} (${l.code})`,
  ]
    .filter(Boolean)
    .join(" / ")
}
export const activeLocation = (l: {
  is_active: boolean
  site: { is_active: boolean }
  building: { is_active: boolean } | null
  can: { is_active: boolean } | null
}) =>
  l.is_active &&
  l.site.is_active &&
  (l.building?.is_active ?? true) &&
  (l.can?.is_active ?? true)
export async function readActionOptions(db: PrismaClient, role: string) {
  const [companies, models, sites] = await Promise.all([
    db.companies.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    db.miner_model.findMany({
      orderBy: [{ manufacturer: "asc" }, { name: "asc" }],
      select: { id: true, name: true, manufacturer: true },
    }),
    db.sites.findMany({
      where: { is_active: true },
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        buildings: {
          where: { is_active: true },
          orderBy: { building_number: "asc" },
          select: {
            id: true,
            building_number: true,
            cans: {
              where: { is_active: true },
              orderBy: { can_number: "asc" },
              select: { id: true, can_number: true },
            },
          },
        },
      },
    }),
  ])
  return {
    canWrite: canWriteInventory(role),
    companies,
    assignment: fixedCompanies(companies),
    models: models.map((m) => ({
      id: m.id,
      label: `${m.manufacturer} ${m.name}`,
    })),
    sites,
  }
}
export async function readActionMiner(db: PrismaClient, id: number) {
  const m = await db.miner.findUnique({
    where: { id },
    select: {
      id: true,
      identify_miner_id: true,
      serial_number: true,
      version: true,
      owner_company_id: true,
      management_company_id: true,
      model_id: true,
      asset_tag: true,
      current_location_id: true,
      current_location: { select: locationSelect },
    },
  })
  if (!m) throw new ActionError(404, "Miner not found.")
  return {
    id: m.id,
    identity: m.identify_miner_id,
    serial: m.serial_number,
    version: m.version,
    ownerId: m.owner_company_id,
    managerId: m.management_company_id,
    modelId: m.model_id,
    assetTag: m.asset_tag,
    locationId: m.current_location_id,
    location: m.current_location
      ? locationLabel(m.current_location)
      : "Not assigned",
  }
}
export async function readActionLocations(
  db: PrismaClient,
  p: URLSearchParams
) {
  const page = Number(p.get("page") ?? 1),
    search = (p.get("search") ?? "").trim(),
    site = p.get("site"),
    kind = p.get("kind"),
    building = p.get("building"),
    can = p.get("can")
  if (
    !Number.isInteger(page) ||
    page < 1 ||
    page > 10000 ||
    search.length > 200 ||
    [building, can].some(
      (value) => value !== null && value !== "" && !/^[1-9]\d{0,8}$/.test(value)
    ) ||
    (site && !/^[1-9]\d{0,8}$/.test(site)) ||
    (kind && !["DEPLOYMENT_SLOT", "REPAIR", "STAGING", "PALLET"].includes(kind))
  )
    throw new ActionError(400, "Invalid location filters.")
  const coordinates = /^(\d{1,4})\s*\/\s*(\d{1,4})$/.exec(search)
  const where = {
    AND: availableLocationWhere,
    ...(site ? { site_id: Number(site) } : {}),
    ...(building ? { building_id: Number(building) } : {}),
    ...(can ? { can_id: Number(can) } : {}),
    ...(kind ? { kind: kind as "DEPLOYMENT_SLOT" } : {}),
    ...(coordinates
      ? {
          row_index: Number(coordinates[1]),
          slot_index: Number(coordinates[2]),
        }
      : search
        ? {
            OR: [
              { code: { contains: search, mode: "insensitive" as const } },
              { name: { contains: search, mode: "insensitive" as const } },
            ],
          }
        : {}),
  }
  const [total, locations] = await Promise.all([
    db.locations.count({ where }),
    db.locations.findMany({
      where,
      select: locationSelect,
      orderBy: [{ site_id: "asc" }, { code: "asc" }, { id: "asc" }],
      skip: (page - 1) * 20,
      take: 20,
    }),
  ])
  return {
    total,
    page,
    items: locations.map((l) => ({
      id: l.id,
      label: locationLabel(l),
      kind: l.kind,
      active: activeLocation(l),
      available: isLocationAvailable(l),
      coordinate:
        l.kind === "DEPLOYMENT_SLOT" ? `${l.row_index}/${l.slot_index}` : null,
    })),
  }
}

export function fixedCompanies(companies: { id: number; name: string }[]) {
  const owners = companies.filter(
    (c) => c.name.trim().toLowerCase() === "ionic"
  )
  const managers = companies.filter(
    (c) => c.name.trim().toLowerCase() === "digitalcarpenter.io"
  )
  return owners.length === 1 && managers.length === 1
    ? { owner: owners[0], manager: managers[0] }
    : null
}
export const availableLocationWhere: Prisma.locationsWhereInput[] = [
  { is_active: true, site: { is_active: true } },
  { OR: [{ building_id: null }, { building: { is_active: true } }] },
  { OR: [{ can_id: null }, { can: { is_active: true } }] },
  { current_miners: { none: {} } },
  { slot_occupant: null },
  { ports: { none: { reserved_miner_id: { not: null } } } },
  {
    OR: [
      { kind: { not: "DEPLOYMENT_SLOT" } },
      {
        ports: {
          some: {
            active: true,
            reserved_miner_id: null,
            switch: { active: true },
          },
        },
      },
    ],
  },
]
export function isLocationAvailable(l: {
  is_active: boolean
  site: { is_active: boolean }
  building: { is_active: boolean } | null
  can: { is_active: boolean } | null
  kind: string
  current_miners: { id: number }[]
  slot_occupant: { id: number } | null
  ports: {
    reserved_miner_id: number | null
    active: boolean
    switch: { active: boolean }
  }[]
}) {
  return (
    activeLocation(l) &&
    !l.current_miners.length &&
    !l.slot_occupant &&
    l.ports.every((p) => p.reserved_miner_id === null) &&
    (l.kind !== "DEPLOYMENT_SLOT" ||
      l.ports.some((p) => p.active && p.switch.active))
  )
}
