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
  ownerId: id,
  managerId: id,
  modelId: id.nullable(),
  assetTag: z.string().trim().max(200).nullable(),
}
export const actionSchema = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("create"),
      skeletonSerial: text,
      locationId: id,
      ...metadata,
      ...common,
    })
    .strict(),
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
      ...metadata,
      ...common,
    })
    .strict(),
])
export type InventoryCommand = z.infer<typeof actionSchema>
export type ActionContext = {
  mode?: "move" | "edit" | "create"
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
}
export type ActionOptions = {
  canWrite: boolean
  companies: { id: number; name: string }[]
  models: { id: number; label: string }[]
  sites: { id: number; name: string }[]
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
