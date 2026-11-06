"use client"
/**
 * Renders the serial gate and controlled ready/scrap registration form using the
 * useCreateMiners flow. PalletPicker reads pallet options; Add asks the flow to stage
 * the entry (and acknowledge scrap), without creating a miner in the database.
 */

import { RequiredMark } from "../action-fields"
import {
  createEmptyComponentChecks,
  requiredScrapParts,
} from "./creation-model"
import { PalletPicker } from "./pallet-picker"
import type { CreateMinersFlow } from "./use-create-miners"

export function SkeletonSerialForm({ flow }: { flow: CreateMinersFlow }) {
  const { continueSerial, serialInput, serial, setSerial, checking, busy } =
    flow
  return (
    <form className="atlas-action-form" onSubmit={continueSerial}>
      <label>
        <span>
          Skeleton serial number <RequiredMark />
        </span>
        <input
          ref={serialInput}
          required
          value={serial}
          maxLength={200}
          autoComplete="off"
          onChange={(event) => setSerial(event.target.value)}
          disabled={checking || busy}
          placeholder="Scan or enter skeleton serial"
          autoFocus
        />
      </label>
      <p className="atlas-muted">
        Start with the skeleton serial. Next, choose Ready for installation or
        Scrap.
      </p>
      <button
        className="atlas-action-primary"
        disabled={checking || busy || !serial.trim()}
      >
        {checking ? "Checking…" : "Continue"}
      </button>
    </form>
  )
}
export function CreationDraftForm({ flow }: { flow: CreateMinersFlow }) {
  const {
    stageDraft,
    busy,
    checking,
    entries,
    editingSerial,
    serial,
    setStage,
    options,
    registrationState,
    setRegistrationState,
    setPallet,
    setComponentChecks,
    setPowerSupplyPresent,
    modelId,
    setModelId,
    assetTag,
    setAssetTag,
    revision,
    pallet,
    componentChecks,
    powerSupplyPresent,
    notes,
    setNotes,
    addButton,
  } = flow
  return (
    <form className="atlas-action-form" onSubmit={stageDraft}>
      <fieldset
        disabled={
          busy || checking || (entries.length >= 25 && editingSerial === null)
        }
      >
        <div className="atlas-action-miner">
          <strong>Skeleton · {serial}</strong>
          <button
            type="button"
            className="atlas-text-button"
            onClick={() => setStage("serial")}
          >
            Change skeleton serial
          </button>
        </div>
        <div className="atlas-action-fixed-companies">
          <span>
            Owner ·{" "}
            <strong>
              {options.assignment?.owner.name ?? "Ionic (not configured)"}
            </strong>
          </span>
          <span>
            Management ·{" "}
            <strong>
              {options.assignment?.manager.name ??
                "DigitalCarpenter.io (not configured)"}
            </strong>
          </span>
        </div>
        <fieldset className="atlas-creation-state-choice">
          <legend>
            Registration state <RequiredMark />
          </legend>
          {(
            [
              [
                "READY",
                "Ready for installation",
                "Register this miner without assigning a location.",
              ],
              [
                "SCRAP",
                "Scrap",
                "Assign a pallet and confirm the required components.",
              ],
            ] as const
          ).map(([value, label, description]) => (
            <label
              key={value}
              data-selected={registrationState === value || undefined}
            >
              <input
                type="radio"
                name="registration-state"
                required
                value={value}
                checked={registrationState === value}
                onChange={() => {
                  setRegistrationState(value)
                  setPallet(null)
                  setComponentChecks(createEmptyComponentChecks())
                  setPowerSupplyPresent(false)
                }}
              />
              <span>
                <strong>{label}</strong>
                <small>{description}</small>
              </span>
            </label>
          ))}
        </fieldset>
        <div className="atlas-action-fields">
          <label>
            Miner model
            <select
              value={modelId ?? ""}
              onChange={(event) =>
                setModelId(
                  event.target.value ? Number(event.target.value) : null
                )
              }
            >
              <option value="">Not recorded</option>
              {options.models.map((model) => (
                <option key={model.id} value={model.id}>
                  {model.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            Asset tag
            <input
              maxLength={200}
              value={assetTag}
              onChange={(event) => setAssetTag(event.target.value)}
            />
          </label>
        </div>
        {registrationState === "SCRAP" && (
          <>
            <PalletPicker
              key={`pallet-${revision}`}
              options={options}
              selected={pallet}
              onSelect={setPallet}
            />
            <fieldset className="atlas-scrap-checklist">
              <legend>
                Physically confirmed components <RequiredMark />
              </legend>
              <p className="atlas-muted">
                Check each part after inspecting this miner. These confirmations
                record presence; they do not create component serial numbers or
                MAC addresses.
              </p>
              {requiredScrapParts.map(([key, label]) => (
                <label key={key}>
                  <input
                    type="checkbox"
                    required
                    checked={componentChecks[key]}
                    onChange={(event) =>
                      setComponentChecks({
                        ...componentChecks,
                        [key]: event.target.checked,
                      })
                    }
                  />
                  <span>
                    {label} <RequiredMark />
                  </span>
                </label>
              ))}
              <label>
                <input
                  type="checkbox"
                  checked={powerSupplyPresent}
                  onChange={(event) =>
                    setPowerSupplyPresent(event.target.checked)
                  }
                />
                <span>Power supply included (optional)</span>
              </label>
            </fieldset>
          </>
        )}
        {registrationState === "READY" && (
          <p className="atlas-muted">
            This records your readiness assessment. Deployment ports are
            assigned later through Insert miners.
          </p>
        )}
        <label>
          Notes (optional)
          <textarea
            rows={2}
            maxLength={2000}
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
          />
        </label>
        <button
          ref={addButton}
          className="atlas-action-primary"
          disabled={
            !options.assignment ||
            !registrationState ||
            (registrationState === "SCRAP" &&
              (!pallet ||
                requiredScrapParts.some(([key]) => !componentChecks[key])))
          }
        >
          {editingSerial ? "Update miner in list" : "Add miner"}
        </button>
      </fieldset>
    </form>
  )
}
