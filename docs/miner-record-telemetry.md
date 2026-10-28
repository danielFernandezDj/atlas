# Miner Records telemetry preview

The existing miner directory and selection workflow still open the native selected-miner dialog. It now contains a persistent Atlas asset summary and Overview, Settings (read-only), and Movement History tabs. The existing move dialog, capability checks, serial copying, timeline markup, occurrence/recording times, and history pagination are retained. History pagination keeps the record mounted rather than resetting the active tab.

## Components and data ownership

- `components/technician/miner-workspace.tsx`: existing selection, inventory reads, history, and movements; passes authoritative Atlas details and the existing timeline to `MinerRecord`.
- `components/technician/miner-record/miner-record.tsx`: record summary, accessible tabs, telemetry read lifecycle, cancellation, preview controls, and unavailable/error states.
- `telemetry-overview.tsx`: summary, cooling, performance, and three board panels.
- `telemetry-settings.tsx`: cooling/performance configuration and multiple pools, rendered only as text. No firmware writes or success simulations.
- `miner-record.css`: feature-scoped responsive styles using Atlas theme tokens; wide desktop dialog, full-screen mobile dialog, persistent summary and separately scrolling content.
- `lib/telemetry/contracts.ts`: lightweight `MinerTelemetryProvider`, telemetry DTOs, null-aware aggregate calculations, and sample temperature presentation bands.
- `lib/demo/miner-telemetry.ts`: deterministic `MockMinerTelemetryProvider` with no HTTP/database calls. It reads an existing miner identity/model and never modifies it or creates assets.

Atlas retains ownership of model, serial, asset tag, ownership, management, physical location, record version, timestamps, and movement history. Telemetry is a separate observation and never inferred from a REPAIR location or a movement reason. Synthetic telemetry remains isolated from Prisma and from site-map occupancy/dashboards.

## Mock behavior

The fixed sample reference is October 28, 2026 at 10:00 AM Central. Captures are explicitly labeled sample timestamps, never Live or recently synced. Model profiles cover S19, S21, and M50; absent/unrecognized models return unavailable instead of guessing. Existing fixture IDs select healthy, degraded, offline, partial, stale, unavailable, not-found, or failure scenarios. The visible **Demo scenario** selector is a presentation/testing control, separate from read-only firmware settings.

ATLAS-1001 defaults to Board 2 failed ASIC detection, with Boards 1 and 3 operational. ATLAS-1002 shows a healthy S21 sample. ATLAS-1003 has no model/telemetry assigned. Remaining existing miners demonstrate other conditions. These scenarios are independent of physical placement; no new inventory is added.

Hashrate and power totals are derived from all three boards. Partial totals remain null, with a separately labeled sum of reporting boards. Efficiency is board watts / total TH/s (J/TH), with null for zero output or incomplete measurements. Temperature is the average of available board maximum temperatures, alongside the highest temperature and board coverage. Warning ≥78 °C and critical ≥85 °C are explicitly sample presentation bands, not validated device policy. Hardware errors are counts, not hashrate. Stopped fans have explicit 0 RPM; missing/unknown fans have null readings. Confirmed offline output may be zero, but unavailable telemetry never manufactures zero output.

The sample minimum fan count is 3 and fan speed limit is 85%. Pools use reserved `.example` addresses and invented worker names. The synthetic firmware and PSU labels are illustrative, not hardware-discovery claims. No external VNish URL is configured; Open in VNish remains disabled with an explanation.

## Replacing the provider

Implement `MinerTelemetryProvider.getTelemetry(miner, signal)` in a future adapter and inject it through the record's `provider` prop. Return the normalized ready/unavailable/not-found/error result, capture/reference timestamps, source, and null readings where data is absent. Exact VNish endpoints, authentication, device identity matching, capabilities, response shapes, units, and deep links remain unverified. Research/validate them before building a real adapter. Network credentials and permission enforcement belong on a server, not in this client view. No future API is fabricated here.

## Validation

TypeScript, scoped ESLint, the existing miner/site-map/management suites, and focused telemetry tests cover numeric consistency, model profiles, null/zero handling, stale/offline states, read cancellation, and no inventory/history mutation. Interactive checks cover serial/asset-tag selection, supported identity/location/custody, existing movement save/version/history refresh, preview scenarios, read-only settings, disabled VNish access, accessible tabs, and desktop/tablet/mobile sizing.
