"use client"

import { useEffect, useState } from "react"
import {
  Cloud,
  CloudFog,
  CloudLightning,
  CloudRain,
  CloudSnow,
  Droplets,
  RefreshCw,
  Sun,
  Wind,
} from "lucide-react"
import { weatherSiteByName, type SiteForecast } from "@/lib/weather/sites"
const icons = {
  storm: CloudLightning,
  rain: CloudRain,
  snow: CloudSnow,
  cloud: Cloud,
  sun: Sun,
  fog: CloudFog,
}
export function WeatherOutlook({
  siteName,
  refreshKey,
}: {
  siteName: string
  refreshKey: string
}) {
  const site = weatherSiteByName(siteName)
  const [forecast, setForecast] = useState<SiteForecast | null>(null)
  const [failed, setFailed] = useState(false)
  const [retry, setRetry] = useState(0)
  useEffect(() => {
    if (!site) return
    const controller = new AbortController()
    async function load() {
      try {
        const response = await fetch(`/api/weather?site=${site!.key}`, {
          signal: controller.signal,
          cache: "no-store",
        })
        if (!response.ok) throw new Error("Unavailable")
        const result: SiteForecast = await response.json()
        if (!controller.signal.aborted) {
          setForecast(result)
          setFailed(false)
        }
      } catch {
        if (!controller.signal.aborted) setFailed(true)
      }
    }
    void load()
    const timer = setInterval(load, 15 * 60000)
    return () => {
      controller.abort()
      clearInterval(timer)
    }
  }, [site, retry, refreshKey])
  const current = forecast?.site === site?.key ? forecast : null
  return (
    <section
      className="atlas-weather"
      aria-label={`${siteName} weather forecast`}
    >
      <div className="atlas-weather-heading">
        <h2>
          <span className="atlas-weather-compact-label">3-day</span>
          <span className="atlas-weather-wide-label">7-day</span> outlook ·{" "}
          {siteName}
        </h2>
        {current && !failed && (
          <a
            href={current.sourceUrl}
            target="_blank"
            rel="noreferrer"
            title={`National Weather Service · Updated ${new Date(current.updatedAt).toLocaleString("en-US", { timeZone: "America/Chicago" })} CT`}
          >
            National Weather Service ↗
          </a>
        )}
      </div>
      {!site ? (
        <p className="atlas-weather-status">Weather location not configured.</p>
      ) : failed ? (
        <div className="atlas-weather-status" role="status">
          <span>Weather unavailable</span>
          <button
            onClick={() => {
              setFailed(false)
              setRetry((value) => value + 1)
            }}
            className="atlas-text-button"
          >
            <RefreshCw size={12} />
            Retry
          </button>
        </div>
      ) : !current ? (
        <p className="atlas-weather-status" role="status">
          Loading site forecast…
        </p>
      ) : (
        <ol className="atlas-weather-days">
          {current.days.map((day, index) => {
            const Icon = icons[day.icon]
            const label =
              index === 0
                ? "Today"
                : new Intl.DateTimeFormat("en-US", {
                    weekday: "short",
                    timeZone: "America/Chicago",
                  }).format(new Date(`${day.date}T12:00:00Z`))
            return (
              <li
                key={day.date}
                className={day.storm ? "atlas-weather-caution" : ""}
                title={day.detail}
              >
                <div className="atlas-weather-condition">
                  <Icon size={18} aria-hidden="true" />
                  <div>
                    <h3>
                      <time dateTime={day.date}>{label}</time> ·{" "}
                      {day.high === null ? "—" : Math.round(day.high)}° /{" "}
                      {day.low === null ? "—" : Math.round(day.low)}°F
                    </h3>
                    <p>{day.condition}</p>
                  </div>
                </div>
                <p className="atlas-weather-details">
                  <span
                    aria-label={
                      day.rain === null
                        ? "Precipitation probability unavailable"
                        : `${day.rain}% chance of precipitation`
                    }
                  >
                    <Droplets size={10} aria-hidden="true" />
                    {day.rain === null ? "—" : `${Math.round(day.rain)}%`}
                  </span>
                  <span
                    aria-label={
                      day.wind === null
                        ? "Wind unavailable"
                        : `Maximum forecast wind ${day.wind} miles per hour`
                    }
                  >
                    <Wind size={10} aria-hidden="true" />
                    {day.wind === null ? "—" : `${Math.round(day.wind)} mph`}
                  </span>
                </p>
              </li>
            )
          })}
        </ol>
      )}
    </section>
  )
}
