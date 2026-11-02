import {
  siteTimeZone,
  type WeatherSite,
  type SiteForecast,
  type WeatherDay,
} from "./sites"

const dateFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: siteTimeZone,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
})
export function siteDate(value: Date) {
  const parts = dateFormatter.formatToParts(value)
  const part = (type: string) => parts.find((p) => p.type === type)!.value
  return `${part("year")}-${part("month")}-${part("day")}`
}
const finite = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value)
type Period = {
  startTime: string
  endTime: string
  isDaytime: boolean
  temperature: number
  temperatureUnit: string
  shortForecast: string
  detailedForecast: string
  windSpeed: string
  probabilityOfPrecipitation: { value: number | null }
}
function isPeriod(value: unknown): value is Period {
  if (!value || typeof value !== "object") return false
  const p = value as Period
  return (
    [p.startTime, p.endTime].every(
      (v) => typeof v === "string" && Number.isFinite(Date.parse(v))
    ) &&
    typeof p.isDaytime === "boolean" &&
    finite(p.temperature) &&
    p.temperatureUnit === "F" &&
    typeof p.shortForecast === "string" &&
    typeof p.detailedForecast === "string" &&
    typeof p.windSpeed === "string"
  )
}
export function parseForecast(
  raw: unknown,
  site: WeatherSite,
  now = new Date()
): SiteForecast {
  const data = raw as {
    properties?: { updateTime?: string; periods?: unknown[] }
  }
  const updatedAt = data?.properties?.updateTime
  if (
    !updatedAt ||
    !Number.isFinite(Date.parse(updatedAt)) ||
    now.getTime() - Date.parse(updatedAt) > 24 * 3600000 ||
    Date.parse(updatedAt) > now.getTime() + 600000
  )
    throw new Error("Stale forecast")
  const periods = data?.properties?.periods
  if (!Array.isArray(periods) || !periods.length || !periods.every(isPeriod))
    throw new Error("Invalid forecast")
  const today = siteDate(now)
  const days: WeatherDay[] = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(`${today}T12:00:00Z`)
    date.setUTCDate(date.getUTCDate() + index)
    const key = date.toISOString().slice(0, 10)
    const relevant = periods.filter((p) => {
      if (Date.parse(p.endTime) <= now.getTime()) return false
      const start = siteDate(new Date(p.startTime))
      return (
        start === key ||
        (index === 0 &&
          start < today &&
          Date.parse(p.startTime) <= now.getTime())
      )
    })
    if (!relevant.length) throw new Error("Incomplete forecast")
    const primary = relevant.find((p) => p.isDaytime) ?? relevant[0]
    const storm = relevant.some((p) => /thunder|tornado/i.test(p.shortForecast))
    const text = primary.shortForecast
    const icon: WeatherDay["icon"] = storm
      ? "storm"
      : /snow|sleet|ice|freezing/i.test(text)
        ? "snow"
        : /rain|shower|drizzle/i.test(text)
          ? "rain"
          : /fog|haze|smoke/i.test(text)
            ? "fog"
            : /cloud|overcast/i.test(text)
              ? "cloud"
              : "sun"
    const temps = (day: boolean) =>
      relevant.filter((p) => p.isDaytime === day).map((p) => p.temperature)
    const rain = relevant
      .map((p) => p.probabilityOfPrecipitation?.value)
      .filter(finite)
      .filter((p) => p >= 0 && p <= 100)
    const winds = relevant.flatMap((p) =>
      /mph/i.test(p.windSpeed)
        ? (p.windSpeed.match(/\d+(?:\.\d+)?/g) ?? []).map(Number)
        : []
    )
    return {
      date: key,
      high: temps(true).length ? Math.max(...temps(true)) : null,
      low: temps(false).length ? Math.min(...temps(false)) : null,
      rain: rain.length ? Math.max(...rain) : null,
      wind: winds.length ? Math.max(...winds) : null,
      storm,
      icon,
      condition: storm ? "Storm chance" : text,
      detail: relevant.map((p) => p.detailedForecast).join(" "),
    }
  })
  return {
    site: site.key,
    updatedAt,
    fetchedAt: now.toISOString(),
    days,
    sourceUrl: `https://forecast.weather.gov/MapClick.php?lat=${site.latitude}&lon=${site.longitude}`,
  }
}
export async function readSiteForecast(
  site: WeatherSite,
  fetcher: typeof fetch = fetch,
  now = new Date()
) {
  const options = (seconds: number) => ({
    headers: {
      "User-Agent": "Atlas-Site-Weather/1.0",
      Accept: "application/geo+json",
    },
    next: { revalidate: seconds },
    signal: AbortSignal.timeout(12000),
  })
  const point = await fetcher(
    `https://api.weather.gov/points/${site.latitude.toFixed(4)},${site.longitude.toFixed(4)}`,
    options(86400)
  )
  if (!point.ok) throw new Error("Weather location unavailable")
  const metadata = await point.json()
  const url = new URL(metadata?.properties?.forecast)
  if (
    url.origin !== "https://api.weather.gov" ||
    !/^\/gridpoints\/[A-Z]+\/\d+,\d+\/forecast$/.test(url.pathname) ||
    url.search
  )
    throw new Error("Invalid forecast endpoint")
  const response = await fetcher(url.toString(), options(900))
  if (!response.ok) throw new Error("Weather unavailable")
  return parseForecast(await response.json(), site, now)
}
