"use client"
/**
 * Owns Create miner’s draft, review queue, scrap acknowledgment and submit lifecycle.
 * The screen/panels consume this one flow so edits and focus stay coordinated. Serial
 * checks are reads; submitBatch POSTs create-batch to /api/inventory-actions, where
 * lib/inventory-actions/write.ts performs the transaction.
 *
 * Navigation: draft/queue/dialog state; reset and serial check; candidate validation; queue edits; scrap acknowledgment; final batch submission; panel bindings.
 */

import { useEffect, useRef, useState, type FormEvent } from "react"
import {
  creationEntrySchema,
  type ActionLocation,
} from "@/lib/inventory-actions/contracts"
import {
  createEmptyComponentChecks,
  type ReviewEntry,
  type CreateMinersProps,
} from "./creation-model"
import { readRegistrationResource } from "../inventory-api"
export function useCreateMiners({
  options,
  onExpandedChange,
  onBusyChange,
  onSaved,
  onClose,
  onBack,
}: CreateMinersProps) {
  // Draft, review queue and dialog refs share one lifecycle for predictable focus.
  const [stage, setStage] = useState<"serial" | "details">("serial")
  const [serial, setSerial] = useState("")
  const [registrationState, setRegistrationState] = useState<
    "" | "READY" | "SCRAP"
  >("")
  const [modelId, setModelId] = useState<number | null>(null)
  const [assetTag, setAssetTag] = useState("")
  const [notes, setNotes] = useState("")
  const [pallet, setPallet] = useState<ActionLocation | null>(null)
  const [componentChecks, setComponentChecks] = useState(
    createEmptyComponentChecks
  )
  const [powerSupplyPresent, setPowerSupplyPresent] = useState(false)
  const [entries, setEntries] = useState<ReviewEntry[]>([])
  const [editingSerial, setEditingSerial] = useState<string | null>(null)
  const [revision, setRevision] = useState(0)
  const [checking, setChecking] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const [acknowledged, setAcknowledged] = useState(false)
  const pendingScrapEntry = useRef<ReviewEntry | null>(null)
  const scrapDialog = useRef<HTMLDialogElement>(null)
  const finalDialog = useRef<HTMLDialogElement>(null)
  const addButton = useRef<HTMLButtonElement>(null)
  const createButton = useRef<HTMLButtonElement>(null)
  const serialInput = useRef<HTMLInputElement>(null)
  const inFlight = useRef(false)
  const checkingRef = useRef(false)
  const submissionReceipt = useRef<{ fingerprint: string; key: string } | null>(
    null
  )
  const expanded = entries.length > 0 || stage === "details" || revision > 0
  useEffect(() => {
    if (stage === "serial" && revision > 0) serialInput.current?.focus()
  }, [stage, revision])
  // Draft reset and serial availability: reads never register inventory.
  function resetDraft() {
    setStage("serial")
    setSerial("")
    setRegistrationState("")
    setModelId(null)
    setAssetTag("")
    setNotes("")
    setPallet(null)
    setComponentChecks(createEmptyComponentChecks())
    setPowerSupplyPresent(false)
    setEditingSerial(null)
    setError("")
    setRevision((value) => value + 1)
  }
  async function continueSerial(event: FormEvent) {
    event.preventDefault()
    if (checkingRef.current) return
    const value = serial.trim()
    if (
      entries.some(
        (entry) =>
          entry.skeletonSerial === value &&
          entry.skeletonSerial !== editingSerial
      )
    ) {
      setError("This skeleton serial is already in the review list.")
      return
    }
    checkingRef.current = true
    setChecking(true)
    onBusyChange(true)
    setError("")
    try {
      await readRegistrationResource({ resource: "skeleton", serial: value })
      setSerial(value)
      setStage("details")
      onExpandedChange(true)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Cannot check this serial.")
    } finally {
      checkingRef.current = false
      setChecking(false)
      onBusyChange(false)
    }
  }
  // Validate presence evidence before it can enter the local review queue.
  function buildReviewEntry(): ReviewEntry | null {
    const result = creationEntrySchema.safeParse({
      skeletonSerial: serial.trim(),
      registrationState: registrationState,
      palletId: registrationState === "SCRAP" ? (pallet?.id ?? null) : null,
      componentConfirmation:
        registrationState === "SCRAP"
          ? { ...componentChecks, acknowledged: true }
          : null,
      powerSupplyPresent: registrationState === "SCRAP" && powerSupplyPresent,
      modelId,
      assetTag: assetTag.trim() || null,
      notes: notes.trim(),
    })
    if (!result.success) {
      setError(
        result.error.issues[0]?.message ?? "Complete the required information."
      )
      return null
    }
    if (!options.assignment) {
      setError(
        "Configure Ionic and DigitalCarpenter.io company records before creating miners."
      )
      return null
    }
    return {
      ...result.data,
      pallet: registrationState === "SCRAP" ? pallet : null,
    }
  }
  // Queue management is local only; final confirmation is the write boundary.
  function stageReviewEntry(entry: ReviewEntry) {
    if (
      entries.some(
        (other) =>
          other.skeletonSerial === entry.skeletonSerial &&
          other.skeletonSerial !== editingSerial
      )
    ) {
      setError("Each skeleton serial can only appear once.")
      return
    }
    if (editingSerial !== null)
      setEntries(
        entries.map((other) =>
          other.skeletonSerial === editingSerial ? entry : other
        )
      )
    else if (entries.length < 25) setEntries([...entries, entry])
    resetDraft()
  }
  function stageDraft(event: FormEvent) {
    event.preventDefault()
    const entry = buildReviewEntry()
    if (!entry) return
    if (entry.registrationState === "SCRAP") {
      pendingScrapEntry.current = entry
      setAcknowledged(false)
      scrapDialog.current?.showModal()
    } else stageReviewEntry(entry)
  }
  function editReviewEntry(entry: ReviewEntry) {
    setEditingSerial(entry.skeletonSerial)
    setSerial(entry.skeletonSerial)
    setRegistrationState(entry.registrationState)
    setModelId(entry.modelId)
    setAssetTag(entry.assetTag ?? "")
    setNotes(entry.notes)
    setPallet(entry.pallet)
    setComponentChecks(
      entry.componentConfirmation
        ? {
            skeleton: true,
            controlBoard: true,
            hashboard1: true,
            hashboard2: true,
            hashboard3: true,
          }
        : createEmptyComponentChecks()
    )
    setPowerSupplyPresent(entry.powerSupplyPresent)
    setStage("details")
    setRevision((value) => value + 1)
    setError("")
  }
  function removeReviewEntry(value: string) {
    setEntries(entries.filter((entry) => entry.skeletonSerial !== value))
    if (editingSerial === value) resetDraft()
  }
  // Scrap acknowledgment stages one inspected assembly; it is persisted with the batch.
  function cancelScrap() {
    scrapDialog.current?.close()
    pendingScrapEntry.current = null
    addButton.current?.focus()
  }
  function confirmScrap() {
    if (!acknowledged || !pendingScrapEntry.current) return
    const entry = pendingScrapEntry.current
    scrapDialog.current?.close()
    pendingScrapEntry.current = null
    stageReviewEntry(entry)
  }
  function reviewBatch() {
    if (!entries.length || serial.trim() || inFlight.current) return
    setError("")
    finalDialog.current?.showModal()
  }
  function cancelFinal() {
    if (inFlight.current) return
    finalDialog.current?.close()
    createButton.current?.focus()
  }
  // Final batch submission. Keep the receipt key for an unchanged retry after a lost response.
  async function submitBatch() {
    if (inFlight.current || !finalDialog.current?.open || !entries.length)
      return
    const payload = {
      kind: "create-batch",
      entries: entries.map((entry) => ({
        skeletonSerial: entry.skeletonSerial,
        registrationState: entry.registrationState,
        palletId: entry.palletId,
        componentConfirmation: entry.componentConfirmation,
        powerSupplyPresent: entry.powerSupplyPresent,
        modelId: entry.modelId,
        assetTag: entry.assetTag,
        notes: entry.notes,
      })),
      notes: "",
    }
    const fingerprint = JSON.stringify(payload)
    if (submissionReceipt.current?.fingerprint !== fingerprint)
      submissionReceipt.current = { fingerprint, key: crypto.randomUUID() }
    inFlight.current = true
    setBusy(true)
    onBusyChange(true)
    try {
      const response = await fetch("/api/inventory-actions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...payload,
          submissionKey: submissionReceipt.current!.key,
        }),
      })
      const body = await response.json()
      if (!response.ok)
        throw new Error(
          body.message ??
            "Creation could not be confirmed. Retry the unchanged batch."
        )
      finalDialog.current?.close()
      onSaved()
      onClose()
    } catch (e) {
      finalDialog.current?.close()
      setError(
        e instanceof Error ? e.message : "Creation could not be confirmed."
      )
    } finally {
      inFlight.current = false
      setBusy(false)
      onBusyChange(false)
    }
  }

  // Panel bindings: child components render the flow without independent copies of its state.
  return {
    options,
    onClose,
    onBack,
    stage,
    setStage,
    serial,
    setSerial,
    registrationState,
    setRegistrationState,
    modelId,
    setModelId,
    assetTag,
    setAssetTag,
    notes,
    setNotes,
    pallet,
    setPallet,
    componentChecks,
    setComponentChecks,
    powerSupplyPresent,
    setPowerSupplyPresent,
    entries,
    editingSerial,
    revision,
    checking,
    busy,
    error,
    acknowledged,
    setAcknowledged,
    scrapDialog,
    finalDialog,
    addButton,
    createButton,
    serialInput,
    expanded,
    resetDraft,
    continueSerial,
    stageDraft,
    editReviewEntry,
    removeReviewEntry,
    cancelScrap,
    confirmScrap,
    reviewBatch,
    cancelFinal,
    submitBatch,
  }
}
export type CreateMinersFlow = ReturnType<typeof useCreateMiners>
