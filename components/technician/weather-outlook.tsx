import {
  Cloud,
  CloudLightning,
  CloudRain,
  Droplets,
  Sun,
  Wind,
} from "lucide-react"
import { type SiteId, siteName } from "@/lib/demo/technician"

// Illustrative forecasts until real site locations and a weather feed are configured.
type Forecast = {
  condition: "Clear" | "Cloudy" | "Showers" | "High wind" | "Storms"
  rain: number
  gusts: number
}
const forecasts: Record<SiteId, Forecast[]> = {
  north: [
    { condition: "Showers", rain: 70, gusts: 18 },
    { condition: "High wind", rain: 20, gusts: 38 },
    { condition: "Storms", rain: 85, gusts: 42 },
  ],
  south: [
    { condition: "Clear", rain: 5, gusts: 12 },
    { condition: "Cloudy", rain: 15, gusts: 17 },
    { condition: "Showers", rain: 65, gusts: 24 },
  ],
  east: [
    { condition: "Cloudy", rain: 20, gusts: 14 },
    { condition: "Showers", rain: 75, gusts: 22 },
    { condition: "Clear", rain: 10, gusts: 13 },
  ],
  west: [
    { condition: "High wind", rain: 10, gusts: 36 },
    { condition: "Clear", rain: 5, gusts: 16 },
    { condition: "Cloudy", rain: 25, gusts: 19 },
  ],
}
const icons = {
  Clear: Sun,
  Cloudy: Cloud,
  Showers: CloudRain,
  "High wind": Wind,
  Storms: CloudLightning,
}
const days = ["Today", "Tomorrow", "Day after"]

export function WeatherOutlook({ siteId }: { siteId: SiteId }) {
  return (
    <section
      className="atlas-weather"
      aria-label={`${siteName(siteId)} three-day demo weather forecast`}
    >
      <div className="atlas-weather-heading">
        <h2>3-day outlook</h2>
        <span>Demo forecast · not live</span>
      </div>
      <ol className="atlas-weather-days">
        {forecasts[siteId].map((forecast, index) => {
          const Icon = icons[forecast.condition]
          const caution =
            forecast.condition === "High wind" ||
            forecast.condition === "Storms"
          return (
            <li
              key={days[index]}
              className={caution ? "atlas-weather-caution" : ""}
            >
              <div className="atlas-weather-condition">
                <Icon size={18} aria-hidden="true" />
                <div>
                  <h3>{days[index]}</h3>
                  <p>{forecast.condition}</p>
                </div>
              </div>
              <p className="atlas-weather-details">
                <span aria-label={`${forecast.rain}% chance of rain`}>
                  <Droplets size={10} aria-hidden="true" />
                  {forecast.rain}%
                </span>
                <span
                  aria-label={`Wind gusts ${forecast.gusts} miles per hour`}
                >
                  Gusts {forecast.gusts} mph
                </span>
              </p>
            </li>
          )
        })}
      </ol>
    </section>
  )
}
