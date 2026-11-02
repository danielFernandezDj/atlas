// Centers of the user's Plus Code pins, verified with Google's Open Location Code reference.
// Short codes recovered near their named Texas towns; these are the site pins, not town centers.
export const weatherSites = [
  {
    key: "rebel",
    name: "Rebel",
    code: "853WV7W2+9G",
    latitude: 31.8959375,
    longitude: -101.7486875,
  },
  {
    key: "stiles",
    name: "Stiles",
    code: "853WCCJ8+8Q7",
    latitude: 31.4307875,
    longitude: -101.583078125,
  },
  {
    key: "east-stiles",
    name: "East Stiles",
    code: "853WHG6C+H8",
    latitude: 31.5614375,
    longitude: -101.4791875,
  },
  {
    key: "garden-city",
    name: "Garden City",
    code: "853WVG7J+5VR",
    latitude: 31.8629875,
    longitude: -101.467859375,
  },
] as const
export type WeatherSite = (typeof weatherSites)[number]
export const siteTimeZone = "America/Chicago"
export function weatherSiteByName(name: string) {
  return weatherSites.find(
    (site) => site.name.toLowerCase() === name.trim().toLowerCase()
  )
}
export type WeatherDay = {
  date: string
  high: number | null
  low: number | null
  rain: number | null
  wind: number | null
  condition: string
  icon: "storm" | "rain" | "snow" | "cloud" | "sun" | "fog"
  storm: boolean
  detail: string
}
export type SiteForecast = {
  site: string
  updatedAt: string
  fetchedAt: string
  days: WeatherDay[]
  sourceUrl: string
}
