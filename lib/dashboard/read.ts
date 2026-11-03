import "server-only"

import type { PrismaClient } from "@/lib/generated/prisma/client"
import type { DashboardAccess, DashboardSite } from "./contracts"

type DashboardDatabase = Pick<PrismaClient, "users" | "$transaction">
type Identity = { email: string; emailVerified: boolean }
const movementLimit = 20

function locationLabel(
  location: { name: string; code: string; site: { name: string } } | null
) {
  return location
    ? `${location.site.name} / ${location.name} (${location.code})`
    : "Not assigned"
}

// Authorization lives beside the queries so no alternate caller can bypass it.
// Active staff can read all sites; Atlas intentionally has no user_sites table.
export async function readDashboard(
  db: DashboardDatabase,
  identity: Identity,
  requestedSite?: string | string[]
): Promise<DashboardAccess> {
  if (!identity.emailVerified) return { status: "verify-email" }
  const staff = await db.users.findUnique({
    where: { email: identity.email },
    select: { first_name: true, last_name: true, role: true, is_active: true },
  })
  if (!staff?.is_active) return { status: "denied" }

  return db.$transaction(
    async (tx) => {
      const sites: DashboardSite[] = await tx.sites.findMany({
        orderBy: [{ is_active: "desc" }, { name: "asc" }, { id: "asc" }],
        select: { id: true, name: true, description: true, is_active: true },
      })
      const explicitSite = requestedSite !== undefined
      const validId =
        typeof requestedSite === "string" &&
        /^[1-9]\d*$/.test(requestedSite) &&
        Number.isSafeInteger(Number(requestedSite))
      const selectedSite = explicitSite
        ? ((validId
            ? sites.find((site) => site.id === Number(requestedSite))
            : undefined) ?? null)
        : (sites[0] ?? null)
      const base = {
        status: "ready" as const,
        viewer: {
          name: `${staff.first_name} ${staff.last_name}`.trim(),
          role: staff.role,
        },
      }
      if (!selectedSite) {
        return {
          ...base,
          dashboard: {
            sites,
            selectedSite: null,
            siteUnavailable: explicitSite,
            summary: null,
            buildings: [],
            movements: [],
            loadedAt: new Date().toISOString(),
          },
        }
      }
      const siteId = selectedSite.id
      const minerAt = (
        kind: "DEPLOYMENT_SLOT" | "REPAIR" | "STAGING" | "PALLET"
      ) =>
        tx.miner.count({
          where: { current_location: { site_id: siteId, kind } },
        })
      const installedAtSite = {
        miner: { current_location: { site_id: siteId } },
      }
      const [
        deployed,
        repair,
        linked,
        repairReserved,
        staging,
        pallet,
        slots,
        occupied,
        reserved,
        skeletons,
        controlBoards,
        hashBoards,
        buildings,
        movements,
      ] = await Promise.all([
        minerAt("DEPLOYMENT_SLOT"),
        minerAt("REPAIR"),
        tx.miner.count({
          where: {
            OR: [
              { current_location: { site_id: siteId } },
              { reserved_port: { location: { site_id: siteId } } },
            ],
          },
        }),
        tx.miner.count({
          where: {
            reserved_port: { location: { site_id: siteId } },
            current_location: { kind: "REPAIR" },
          },
        }),
        minerAt("STAGING"),
        minerAt("PALLET"),
        tx.locations.count({
          where: { site_id: siteId, kind: "DEPLOYMENT_SLOT" },
        }),
        tx.miner.count({ where: { occupied_slot: { site_id: siteId } } }),
        tx.port_index.count({
          where: {
            location: { site_id: siteId },
            reserved_miner_id: { not: null },
          },
        }),
        tx.skeleton.count({ where: installedAtSite }),
        tx.control_boards.count({ where: installedAtSite }),
        tx.hash_boards.count({ where: installedAtSite }),
        tx.buildings.findMany({
          where: { site_id: siteId },
          orderBy: [{ building_number: "asc" }, { id: "asc" }],
          select: {
            id: true,
            building_number: true,
            is_active: true,
            cans: {
              orderBy: [{ can_number: "asc" }, { id: "asc" }],
              select: {
                id: true,
                can_number: true,
                is_active: true,
                _count: {
                  select: { locations: { where: { kind: "DEPLOYMENT_SLOT" } } },
                },
              },
            },
          },
        }),
        tx.miner_movements.findMany({
          where: {
            OR: [
              { from_location: { site_id: siteId } },
              { to_location: { site_id: siteId } },
            ],
          },
          orderBy: [{ occurred_at: "desc" }, { id: "desc" }],
          take: movementLimit,
          select: {
            id: true,
            reason: true,
            source: true,
            occurred_at: true,
            miner: {
              select: {
                id: true,
                identify_miner_id: true,
                serial_number: true,
              },
            },
            from_location: {
              select: {
                name: true,
                code: true,
                site: { select: { name: true } },
              },
            },
            to_location: {
              select: {
                name: true,
                code: true,
                site: { select: { name: true } },
              },
            },
            recorded_by: { select: { first_name: true, last_name: true } },
          },
        }),
      ])
      return {
        ...base,
        dashboard: {
          sites,
          selectedSite,
          siteUnavailable: false,
          loadedAt: new Date().toISOString(),
          summary: {
            miners: deployed + repair + staging + pallet,
            linked,
            repairReserved,
            deployed,
            repair,
            staging,
            pallet,
            slots,
            occupied,
            reserved,
            skeletons,
            controlBoards,
            hashBoards,
          },
          buildings: buildings.map((building) => ({
            id: building.id,
            number: building.building_number,
            active: building.is_active,
            cans: building.cans.map((can) => ({
              id: can.id,
              number: can.can_number,
              active: can.is_active,
              slots: can._count.locations,
            })),
          })),
          movements: movements.map((movement) => ({
            id: movement.id,
            minerId: movement.miner.id,
            identity: movement.miner.identify_miner_id,
            serial: movement.miner.serial_number,
            from: locationLabel(movement.from_location),
            to: locationLabel(movement.to_location),
            reason: movement.reason.replaceAll("_", " ").toLowerCase(),
            by: movement.recorded_by
              ? `${movement.recorded_by.first_name} ${movement.recorded_by.last_name}`.trim()
              : `${movement.source.toLowerCase()} integration`,
            occurredAt: movement.occurred_at.toISOString(),
          })),
        },
      }
    },
    { isolationLevel: "RepeatableRead", maxWait: 10000, timeout: 20000 }
  )
}
