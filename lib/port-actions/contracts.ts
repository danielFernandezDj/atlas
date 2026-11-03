import { z } from "zod"
const id = z.number().int().positive().max(2147483647)
const version = z.number().int().nonnegative().max(2147483647)
export const portOperations = [
  "add",
  "replace",
  "pull",
  "disable",
  "enable",
  "release",
  "return",
] as const
export type PortOperation = (typeof portOperations)[number]
export const portOperationLabels: Record<PortOperation, string> = {
  add: "Add miner here",
  replace: "Replace miner",
  pull: "Pull miner",
  disable: "Disable port",
  enable: "Re-enable port",
  release: "Release reservation",
  return: "Return reserved miner",
}
export const portSnapshotSchema = z
  .object({
    occupantId: id.nullable(),
    occupantVersion: version.nullable(),
    reservationId: id.nullable(),
    reservationVersion: version.nullable(),
    portActive: z.boolean(),
  })
  .strict()
export type PortSnapshot = z.infer<typeof portSnapshotSchema>
export const portCommandSchema = z
  .object({
    operation: z.enum(portOperations),
    locationId: id,
    snapshot: portSnapshotSchema,
    incoming: z.object({ id, version }).strict().nullable(),
    disposition: z.enum(["REPAIR", "STAGING", "PALLET", "UNASSIGNED"]),
    destinationId: id.nullable(),
    keepReservation: z.boolean(),
    notes: z
      .string()
      .trim()
      .min(3, "Explain the action in at least 3 characters.")
      .max(2000),
    submissionKey: z.uuid(),
  })
  .strict()
  .superRefine((v, ctx) => {
    if ((v.operation === "add" || v.operation === "replace") && !v.incoming)
      ctx.addIssue({ code: "custom", message: "Choose the incoming miner." })
    if (v.operation !== "add" && v.operation !== "replace" && v.incoming)
      ctx.addIssue({
        code: "custom",
        message: "An incoming miner is not used for this action.",
      })
    const relocates =
      v.operation === "pull" ||
      (v.operation === "replace" && v.snapshot.occupantId !== null)
    if (relocates && v.disposition !== "UNASSIGNED" && !v.destinationId)
      ctx.addIssue({
        code: "custom",
        message: "Choose the outgoing miner’s destination.",
      })
    if (!relocates && v.destinationId !== null)
      ctx.addIssue({
        code: "custom",
        message: "This action does not use a destination.",
      })
    if (v.disposition === "UNASSIGNED" && v.destinationId)
      ctx.addIssue({
        code: "custom",
        message: "An unassigned miner has no destination.",
      })
    if (
      v.keepReservation &&
      (v.operation !== "pull" || v.disposition !== "REPAIR")
    )
      ctx.addIssue({
        code: "custom",
        message:
          "Reservations can be kept only when pulling a miner to repair.",
      })
  })
export type PortCommand = z.infer<typeof portCommandSchema>
export type PortMiner = {
  id: number
  identity: number
  serial: string
  version: number
  locationId: number | null
  occupiedSlotId: number | null
  location: string
}
export type PortDetail = {
  locationId: number
  portId: number
  coordinate: string
  label: string
  code: string
  siteId: number
  portActive: boolean
  hierarchyActive: boolean
  switchActive: boolean
  switchName: string
  socket: string
  conflict: boolean
  occupant: PortMiner | null
  reservation: PortMiner | null
  snapshot: PortSnapshot
}
export type PortOptions = {
  lastChange?: {
    action: string
    notes: string | null
    by: string
    at: string
  } | null
  port: PortDetail
  canWrite: boolean
  sites: { id: number; name: string }[]
}
export function samePortSnapshot(a: PortSnapshot, b: PortSnapshot) {
  return (
    a.occupantId === b.occupantId &&
    a.occupantVersion === b.occupantVersion &&
    a.reservationId === b.reservationId &&
    a.reservationVersion === b.reservationVersion &&
    a.portActive === b.portActive
  )
}
