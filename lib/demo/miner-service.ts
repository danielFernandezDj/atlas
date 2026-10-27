/** In-memory demo adapter only. Never import this module from a production data adapter.
 * Capability choices below are explicit fixtures, not a role-based authorization policy.
 */
import {
  MinerServiceError,
  isLocationActive,
  locationPath,
  modelLabel,
  type Miner,
  type MinerService,
  type MinerQuery,
  type MinerDetail,
  type Movement,
  type MoveCommand,
  type Location,
  type Site,
  type Building,
  type Can,
  type Page,
  type DestinationQuery,
  type DestinationOptions,
  type RegisterMinerCommand,
} from "../miners/contracts"

const names = ["North Site", "South Site", "East Site", "West Site"]
const pageOf = <T>(items: T[], page: number, pageSize: number): Page<T> => ({
  items: structuredClone(items.slice((page - 1) * pageSize, page * pageSize)),
  total: items.length,
  page,
  page_size: pageSize,
})
export function createDemoMinerService({
  latency = 180,
}: { latency?: number } = {}) {
  const sites: Site[] = names.map((name, index) => ({
    id: index + 1,
    name,
    is_active: true,
  }))
  const buildings: Building[] = sites.flatMap((site) =>
    [1, 2].map((n) => ({
      id: site.id * 10 + n,
      site_id: site.id,
      building_number: n,
      is_active: !(site.id === 1 && n === 2),
    }))
  )
  const cans: Can[] = buildings.flatMap((building) =>
    ["01", "B-02"].map((n, index) => ({
      id: building.id * 10 + index + 1,
      building_id: building.id,
      can_number: n,
      row_count: 8,
      slot_per_row: 16,
      is_active: n !== "B-02",
    }))
  )
  const locations: Location[] = cans.flatMap((can) => {
    const building = buildings.find((item) => item.id === can.building_id)!
    const site = sites.find((item) => item.id === building.site_id)!
    return [
      "DEPLOYMENT_SLOT",
      "DEPLOYMENT_SLOT",
      "DEPLOYMENT_SLOT",
      "PALLET",
      "STAGING",
      "REPAIR",
    ].map((kind, index) => ({
      id: can.id * 10 + index,
      site_id: site.id,
      building_id: building.id,
      can_id: can.id,
      kind: kind as Location["kind"],
      code: `B${building.building_number}-${can.can_number}-${index < 3 ? `R2-S${index + 4}` : ["", "", "", "P01", "ST01", "RP01"][index]}`,
      name:
        index < 3
          ? "Deployment bay"
          : ["", "", "", "Pallet 01", "Intake staging", "Repair area 01"][
              index
            ],
      row_index: index < 3 ? 2 : null,
      slot_index: index < 3 ? index + 4 : null,
      is_active: !(
        site.id === 1 &&
        building.building_number === 2 &&
        index === 5
      ),
      site,
      building,
      can,
    }))
  })
  const companies = [
    { id: 1, name: "Atlas Operations" },
    { id: 2, name: "Summit Mining" },
    { id: 3, name: "Meridian Assets" },
  ]
  const models = [
    { id: 1, manufacturer: "Bitmain", name: "Antminer S19", variant: "Pro" },
    { id: 2, manufacturer: "Bitmain", name: "Antminer S21", variant: null },
    { id: 3, manufacturer: "MicroBT", name: "WhatsMiner M50", variant: "S" },
  ]
  let miners: Miner[] = sites.flatMap((site) =>
    Array.from({ length: 8 }, (_, index) => {
      const local = locations.filter(
        (location) =>
          location.site_id === site.id &&
          location.building?.building_number === 1 &&
          location.can.can_number === "01"
      )
      const id = (site.id - 1) * 8 + index + 1
      return {
        id,
        serial_number:
          index === 7
            ? `ATLAS-S21-PRO-2026-${site.name.split(" ")[0].toUpperCase()}-000000000008`
            : `ATLAS-${1000 + id}`,
        asset_tag:
          index === 2 || index === 7
            ? null
            : index < 2
              ? "ASSET-204"
              : `ASSET-${200 + id}`,
        model:
          index === 2
            ? null
            : {
                manufacturer: "Bitmain",
                name: index % 2 ? "Antminer S21" : "Antminer S19",
                variant: index % 2 ? null : "Pro",
              },
        owner: companies[index % 3],
        manager: companies[0],
        current_location:
          index === 7
            ? null
            : index === 6
              ? locations.find(
                  (location) =>
                    location.site_id === site.id &&
                    location.building?.building_number === 2 &&
                    location.can.can_number === "01" &&
                    location.kind === "REPAIR"
                )!
              : local[[0, 5, 1, 3, 4, 5][index]],
        version: index === 7 ? 0 : 2,
        created_at: "2026-10-01T15:00:00Z",
        updated_at: "2026-10-26T15:15:00Z",
      }
    })
  )
  let movements: Movement[] = miners
    .filter((miner) => miner.current_location)
    .flatMap((miner) => {
      const initial = locations.find(
        (location) =>
          location.site_id === miner.current_location!.site_id &&
          location.building?.building_number === 1 &&
          location.can.can_number === "01" &&
          location.kind === "STAGING"
      )!
      return [
        {
          id: miner.id * 2 - 1,
          miner_id: miner.id,
          serial_number: miner.serial_number,
          from_location: null,
          to_location: initial,
          reason: "INITIAL_REGISTRATION" as const,
          notes: "Received and registered in the demo inventory.",
          recorded_by: { id: 2, name: "Jordan Lee" },
          occurred_at: "2026-10-01T15:00:00Z",
          recorded_at: "2026-10-01T15:03:00Z",
          submission_key: `00000000-0000-4000-8000-${String(miner.id * 2 - 1).padStart(12, "0")}`,
        },
        {
          id: miner.id * 2,
          miner_id: miner.id,
          serial_number: miner.serial_number,
          from_location: initial,
          to_location: miner.current_location!,
          reason: "RELOCATION" as const,
          notes:
            miner.id % 2 ? "Location verified during inventory walk." : null,
          recorded_by: { id: 1, name: "Alex Morgan" },
          occurred_at: "2026-10-26T15:00:00Z",
          recorded_at: "2026-10-26T15:15:00Z",
          submission_key: `00000000-0000-4000-8000-${String(miner.id * 2).padStart(12, "0")}`,
        },
      ]
    })
  const submissions = new Map<
    string,
    { fingerprint: string; movement_id: number }
  >()
  const registrations = new Map<
    string,
    { fingerprint: string; miner_id: number }
  >()
  const readOnlyIds = new Set([4, 12, 20, 28])
  let loseAcknowledgement = false,
    failRead = false
  const capabilities = (id: number): MinerDetail["capabilities"] => ({
    can_move: !readOnlyIds.has(id),
    explanation: readOnlyIds.has(id)
      ? "This demo record is view-only. Production permissions will come from the server."
      : null,
    allowed_reasons: [
      "DEPLOYMENT",
      "READY_FOR_DEPLOYMENT",
      "REPAIR",
      "RELOCATION",
    ],
  })
  async function delay(signal?: AbortSignal) {
    if (signal?.aborted) throw new DOMException("Aborted", "AbortError")
    if (latency)
      await new Promise<void>((resolve) => setTimeout(resolve, latency))
    if (signal?.aborted) throw new DOMException("Aborted", "AbortError")
    if (failRead) {
      failRead = false
      throw new MinerServiceError(
        "NETWORK",
        "The demo data could not be loaded. Please try again."
      )
    }
  }
  function get(id: number) {
    const miner = miners.find((item) => item.id === id)
    if (!miner)
      throw new MinerServiceError(
        "NOT_FOUND",
        "Miner not found or no longer accessible."
      )
    return miner
  }
  function destinationOptions(
    query: DestinationQuery,
    miner: Miner | null = null,
    canUse = true
  ): DestinationOptions {
    const activeSites = sites.filter((site) => site.is_active)
    const activeBuildings = buildings.filter(
      (building) => building.site_id === query.site_id && building.is_active
    )
    const activeCans = cans.filter(
      (can) =>
        activeBuildings.some((building) => building.id === can.building_id) &&
        can.building_id === query.building_id &&
        can.is_active
    )
    const available = locations
      .filter(
        (location) =>
          location.site_id === query.site_id &&
          activeBuildings.some(
            (building) => building.id === location.building_id
          ) &&
          activeCans.some((can) => can.id === location.can_id) &&
          location.building_id === query.building_id &&
          location.can_id === query.can_id &&
          (!query.kind || location.kind === query.kind) &&
          isLocationActive(location)
      )
      .map((location) => {
        const occupied =
          location.kind === "DEPLOYMENT_SLOT" &&
          miners.some((item) => item.current_location?.id === location.id)
        const reason = !canUse
          ? "Movement not permitted"
          : miner?.current_location?.id === location.id
            ? "Current location"
            : occupied
              ? "Occupied deployment slot"
              : null
        return { location, eligible: !reason, unavailable_reason: reason }
      })
    return structuredClone({
      sites: activeSites,
      buildings: activeBuildings,
      cans: activeCans,
      destinations: pageOf(available, query.page, query.page_size),
    })
  }
  const service: MinerService = {
    mode: "demo",
    async searchMiners(query: MinerQuery, signal) {
      await delay(signal)
      const search = query.search.trim().toLocaleLowerCase()
      const matches = miners.filter(
        (miner) =>
          (query.site_id === null ||
            miner.current_location?.site_id === query.site_id) &&
          (!query.kind ||
            (query.kind === "UNASSIGNED"
              ? !miner.current_location
              : miner.current_location?.kind === query.kind)) &&
          `${miner.serial_number} ${miner.asset_tag ?? ""} ${modelLabel(miner)} ${miner.owner.name} ${miner.manager.name} ${locationPath(miner.current_location)}`
            .toLocaleLowerCase()
            .includes(search)
      )
      return pageOf(matches, query.page, query.page_size)
    },
    async getMiner(id, signal) {
      await delay(signal)
      return structuredClone({ miner: get(id), capabilities: capabilities(id) })
    },
    async getHistory(id, page, pageSize, signal) {
      await delay(signal)
      get(id)
      return pageOf(
        movements
          .filter((item) => item.miner_id === id)
          .sort(
            (a, b) => b.occurred_at.localeCompare(a.occurred_at) || b.id - a.id
          ),
        page,
        pageSize
      )
    },
    async getDestinations(
      minerId: number,
      query: DestinationQuery,
      signal
    ): Promise<DestinationOptions> {
      await delay(signal)
      const miner = get(minerId)
      return destinationOptions(query, miner, capabilities(minerId).can_move)
    },
    async getRegistrationOptions(query, signal) {
      await delay(signal)
      return structuredClone({
        can_register: true,
        explanation: null,
        companies,
        models,
        locations: destinationOptions(query),
      })
    },
    async registerMiner(command: RegisterMinerCommand) {
      await delay()
      const payload = {
        serial_number: command.serial_number.trim(),
        asset_tag: command.asset_tag?.trim() || null,
        model_id: command.model_id,
        owner_company_id: command.owner_company_id,
        management_company_id: command.management_company_id,
        initial_location_id: command.initial_location_id,
        notes: command.notes?.trim() || null,
      }
      const fingerprint = JSON.stringify(payload)
      const previous = registrations.get(command.submission_key)
      if (previous) {
        if (previous.fingerprint !== fingerprint)
          throw new MinerServiceError(
            "INVALID",
            "This submission key was already used for a different registration."
          )
        return { miner: structuredClone(get(previous.miner_id)) }
      }
      if (
        !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
          command.submission_key
        ) ||
        submissions.has(command.submission_key)
      )
        throw new MinerServiceError(
          "INVALID",
          "Use a new UUID submission key for this registration."
        )
      if (!payload.serial_number)
        throw new MinerServiceError("INVALID", "Enter a serial number.")
      if (miners.some((miner) => miner.serial_number === payload.serial_number))
        throw new MinerServiceError(
          "DUPLICATE_SERIAL",
          "A miner with this serial number already exists. Check the serial or open the existing record."
        )
      const owner = companies.find(
          (company) => company.id === payload.owner_company_id
        ),
        manager = companies.find(
          (company) => company.id === payload.management_company_id
        )
      const model =
        payload.model_id === null
          ? null
          : models.find((item) => item.id === payload.model_id)
      if (!owner || !manager || model === undefined)
        throw new MinerServiceError(
          "INVALID",
          "Choose existing owner, management company, and model records."
        )
      const destination =
        payload.initial_location_id === null
          ? null
          : locations.find(
              (location) => location.id === payload.initial_location_id
            )
      if (
        destination === undefined ||
        (destination && !isLocationActive(destination))
      )
        throw new MinerServiceError(
          "INVALID",
          "Choose an active existing location and hierarchy."
        )
      if (!destination && payload.notes)
        throw new MinerServiceError(
          "INVALID",
          "Movement notes require an initial location. This form does not store miner condition notes."
        )
      if (
        destination?.kind === "DEPLOYMENT_SLOT" &&
        miners.some((miner) => miner.current_location?.id === destination.id)
      )
        throw new MinerServiceError(
          "SLOT_OCCUPIED",
          "That deployment slot was taken. Choose another location; no miner has been added."
        )
      const at = new Date().toISOString()
      const miner: Miner = {
        id: Math.max(0, ...miners.map((item) => item.id)) + 1,
        serial_number: payload.serial_number,
        asset_tag: payload.asset_tag,
        model: model
          ? {
              manufacturer: model.manufacturer,
              name: model.name,
              variant: model.variant,
            }
          : null,
        owner,
        manager,
        current_location: destination,
        version: destination ? 1 : 0,
        created_at: at,
        updated_at: at,
      }
      // One synchronous demo commit. No miner or movement is created until all checks pass.
      miners.push(miner)
      if (destination)
        movements.unshift({
          id: Math.max(0, ...movements.map((item) => item.id)) + 1,
          miner_id: miner.id,
          serial_number: miner.serial_number,
          from_location: null,
          to_location: destination,
          reason: "INITIAL_REGISTRATION",
          notes: payload.notes,
          recorded_by: { id: 1, name: "Alex Morgan" },
          occurred_at: at,
          recorded_at: at,
          submission_key: command.submission_key,
        })
      registrations.set(command.submission_key, {
        fingerprint,
        miner_id: miner.id,
      })
      if (loseAcknowledgement) {
        loseAcknowledgement = false
        throw new MinerServiceError(
          "NETWORK",
          "The response was interrupted. This miner may have been added. Retry unchanged to confirm, or find its serial in the inventory."
        )
      }
      return { miner: structuredClone(miner) }
    },
    async move(command: MoveCommand) {
      await delay()
      const { submission_key } = command
      const fingerprint = JSON.stringify({
        miner_id: command.miner_id,
        destination_location_id: command.destination_location_id,
        reason: command.reason,
        notes: command.notes?.trim() || null,
        expected_version: command.expected_version,
      })
      if (registrations.has(submission_key))
        throw new MinerServiceError(
          "INVALID",
          "This submission key belongs to a registration."
        )
      const previous = submissions.get(submission_key)
      if (previous) {
        if (previous.fingerprint !== fingerprint)
          throw new MinerServiceError(
            "INVALID",
            "Submission key was already used for a different move."
          )
        return { movement_id: previous.movement_id }
      }
      if (
        !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
          submission_key
        )
      )
        throw new MinerServiceError(
          "INVALID",
          "A UUID submission key is required."
        )
      const miner = get(command.miner_id),
        permission = capabilities(miner.id)
      if (!permission.can_move)
        throw new MinerServiceError(
          "FORBIDDEN",
          "You no longer have permission to move this miner."
        )
      if (miner.version !== command.expected_version)
        throw new MinerServiceError(
          "VERSION_CONFLICT",
          "This miner was moved by someone else. Current details have been refreshed. Review them before preparing a new move."
        )
      const destination = locations.find(
        (item) => item.id === command.destination_location_id
      )
      if (
        !destination ||
        !isLocationActive(destination) ||
        !permission.allowed_reasons.includes(command.reason) ||
        destination.id === miner.current_location?.id
      )
        throw new MinerServiceError(
          "INVALID",
          "This destination or movement reason is no longer eligible. Refresh the destination choices."
        )
      if (
        destination.kind === "DEPLOYMENT_SLOT" &&
        miners.some((item) => item.current_location?.id === destination.id)
      )
        throw new MinerServiceError(
          "SLOT_OCCUPIED",
          "Another miner occupies that slot. Availability has been refreshed. Choose a different destination."
        )
      const at = new Date().toISOString(),
        movement_id = Math.max(0, ...movements.map((item) => item.id)) + 1
      // Synchronous demo transaction: validate then change both collections, with no await between writes.
      movements = [
        {
          id: movement_id,
          miner_id: miner.id,
          serial_number: miner.serial_number,
          from_location: miner.current_location,
          to_location: destination,
          reason: command.reason,
          notes: command.notes?.trim() || null,
          recorded_by: { id: 1, name: "Alex Morgan" },
          occurred_at: at,
          recorded_at: at,
          submission_key,
        },
        ...movements,
      ]
      miners = miners.map((item) =>
        item.id === miner.id
          ? {
              ...item,
              current_location: destination,
              version: item.version + 1,
              updated_at: at,
            }
          : item
      )
      submissions.set(submission_key, { fingerprint, movement_id })
      if (loseAcknowledgement) {
        loseAcknowledgement = false
        throw new MinerServiceError(
          "NETWORK",
          "The response was interrupted. This move may have saved. Retry unchanged to confirm it safely."
        )
      }
      return { movement_id }
    },
  }
  return Object.assign(service, {
    dashboardHistory() {
      return structuredClone(movements).sort(
        (a, b) => b.occurred_at.localeCompare(a.occurred_at) || b.id - a.id
      )
    },
    // Test-only controls. They are deliberately outside the production interface.
    demo: {
      failNextRead() {
        failRead = true
      },
      loseNextAcknowledgement() {
        loseAcknowledgement = true
      },
      simulateConcurrentMove(id: number) {
        const miner = get(id)
        const to = locations.find(
          (item) =>
            item.site_id === miner.current_location?.site_id &&
            item.kind === "PALLET" &&
            isLocationActive(item)
        )!
        const at = new Date().toISOString()
        movements.unshift({
          id: Math.max(0, ...movements.map((item) => item.id)) + 1,
          miner_id: id,
          serial_number: miner.serial_number,
          from_location: miner.current_location,
          to_location: to,
          reason: "RELOCATION",
          notes: "Concurrent move in the demo simulation.",
          recorded_by: { id: 2, name: "Jordan Lee" },
          occurred_at: at,
          recorded_at: at,
          submission_key: crypto.randomUUID(),
        })
        miners = miners.map((item) =>
          item.id === id
            ? {
                ...item,
                current_location: to,
                version: item.version + 1,
                updated_at: new Date().toISOString(),
              }
            : item
        )
      },
      occupySlot(id: number) {
        const slot = locations.find((item) => item.id === id)!
        miners = miners.map((item, index) =>
          index === miners.length - 1
            ? { ...item, current_location: slot, version: item.version + 1 }
            : item
        )
      },
    },
  })
}
export type DemoMinerService = ReturnType<typeof createDemoMinerService>
