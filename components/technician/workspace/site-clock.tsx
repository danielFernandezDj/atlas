"use client"
/**
 * Keeps the workspace’s Central-time clock current in local display state.
 * The shared site header renders it beside WeatherOutlook; no API or inventory writes occur.
 */

import { siteTimeZone } from "@/lib/weather/sites"
import { Clock3 } from "lucide-react"
import { useEffect, useState } from "react"
const time = new Intl.DateTimeFormat("en-US", {
  timeZone: siteTimeZone,
  hour: "numeric",
  minute: "2-digit",
  second: "2-digit",
  timeZoneName: "short",
})
const date = new Intl.DateTimeFormat("en-US", {
  timeZone: siteTimeZone,
  weekday: "short",
  month: "short",
  day: "numeric",
  year: "numeric",
})
export function SiteClock() {
  const [now, setNow] = useState<Date | null>(null)
  useEffect(() => {
    const update = () => setNow(new Date())
    update()
    const timer = setInterval(update, 1000)
    return () => clearInterval(timer)
  }, [])
  return (
    <div className="atlas-clock">
      <Clock3 size={17} aria-hidden="true" />
      <div>
        <time dateTime={now?.toISOString()}>
          {now ? time.format(now) : "Central Time"}
        </time>
        <p>{now ? date.format(now) : "Loading date…"}</p>
      </div>
    </div>
  )
}
