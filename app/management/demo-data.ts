/** MANAGEMENT DEMO ONLY. No production miner types, telemetry integration, or detection rules. */
export const SNAPSHOT_AT = "2026-10-27T14:00:00.000Z"
const dayMs = 86400000
export const demoSites = [
  {
    id: "garden-city",
    name: "Garden City",
    code: "GC",
    total: 12800,
    unmatched: 64,
  },
  { id: "rebel", name: "Rebel", code: "RB", total: 10600, unmatched: 52 },
  {
    id: "east-stiles",
    name: "East Stiles",
    code: "ES",
    total: 9400,
    unmatched: 41,
  },
  { id: "stiles", name: "Stiles", code: "ST", total: 8000, unmatched: 36 },
] as const
export type SiteId = (typeof demoSites)[number]["id"]
export type SiteFilter = SiteId | "all"
export const statuses = [
  { id: "hashing", label: "Hashing", color: "#36a77e" },
  { id: "not-hashing", label: "Not Hashing", color: "#dfa54a" },
  { id: "offline", label: "Offline", color: "#dd737b" },
  { id: "repair", label: "In Repair", color: "#7d8ec8" },
  { id: "storage", label: "In Storage", color: "#77a7b3" },
  { id: "retired", label: "Retired", color: "#8c919a" },
  { id: "unaccounted", label: "Unaccounted", color: "#ad87b6" },
] as const
export type Status = (typeof statuses)[number]["id"]
export const issueCategories = [
  {
    id: "no-rack",
    label: "Deployed with no rack location",
    group: "movement",
    explanation:
      "The deployment record is missing a rack location, so the physical placement needs verification.",
    movement: "Deployment logged; rack coordinates were not supplied.",
    telemetry: "Sample Foreman observation shows deployed.",
  },
  {
    id: "stale-rack",
    label: "Not deployed, but rack location remains",
    group: "movement",
    explanation:
      "A rack location remains on the movement record although the sample telemetry does not show deployment.",
    movement: "Rack location retained on the current movement record.",
    telemetry: "Sample Foreman observation does not show deployed.",
  },
  {
    id: "racked-not-deployed",
    label: "Racked in log, not deployed in telemetry",
    group: "movement",
    explanation:
      "The movement log and the sample deployment observation disagree.",
    movement: "Latest movement places this asset in a deployment slot.",
    telemetry: "Sample Foreman observation does not show deployed.",
  },
  {
    id: "racked-no-link",
    label: "Racked with no Foreman link",
    group: "movement",
    explanation:
      "The movement log places this asset on a rack, but no telemetry association is available.",
    movement: "Latest movement places this asset in a deployment slot.",
    telemetry: "No Foreman association is present in this sample.",
  },
  {
    id: "pulled-still-deployed",
    label: "Pulled in log, still deployed in telemetry",
    group: "movement",
    explanation:
      "A pull was logged, while the sample telemetry continues to show deployment.",
    movement: "Latest movement records removal from a deployment slot.",
    telemetry: "Sample Foreman observation still shows deployed.",
  },
  {
    id: "unlogged-pull",
    label: "Off rack without a movement entry",
    group: "movement",
    explanation:
      "The sample rack observation changed without a matching movement entry.",
    movement:
      "No matching pull entry is present in the sample movement history.",
    telemetry: "Sample deployment observation changed to off rack.",
  },
  {
    id: "old-movement",
    label: "Movement predates confirmed deployment",
    group: "movement",
    explanation:
      "The movement record is older than the most recent confirmed deployment observation.",
    movement: "Most recent movement: Oct 20, 2026, 10:00 AM CT.",
    telemetry: "Sample deployment confirmation: Oct 24, 2026, 2:00 PM CT.",
  },
  {
    id: "never-linked",
    label: "Never linked to telemetry",
    group: "telemetry",
    explanation:
      "This registered asset has no telemetry link in the sample reconciliation history.",
    movement: "An asset registry and movement-log reference exist.",
    telemetry: "No current or previous link in the sample.",
  },
  {
    id: "link-lost",
    label: "Telemetry link lost",
    group: "telemetry",
    explanation:
      "This asset previously had a link, but the sample reporting association has been lost.",
    movement: "The physical movement record remains available.",
    telemetry:
      "Previously linked; no longer reporting through that association.",
  },
  {
    id: "serial-check",
    label: "Serial needs verification or rescan",
    group: "identity",
    explanation:
      "A sample scan failed the expected identifier format and needs human verification.",
    movement: "A sample scanned identifier was flagged for verification.",
    telemetry: "No identity correction has been applied.",
  },
  {
    id: "serial-collision",
    label: "Foreman-reported serial collision",
    group: "identity",
    explanation:
      "Two sample telemetry references claim the same identifier; the association is ambiguous.",
    movement: "One registry reference is present in the sample movement log.",
    telemetry: "Two sample Foreman references claim the same identifier.",
  },
  {
    id: "duplicate-scan",
    label: "Duplicate scan in a batch",
    group: "identity",
    explanation:
      "The same synthetic asset was scanned twice in one sample intake batch.",
    movement: "Two sample scan entries appear in the same batch.",
    telemetry: "No telemetry state has been inferred from the duplicate scan.",
  },
  {
    id: "registry-missing",
    label: "Movement serial absent from registry",
    group: "movement",
    explanation:
      "A sample movement-log identifier has no matching tracked asset. This finding is not counted as a flagged registered asset.",
    movement: "A sample movement entry exists without a registry match.",
    telemetry:
      "No registered-asset association can be established from this sample.",
  },
] as const
export type CategoryId = (typeof issueCategories)[number]["id"]
export type DemoAsset = {
  id: string
  siteId: SiteId
  telemetry: "linked" | "lost" | "never"
  status: Status | null
  lastMovementAt: string
}
export type DemoIssue = {
  id: string
  assetId: string | null
  identifier: string
  siteId: SiteId
  category: CategoryId
  recordedBy: string
  observedAt: string
}
export type StatusCounts = Record<Status, number>
export type HistoryPoint = {
  at: string
  counts: StatusCounts
  linked: number
  hashing: number
  other: number
}
const zeroCounts = (): StatusCounts => ({
  hashing: 0,
  "not-hashing": 0,
  offline: 0,
  repair: 0,
  storage: 0,
  retired: 0,
  unaccounted: 0,
})
export const assets: DemoAsset[] = demoSites.flatMap((site, siteIndex) =>
  Array.from({ length: site.total }, (_, index) => {
    const roll = (index * 37 + siteIndex * 31) % 1000,
      statusRoll = (index * 71 + siteIndex * 29) % 1000
    const neverBelow = [50, 90, 70, 110][siteIndex]
    const lostBelow = [80, 150, 110, 180][siteIndex]
    const hashingBelow = [790, 720, 765, 735][siteIndex]
    const otherShare = (statusRoll - hashingBelow) / (1000 - hashingBelow)
    const telemetry =
      roll < neverBelow ? "never" : roll < lostBelow ? "lost" : "linked"
    const status: Status =
      statusRoll < hashingBelow
        ? "hashing"
        : otherShare < 0.25
          ? "not-hashing"
          : otherShare < 0.5
            ? "offline"
            : otherShare < 0.69
              ? "repair"
              : otherShare < 0.86
                ? "storage"
                : otherShare < 0.94
                  ? "retired"
                  : "unaccounted"
    return {
      id: `DEMO-${site.code}-${String(index + 1).padStart(5, "0")}`,
      siteId: site.id,
      telemetry,
      status: telemetry === "linked" ? status : null,
      lastMovementAt: new Date(
        Date.parse(SNAPSHOT_AT) - ((index * 13 + siteIndex * 3) % 31) * dayMs
      ).toISOString(),
    }
  })
)
// These are deliberately authored sample findings, not rules that inspect live operational data.
export const issues: DemoIssue[] = demoSites.flatMap((site, siteIndex) => {
  const siteAssets = assets.filter((asset) => asset.siteId === site.id)
  const findings = siteAssets.flatMap((asset, index): DemoIssue[] => {
    if ((index * 17 + siteIndex * 13) % 1000 >= [35, 68, 45, 57][siteIndex])
      return []
    const linkedChoices: CategoryId[] = [
      "no-rack",
      "stale-rack",
      "racked-not-deployed",
      "pulled-still-deployed",
      "unlogged-pull",
      "old-movement",
      "serial-check",
      "serial-collision",
      "duplicate-scan",
    ]
    const category: CategoryId =
      asset.telemetry === "never"
        ? index % 2
          ? "never-linked"
          : "racked-no-link"
        : asset.telemetry === "lost"
          ? "link-lost"
          : linkedChoices[(index + siteIndex) % linkedChoices.length]
    const base = {
      assetId: asset.id,
      identifier: asset.id,
      siteId: site.id,
      recordedBy: ["Casey Rowan", "Morgan Ellis", "Riley Shaw"][index % 3],
      observedAt: SNAPSHOT_AT,
    }
    const result: DemoIssue[] = [
      { ...base, id: `FINDING-${site.code}-${index + 1}-A`, category },
    ]
    if (index % 4 === 0 && category !== "duplicate-scan")
      result.push({
        ...base,
        id: `FINDING-${site.code}-${index + 1}-B`,
        category: "duplicate-scan",
      })
    return result
  })
  for (let index = 0; index < 8; index++)
    findings.push({
      id: `FINDING-${site.code}-UNREGISTERED-${index + 1}`,
      assetId: null,
      identifier: `DEMO-LOG-${site.code}-${String(index + 1).padStart(3, "0")}`,
      siteId: site.id,
      category: "registry-missing",
      recordedBy: "Casey Rowan",
      observedAt: SNAPSHOT_AT,
    })
  return findings
})
export const unmatchedTelemetry = demoSites.flatMap((site) =>
  Array.from({ length: site.unmatched }, (_, index) => ({
    id: `DEMO-TEL-${site.code}-${String(index + 1).padStart(3, "0")}`,
    siteId: site.id,
  }))
)
export const siteName = (id: SiteId) =>
  demoSites.find((site) => site.id === id)!.name
export const categoryInfo = (id: CategoryId) =>
  issueCategories.find((category) => category.id === id)!
export const percent = (part: number, total: number) =>
  total > 0 ? (part / total) * 100 : 0
export const formatNumber = (value: number) =>
  new Intl.NumberFormat("en-US").format(value)
export const formatDate = (at: string) =>
  new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "America/Chicago",
  }).format(new Date(at))
export function summarize(scope: SiteFilter) {
  const scopedAssets =
    scope === "all" ? assets : assets.filter((asset) => asset.siteId === scope)
  const scopedIssues =
    scope === "all" ? issues : issues.filter((issue) => issue.siteId === scope)
  const counts = zeroCounts()
  for (const asset of scopedAssets) if (asset.status) counts[asset.status]++
  const linked = scopedAssets.filter(
    (asset) => asset.telemetry === "linked"
  ).length
  return {
    total: scopedAssets.length,
    linked,
    counts,
    hashing: counts.hashing,
    lost: scopedAssets.filter((asset) => asset.telemetry === "lost").length,
    never: scopedAssets.filter((asset) => asset.telemetry === "never").length,
    unlinkedTelemetry: unmatchedTelemetry.filter(
      (record) => scope === "all" || record.siteId === scope
    ).length,
    flagged: new Set(
      scopedIssues.flatMap((issue) => (issue.assetId ? [issue.assetId] : []))
    ).size,
    recent: scopedAssets.filter(
      (asset) =>
        Date.parse(asset.lastMovementAt) >
          Date.parse(SNAPSHOT_AT) - 7 * dayMs &&
        Date.parse(asset.lastMovementAt) <= Date.parse(SNAPSHOT_AT)
    ).length,
    findings: scopedIssues.length,
    movementIssues: scopedIssues.filter(
      (issue) => categoryInfo(issue.category).group === "movement"
    ).length,
    scopedIssues,
    categoryCounts: issueCategories.map((category) => ({
      ...category,
      count: scopedIssues.filter((issue) => issue.category === category.id)
        .length,
    })),
  }
}
// Thirty deterministic daily snapshots for a fixed cohort: the assets linked at the sample snapshot.
export const siteHistory: Record<SiteId, HistoryPoint[]> = Object.fromEntries(
  demoSites.map((site, siteIndex) => {
    const summary = summarize(site.id)
    return [
      site.id,
      Array.from({ length: 30 }, (_, day) => {
        const counts = { ...summary.counts },
          daysBefore = 29 - day
        const hashingDeficit = Math.round(
          summary.hashing * daysBefore * (0.0018 + siteIndex * 0.00015)
        )
        counts.hashing -= hashingDeficit
        counts.offline += Math.round(hashingDeficit * 0.55)
        counts["not-hashing"] +=
          hashingDeficit - Math.round(hashingDeficit * 0.55)
        return {
          at: new Date(
            Date.parse(SNAPSHOT_AT) - daysBefore * dayMs
          ).toISOString(),
          counts,
          linked: summary.linked,
          hashing: counts.hashing,
          other: summary.linked - counts.hashing,
        }
      }),
    ]
  })
) as Record<SiteId, HistoryPoint[]>
export function historyFor(scope: SiteFilter, days: 7 | 30): HistoryPoint[] {
  if (scope !== "all") return siteHistory[scope].slice(-days)
  return Array.from({ length: 30 }, (_, day) => {
    const points = demoSites.map((site) => siteHistory[site.id][day]),
      counts = zeroCounts()
    for (const point of points)
      for (const status of statuses)
        counts[status.id] += point.counts[status.id]
    return {
      at: points[0].at,
      counts,
      linked: points.reduce((sum, point) => sum + point.linked, 0),
      hashing: counts.hashing,
      other: points.reduce((sum, point) => sum + point.other, 0),
    }
  }).slice(-days)
}
export const siteSummaries = demoSites.map((site) => ({
  ...site,
  ...summarize(site.id),
}))
