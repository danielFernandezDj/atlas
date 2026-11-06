/**
 * Serves forecasts for the fixed site pins in lib/weather/sites.ts.
 * workspace/weather-outlook.tsx calls this route; lib/weather/forecast.ts reads and
 * normalizes weather-service responses without changing inventory.
 */
import { weatherSites } from "@/lib/weather/sites"
import { readSiteForecast } from "@/lib/weather/forecast"

// Fixed, user-supplied site pins only. No arbitrary coordinates or upstream URLs.
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams
  const site = weatherSites.find((site) => site.key === params.get("site"))
  if (!site || params.getAll("site").length !== 1)
    return Response.json(
      { message: "Choose a configured weather site." },
      { status: 400 }
    )
  try {
    return Response.json(await readSiteForecast(site), {
      headers: { "Cache-Control": "no-store" },
    })
  } catch {
    return Response.json(
      { message: "Site weather is temporarily unavailable." },
      { status: 503, headers: { "Cache-Control": "no-store" } }
    )
  }
}
