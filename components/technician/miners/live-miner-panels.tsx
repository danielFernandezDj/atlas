"use client"
/**
 * Renders selected-miner overview, settings and the floating log bar from inventory
 * DTOs. Firmware measurements, settings saves, logs and identification lights remain
 * explicitly unavailable until a real miner provider is connected.
 */

import "@/components/technician/miners/live-miner-panels.css"
import type { InventoryMinerDetail } from "@/lib/miners/inventory-contracts"
import {
  Activity,
  ChevronDown,
  ChevronUp,
  Fan,
  FileText,
  Lightbulb,
  Thermometer,
} from "lucide-react"
import { useState } from "react"

function Readings({ labels }: { labels: string[] }) {
  return (
    <dl className="atlas-readings">
      {labels.map((label) => (
        <div key={label}>
          <dt>{label}</dt>
          <dd>—</dd>
        </div>
      ))}
    </dl>
  )
}

export function LiveMinerOverview({ miner }: { miner: InventoryMinerDetail }) {
  return (
    <div className="atlas-miner-overview">
      <div className="atlas-miner-summary-grid">
        <div className="atlas-miner-instruments">
          <section className="atlas-instrument">
            <h3>
              <Activity size={16} /> Hash rate
            </h3>
            <div className="atlas-instrument-value">
              — <small>TH/s</small>
            </div>
            <span className="atlas-muted">Not connected</span>
          </section>
          <section className="atlas-instrument">
            <h3>
              <Thermometer size={16} /> Temperature
            </h3>
            <div className="atlas-instrument-value">
              — <small>°C</small>
            </div>
            <span className="atlas-muted">Not connected</span>
          </section>
          <section className="atlas-instrument atlas-cooling">
            <h3>
              <Fan size={16} /> Cooling
            </h3>
            <div className="atlas-fan-grid">
              {[1, 2, 3, 4].map((number) => (
                <div key={number}>
                  <span>Fan {number}</span>
                  <strong>
                    — <small>RPM</small>
                  </strong>
                  <div className="atlas-reading-track" />
                </div>
              ))}
            </div>
            <p className="atlas-muted">Mode — · Target — °C · Duty — %</p>
          </section>
        </div>
        <section className="atlas-instrument atlas-miner-identity">
          <h3>Miner information</h3>
          <dl className="atlas-live-miner-fields">
            {[
              ["Serial number", miner.serial],
              ["Model", miner.model],
              ["Location", miner.location?.label],
              ["Miner IP", miner.ip],
              ["Owner", miner.owner],
              ["Managed by", miner.manager],
            ].map(([label, value]) => (
              <div key={label}>
                <dt>{label}</dt>
                <dd>{value ?? "Not recorded"}</dd>
              </div>
            ))}
          </dl>
          <div className="atlas-miner-performance">
            <h3>Performance</h3>
            <Readings
              labels={[
                "Preset",
                "Autoswitch",
                "Power · W",
                "Efficiency · J/TH",
                "PSU",
                "Top preset",
              ]}
            />
          </div>
        </section>
      </div>
      {miner.registration && (
        <section className="atlas-instrument atlas-registration-summary">
          <h3>
            Registered as{" "}
            {miner.registration.state === "READY"
              ? "Ready for installation"
              : "Scrap"}
          </h3>
          <p className="atlas-muted">
            {miner.registration.by} ·{" "}
            {new Date(miner.registration.occurredAt).toLocaleString("en-US", {
              timeZone: "America/Chicago",
            })}{" "}
            CT
          </p>
          {miner.registration.componentConfirmation && (
            <p>
              At registration, the technician acknowledged the skeleton, one
              control board and three hashboards
              {miner.registration.componentConfirmation.powerSupplyPresent
                ? ", with a power supply"
                : ""}
              . This is a presence confirmation; individual component identities
              are recorded separately.
            </p>
          )}
        </section>
      )}
      <div className="atlas-hashboard-grid">
        {[1, 2, 3].map((number) => {
          const board = miner.boards.find(
            (part) => part.position === `SLOT_${number}`
          )
          return (
            <section className="atlas-instrument" key={number}>
              <div className="atlas-board-heading">
                <h3>Board {number}</h3>
                <span>{board ? `#${board.id}` : "Not assigned"}</span>
              </div>
              <Readings
                labels={[
                  "Hash rate · TH/s",
                  "Errors · H/s",
                  "Temperature · °C",
                  "Frequency · MHz",
                  "Voltage · V",
                  "Power · W",
                ]}
              />
              <div className="atlas-reading-track" />
              <p className="atlas-muted">
                {board
                  ? `Serial: ${board.serial ?? "Not recorded"} · ${board.condition.toLowerCase()}`
                  : "No component assigned to this slot"}
              </p>
              <div className="atlas-board-status">
                {board ? "Live status not connected" : "Empty inventory slot"}
              </div>
            </section>
          )
        })}
      </div>
      <details className="atlas-miner-asset-details">
        <summary>Asset and component details</summary>
        <dl className="atlas-live-miner-fields">
          {[
            ["Asset tag", miner.assetTag],
            ["Last API IP", miner.lastApiIp],
            [
              "Control board",
              miner.controlBoard
                ? `#${miner.controlBoard.id} · ${miner.controlBoard.serial ?? "Serial not recorded"} · ${miner.controlBoard.condition.toLowerCase()}`
                : null,
            ],
            ["Control board MAC", miner.controlBoard?.mac],
            ["Firmware", miner.controlBoard?.firmware],
            [
              "Skeleton",
              miner.skeleton
                ? `#${miner.skeleton.id} · ${miner.skeleton.serial ?? "Serial not recorded"} · ${miner.skeleton.condition.toLowerCase()}`
                : null,
            ],
            [
              "Reserved location",
              miner.reservation
                ? `${miner.reservation.location} · ${miner.reservation.switch} / Port ${miner.reservation.port}`
                : null,
            ],
            [
              "Created",
              new Date(miner.createdAt).toLocaleString("en-US", {
                timeZone: "America/Chicago",
              }),
            ],
            [
              "Updated",
              new Date(miner.updatedAt).toLocaleString("en-US", {
                timeZone: "America/Chicago",
              }),
            ],
          ].map(([label, value]) => (
            <div key={label}>
              <dt>{label}</dt>
              <dd>{value ?? "Not recorded"}</dd>
            </div>
          ))}
        </dl>
        <p className="atlas-muted">
          An unassigned board slot does not indicate a hardware fault.
        </p>
      </details>
      <p className="atlas-muted atlas-telemetry-caption">
        Live readings will appear when VNish is connected. Recorded component
        condition is inventory information.
      </p>
    </div>
  )
}

function Setting({
  label,
  unit,
  type = "number",
}: {
  label: string
  unit?: string
  type?: string
}) {
  return (
    <label className="atlas-miner-setting">
      <span>
        {label}
        {unit ? ` (${unit})` : ""}
      </span>
      <input
        type={type}
        disabled
        placeholder="Not reported"
        aria-label={label}
      />
    </label>
  )
}
export function LiveMinerSettings() {
  return (
    <div className="atlas-miner-settings">
      <p className="atlas-inline-notice">
        VNish settings are not connected yet. Current values cannot be read or
        changed here.
      </p>
      <div className="atlas-settings-columns">
        <section className="atlas-instrument">
          <h3>Cooling settings</h3>
          <Setting label="Minimum working fans" />
          <Setting label="Fan speed limit" unit="%" />
          <Setting label="Target temperature" unit="°C" />
        </section>
        <section className="atlas-instrument">
          <h3>Performance settings</h3>
          <div className="atlas-settings-grid">
            <Setting label="Performance preset" type="text" />
            <Setting label="Autoswitch presets" type="text" />
            <Setting label="Raise profile below temperature" unit="°C" />
            <Setting label="Lower profile above temperature" unit="°C" />
            <Setting label="Maximum preset" type="text" />
            <Setting label="Minimum preset" type="text" />
            <Setting label="Condition check duration" unit="minutes" />
            <Setting label="Lower to stable preset on error" type="text" />
          </div>
        </section>
      </div>
      <section className="atlas-instrument">
        <h3>Pool list</h3>
        <p className="atlas-muted">
          Pools are listed by priority. No pool settings have been received from
          VNish.
        </p>
        {[1, 2, 3].map((number) => (
          <fieldset className="atlas-pool-row" key={number} disabled>
            <legend>Pool {number}</legend>
            <Setting label={`Pool ${number} URL`} type="text" />
            <Setting label={`Pool ${number} worker`} type="text" />
          </fieldset>
        ))}
      </section>
    </div>
  )
}
export function MinerLogs() {
  const [open, setOpen] = useState(false)
  return (
    <section className="atlas-miner-logs">
      <div className="atlas-miner-log-bar">
        <h3>
          <FileText size={15} /> Logs
        </h3>
        <span className="atlas-muted atlas-log-device-tools">
          VNish
          <button
            type="button"
            className="atlas-text-button"
            disabled
            title="Connect VNish to flash this miner’s locator light"
            aria-describedby="atlas-locator-status"
          >
            <Lightbulb size={14} />
            Flash light
          </button>
          <span id="atlas-locator-status" className="sr-only">
            Locator light unavailable until VNish is connected.
          </span>
        </span>
        <button
          className="atlas-text-button"
          aria-expanded={open}
          aria-controls="atlas-miner-log-content"
          onClick={() => setOpen((value) => !value)}
        >
          {open ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
          {open ? "Hide" : "Show"}
        </button>
      </div>
      <div id="atlas-miner-log-content" hidden={!open}>
        <p>
          Miner logs are not connected. VNish log output will appear here when
          available.
        </p>
      </div>
    </section>
  )
}
