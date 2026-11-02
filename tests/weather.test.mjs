import assert from "node:assert/strict"
import test from "node:test"
import { readFile } from "node:fs/promises"
import ts from "typescript"
const compile = async (p) =>
  ts.transpileModule(await readFile(new URL(p, import.meta.url), "utf8"), {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText
const url = (s) =>
  `data:text/javascript;base64,${Buffer.from(s).toString("base64")}`
const sitesUrl = url(await compile("../lib/weather/sites.ts"))
const { weatherSites, weatherSiteByName } = await import(sitesUrl)
const { parseForecast, siteDate, readSiteForecast } = await import(
  url(
    (await compile("../lib/weather/forecast.ts")).replace(
      '"./sites"',
      JSON.stringify(sitesUrl)
    )
  )
)
const now = new Date("2026-11-03T02:00:00Z") // Still Nov 2 at the sites.
function period(date, day, overrides = {}) {
  return {
    startTime: `${date}T${day ? "06" : "18"}:00:00-06:00`,
    endTime: day
      ? `${date}T18:00:00-06:00`
      : new Date(
          Date.parse(`${date}T18:00:00-06:00`) + 12 * 3600000
        ).toISOString(),
    isDaytime: day,
    temperature: day ? 75 : 48,
    temperatureUnit: "F",
    shortForecast: day ? "Sunny" : "Mostly Clear",
    detailedForecast: "Forecast description",
    windSpeed: "5 to 15 mph",
    probabilityOfPrecipitation: { value: 0 },
    ...overrides,
  }
}
function fixture() {
  return {
    properties: {
      updateTime: now.toISOString(),
      periods: ["2026-11-02", "2026-11-03", "2026-11-04"].flatMap((d) => [
        period(d, true),
        period(d, false),
      ]),
    },
  }
}
test("site mapping uses the four supplied pin centers and never a fallback town", () => {
  assert.deepEqual(
    weatherSites.map((s) => [s.name, s.latitude, s.longitude]),
    [
      ["Rebel", 31.8959375, -101.7486875],
      ["Stiles", 31.4307875, -101.583078125],
      ["East Stiles", 31.5614375, -101.4791875],
      ["Garden City", 31.8629875, -101.467859375],
    ]
  )
  assert.equal(weatherSiteByName("  EAST STILES ").key, "east-stiles")
  assert.equal(weatherSiteByName("unknown"), undefined)
})
test("three days follow Central calendar date and include nighttime thunderstorms", () => {
  const raw = fixture()
  raw.properties.periods[1].shortForecast =
    "Slight Chance Showers And Thunderstorms"
  raw.properties.periods[1].probabilityOfPrecipitation.value = 20
  const result = parseForecast(raw, weatherSites[0], now)
  assert.equal(siteDate(now), "2026-11-02")
  assert.deepEqual(
    result.days.map((d) => d.date),
    ["2026-11-02", "2026-11-03", "2026-11-04"]
  )
  assert.equal(result.days[0].storm, true)
  assert.equal(result.days[0].icon, "storm")
  assert.equal(result.days[0].rain, 20)
  assert.equal(result.days[0].wind, 15)
  assert.equal(result.days[0].high, null)
  assert.equal(result.days[0].low, 48)
  assert.equal(result.days[1].high, 75)
})
test("null probabilities remain unavailable and overnight period belongs to today after midnight", () => {
  const early = new Date("2026-11-03T08:00:00Z")
  const raw = fixture()
  raw.properties.updateTime = early.toISOString()
  raw.properties.periods.forEach(
    (p) => (p.probabilityOfPrecipitation.value = null)
  )
  raw.properties.periods.push(
    period("2026-11-05", true),
    period("2026-11-05", false)
  )
  const d = parseForecast(raw, weatherSites[0], early).days[0]
  assert.equal(d.date, "2026-11-03")
  assert.equal(d.low, 48)
  assert.equal(d.rain, null)
  assert.equal(siteDate(new Date("2026-07-02T05:30:00Z")), "2026-07-02")
  assert.equal(siteDate(new Date("2026-01-02T05:30:00Z")), "2026-01-01")
})
test("stale, incomplete or malformed upstream weather fails instead of inventing clear weather", () => {
  const stale = fixture()
  stale.properties.updateTime = "2026-10-31T00:00:00Z"
  assert.throws(() => parseForecast(stale, weatherSites[0], now), /Stale/)
  const short = fixture()
  short.properties.periods = short.properties.periods.slice(0, 2)
  assert.throws(() => parseForecast(short, weatherSites[0], now), /Incomplete/)
  const malformed = fixture()
  malformed.properties.periods[0].temperature = null
  assert.throws(() => parseForecast(malformed, weatherSites[0], now), /Invalid/)
})
test("weather fetch validates NWS endpoints, uses caching and propagates upstream failures", async () => {
  const calls = []
  const get = async (url, options) => {
    calls.push([url, options])
    return new Response(
      JSON.stringify(
        calls.length === 1
          ? {
              properties: {
                forecast:
                  "https://api.weather.gov/gridpoints/MAF/141,107/forecast",
              },
            }
          : fixture()
      )
    )
  }
  const result = await readSiteForecast(weatherSites[1], get, now)
  assert.equal(result.days.length, 3)
  assert.match(calls[0][0], /points\/31.4308,-101.5831$/)
  assert.equal(calls[1][1].next.revalidate, 900)
  let count = 0
  await assert.rejects(
    readSiteForecast(
      weatherSites[0],
      async () => {
        count++
        return new Response(
          JSON.stringify({
            properties: { forecast: "https://example.com/private" },
          })
        )
      },
      now
    ),
    /Invalid forecast endpoint/
  )
  assert.equal(count, 1)
  await assert.rejects(
    readSiteForecast(
      weatherSites[0],
      async () => new Response("", { status: 503 }),
      now
    ),
    /location unavailable/
  )
})
