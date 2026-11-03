import { z } from "zod"
const id = z.number().int().positive().max(2147483647)
const text = z.string().trim().min(1).max(200)
const notes = z
  .string()
  .trim()
  .min(3, "Explain the change in at least 3 characters.")
  .max(2000)
const common = { submissionKey: z.uuid(), notes }
const metadata = {
  modelId: id.nullable(),
  assetTag: z.string().trim().max(200).nullable(),
}
export const scrapConfirmationSchema = z
  .object({
    skeleton: z.literal(true),
    controlBoard: z.literal(true),
    hashboard1: z.literal(true),
    hashboard2: z.literal(true),
    hashboard3: z.literal(true),
    acknowledged: z.literal(true),
  })
  .strict()
const createFields = {
  skeletonSerial: text,
  registrationState: z.enum(["READY", "SCRAP"]),
  palletId: id.nullable(),
  componentConfirmation: scrapConfirmationSchema.nullable(),
  powerSupplyPresent: z.boolean(),
  ...metadata,
  notes: z.string().trim().max(2000).default(""),
}
function validateCreation(
  value: {
    registrationState: "READY" | "SCRAP"
    palletId: number | null
    componentConfirmation: unknown
    powerSupplyPresent: boolean
  },
  ctx: z.RefinementCtx
) {
  if (
    value.registrationState === "SCRAP" &&
    (!value.palletId || !value.componentConfirmation)
  )
    ctx.addIssue({
      code: "custom",
      message:
        "Scrap miners require a pallet and confirmation of the skeleton, control board and three hashboards.",
    })
  if (
    value.registrationState === "READY" &&
    (value.palletId !== null ||
      value.componentConfirmation !== null ||
      value.powerSupplyPresent)
  )
    ctx.addIssue({
      code: "custom",
      message:
        "Ready miners are registered without a destination or scrap checklist.",
    })
}
export const creationEntrySchema = z
  .object(createFields)
  .strict()
  .superRefine(validateCreation)
export type CreationEntry = z.infer<typeof creationEntrySchema>
export const createBatchSchema = z
  .object({
    kind: z.literal("create-batch"),
    entries: z.array(creationEntrySchema).min(1).max(25),
    submissionKey: z.uuid(),
    notes: z.string().trim().max(2000).default(""),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (
      new Set(value.entries.map((e) => e.skeletonSerial)).size !==
      value.entries.length
    )
      ctx.addIssue({
        code: "custom",
        message:
          "Each skeleton serial can only appear once in a creation batch.",
      })
  })
export type CreateBatchCommand = z.infer<typeof createBatchSchema>
export const actionSchema = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("create"),
      ...createFields,
      submissionKey: common.submissionKey,
    })
    .strict()
    .superRefine(validateCreation),
  z
    .object({
      kind: z.literal("move"),
      minerId: id,
      version: z.number().int().nonnegative(),
      locationId: id,
      ...common,
    })
    .strict(),
  z
    .object({
      kind: z.literal("edit"),
      minerId: id,
      version: z.number().int().nonnegative(),
      modelId: metadata.modelId,
      assetTag: metadata.assetTag,
      ...common,
    })
    .strict(),
])
export type InventoryCommand = z.infer<typeof actionSchema>
export type ActionContext = {
  lockedMiner?: boolean
  mode?: "move" | "edit" | "create" | "insert"
  minerId?: number
  locationId?: number
}
export type ActionMiner = {
  id: number
  identity: number
  serial: string
  version: number
  ownerId: number
  managerId: number
  modelId: number | null
  assetTag: string | null
  locationId: number | null
  location: string
}
export type ActionLocation = {
  id: number
  label: string
  kind: string
  active: boolean
  available: boolean
  coordinate: string | null
}
export type ActionOptions = {
  canWrite: boolean
  assignment: {
    owner: { id: number; name: string }
    manager: { id: number; name: string }
  } | null
  companies: { id: number; name: string }[]
  models: { id: number; label: string }[]
  sites: {
    id: number
    name: string
    buildings: {
      id: number
      building_number: number
      cans: { id: number; can_number: string }[]
    }[]
  }[]
}
export class ActionError extends Error {
  constructor(
    public status: number,
    message: string
  ) {
    super(message)
  }
}
export const canWriteInventory = (role: string) =>
  ["ADMIN", "MANAGER", "TECHNICIAN"].includes(role)

export const insertSchema = z
  .object({
    kind: z.literal("insert"),
    entries: z
      .array(
        z
          .object({
            minerId: id,
            version: z.number().int().nonnegative(),
            locationId: id,
          })
          .strict()
      )
      .min(1)
      .max(25),
    ...common,
  })
  .strict()
  .superRefine((value, ctx) => {
    if (
      new Set(value.entries.map((e) => e.minerId)).size !== value.entries.length
    )
      ctx.addIssue({ code: "custom", message: "Choose each miner only once." })
    if (
      new Set(value.entries.map((e) => e.locationId)).size !==
      value.entries.length
    )
      ctx.addIssue({
        code: "custom",
        message: "Choose a different port for each miner.",
      })
  })
export type InsertCommand = z.infer<typeof insertSchema>
