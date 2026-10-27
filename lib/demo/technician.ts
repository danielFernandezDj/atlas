// Synthetic operational snapshots. These are UI fixtures, not production permissions or telemetry.
export const demoTechnician = "Alex Morgan"
export const demoSites = [
  {
    id: "north",
    name: "North Site",
    code: "NTH",
    installed: 5380,
    healthy: 5100,
    warning: 137,
    danger: 143,
    empty: 220,
    current: 566780,
    daily: 558920,
    min: 520400,
    max: 594200,
    temperatureOffset: 0,
  },
  {
    id: "south",
    name: "South Site",
    code: "STH",
    installed: 4120,
    healthy: 3856,
    warning: 176,
    danger: 88,
    empty: 180,
    current: 439620,
    daily: 431500,
    min: 405200,
    max: 466700,
    temperatureOffset: 2,
  },
  {
    id: "east",
    name: "East Site",
    code: "EST",
    installed: 2860,
    healthy: 2714,
    warning: 105,
    danger: 41,
    empty: 140,
    current: 311740,
    daily: 307820,
    min: 281900,
    max: 329400,
    temperatureOffset: -1,
  },
  {
    id: "west",
    name: "West Site",
    code: "WST",
    installed: 3640,
    healthy: 3380,
    warning: 164,
    danger: 96,
    empty: 160,
    current: 388560,
    daily: 382610,
    min: 352300,
    max: 411800,
    temperatureOffset: 1,
  },
] as const
export type SiteId = (typeof demoSites)[number]["id"]
export type DemoSite = (typeof demoSites)[number]
export type DemoMovement = {
  id: string
  serial: string
  fromSiteId: SiteId
  toSiteId: SiteId
  from: string
  to: string
  reason: string
  at: string
  by: string
}
export const siteName = (siteId: SiteId) =>
  demoSites.find((site) => site.id === siteId)!.name
export const number = (value: number) =>
  new Intl.NumberFormat("en-US").format(value)
export const percent = (part: number, total: number) =>
  Math.round((part / total) * 100)
export const movementTime = (at: string) =>
  new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "America/Chicago",
  }).format(new Date(at))
export function buildingTemperatures(site: DemoSite, building: number) {
  return [32, 34, 33, 35, 36, 34, 37, 33, 35, 34].map(
    (value, index) =>
      value +
      site.temperatureOffset +
      (building === 2 ? (index % 3 === 0 ? 3 : 1) : 0)
  )
}
