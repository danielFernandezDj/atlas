/**
 * Defines the local review entry, required scrap parts and empty component checks
 * shared by the Create miner hook and panels. Presence checks record technician
 * acknowledgment; they are not component IDs, serials or invented MAC addresses.
 */
import type {
  CreationEntry,
  ActionLocation,
  ActionOptions,
} from "@/lib/inventory-actions/contracts"
export type ReviewEntry = CreationEntry & { pallet: ActionLocation | null }
export const requiredScrapParts = [
  ["skeleton", "Skeleton present"],
  ["controlBoard", "One control board present"],
  ["hashboard1", "Hashboard 1 present"],
  ["hashboard2", "Hashboard 2 present"],
  ["hashboard3", "Hashboard 3 present"],
] as const
export const createEmptyComponentChecks = () => ({
  skeleton: false,
  controlBoard: false,
  hashboard1: false,
  hashboard2: false,
  hashboard3: false,
})

export type CreateMinersProps = {
  options: ActionOptions
  onExpandedChange: (expanded: boolean) => void
  onBusyChange: (busy: boolean) => void
  onSaved: () => void
  onClose: () => void
  onBack: () => void
}
