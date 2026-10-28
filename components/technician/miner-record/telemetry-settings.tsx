import { Fan, Gauge, LockKeyhole, Network } from "lucide-react"
import type { MinerTelemetry } from "@/lib/telemetry/contracts"
import { Fields, presetLabel } from "./telemetry-overview"

export function TelemetrySettings({
  telemetry,
}: {
  telemetry: MinerTelemetry
}) {
  const { cooling, performance, pools } = telemetry.settings
  return (
    <div className="atlas-telemetry-settings">
      <p className="atlas-record-readonly">
        <LockKeyhole size={14} />
        Read-only simulated configuration. No changes can be sent to firmware,
        fans, power, or pools.
      </p>
      <div className="atlas-settings-grid">
        <article className="atlas-card atlas-settings-card">
          <h3>
            <Fan size={16} />
            Cooling settings
          </h3>
          <Fields
            items={[
              ["Minimum operational fans", `${cooling.minimumFans} fans`],
              ["Fan speed limit", `${cooling.speedLimitPercent}%`],
              ["Target temperature", `${cooling.targetC} °C`],
              ["Cooling mode", cooling.mode],
            ]}
          />
        </article>
        <article className="atlas-card atlas-settings-card">
          <h3>
            <Gauge size={16} />
            Performance settings
          </h3>
          <Fields
            items={[
              ["Current preset", presetLabel(performance.preset)],
              [
                "Autoswitch presets",
                performance.autoswitch ? "Enabled" : "Disabled",
              ],
              ["Raise profile below", `${performance.raiseBelowC} °C`],
              ["Lower profile above", `${performance.lowerAboveC} °C`],
              [
                "Maximum permitted preset",
                presetLabel(performance.maximumPreset),
              ],
              [
                "Minimum permitted preset",
                presetLabel(performance.minimumPreset),
              ],
              [
                "Condition-check duration",
                `${performance.conditionMinutes} minutes`,
              ],
              [
                "Lower top preset on error",
                performance.lowerTopPresetOnError ? "Enabled" : "Disabled",
              ],
            ]}
          />
        </article>
      </div>
      <article className="atlas-card atlas-settings-card">
        <h3>
          <Network size={16} />
          Mining pools
        </h3>
        <p className="atlas-pool-note">
          Synthetic pool addresses and workers. Priority indicates configured
          order.
        </p>
        <div className="atlas-pool-list">
          {pools.map((pool) => (
            <div key={pool.priority}>
              <span className="atlas-pool-priority">
                {String(pool.priority).padStart(2, "0")}
              </span>
              <dl>
                <div>
                  <dt>Pool URL</dt>
                  <dd>{pool.url}</dd>
                </div>
                <div>
                  <dt>Worker</dt>
                  <dd>{pool.worker}</dd>
                </div>
              </dl>
              <span className="atlas-chip">{pool.status}</span>
            </div>
          ))}
        </div>
      </article>
    </div>
  )
}
