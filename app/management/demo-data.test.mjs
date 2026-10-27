import assert from "node:assert/strict"
import test from "node:test"
import { readFile } from "node:fs/promises"
import ts from "typescript"

const source = await readFile(
  new URL("./demo-data.ts", import.meta.url),
  "utf8"
)
const compiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.ESNext,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText
const moduleUrl = (text) =>
  `data:text/javascript;base64,${Buffer.from(text).toString("base64")}`
const data = await import(moduleUrl(compiled))
const {
  assets,
  issues,
  demoSites,
  statuses,
  summarize,
  siteSummaries,
  siteHistory,
  historyFor,
  percent,
  SNAPSHOT_AT,
  unmatchedTelemetry,
} = data

test("site and company totals reconcile at a realistic fleet scale", () => {
  const all = summarize("all")
  assert.equal(all.total, 40800)
  assert.equal(
    all.total,
    demoSites.reduce((sum, site) => sum + site.total, 0)
  )
  for (const field of [
    "total",
    "linked",
    "hashing",
    "flagged",
    "recent",
    "lost",
    "never",
    "findings",
    "movementIssues",
    "unlinkedTelemetry",
  ])
    assert.equal(
      all[field],
      siteSummaries.reduce((sum, site) => sum + site[field], 0),
      field
    )
  for (const site of siteSummaries) {
    assert.ok(site.linked <= site.total)
    assert.equal(site.linked + site.lost + site.never, site.total)
    assert.equal(
      Object.values(site.counts).reduce((sum, count) => sum + count, 0),
      site.linked
    )
    assert.equal(site.counts.hashing, site.hashing)
  }
  assert.equal(new Set(assets.map((asset) => asset.id)).size, assets.length)
})
test("flagged assets are unique registered assets; unregistered references and multiple flags stay distinct", () => {
  const all = summarize("all"),
    ids = new Set(assets.map((asset) => asset.id))
  assert.equal(
    all.flagged,
    new Set(
      issues.filter((issue) => issue.assetId).map((issue) => issue.assetId)
    ).size
  )
  assert.ok(all.findings > all.flagged)
  assert.ok(
    issues.some(
      (issue) => issue.assetId === null && issue.category === "registry-missing"
    )
  )
  assert.ok(issues.every((issue) => !issue.assetId || ids.has(issue.assetId)))
  assert.equal(
    all.categoryCounts.reduce((sum, category) => sum + category.count, 0),
    issues.length
  )
  assert.equal(new Set(issues.map((issue) => issue.id)).size, issues.length)
})
test("telemetry populations have explicit, non-overlapping definitions", () => {
  const all = summarize("all")
  assert.equal(all.unlinkedTelemetry, unmatchedTelemetry.length)
  assert.ok(
    unmatchedTelemetry.every(
      (record) => !assets.some((asset) => asset.id === record.id)
    )
  )
  assert.ok(
    assets.every((asset) =>
      asset.telemetry === "linked"
        ? asset.status !== null
        : asset.status === null
    )
  )
  assert.ok(
    issues
      .filter(
        (issue) =>
          issue.category === "never-linked" ||
          issue.category === "racked-no-link"
      )
      .every(
        (issue) =>
          assets.find((asset) => asset.id === issue.assetId).telemetry ===
          "never"
      )
  )
  assert.ok(
    issues
      .filter((issue) => issue.category === "link-lost")
      .every(
        (issue) =>
          assets.find((asset) => asset.id === issue.assetId).telemetry ===
          "lost"
      )
  )
})
test("30-day histories reconcile to their fixed linked cohort and current snapshot", () => {
  for (const site of demoSites) {
    const points = siteHistory[site.id],
      summary = summarize(site.id)
    assert.equal(points.length, 30)
    assert.equal(points.at(-1).at, SNAPSHOT_AT)
    assert.deepEqual(points.at(-1).counts, summary.counts)
    assert.equal(new Set(points.map((point) => point.at)).size, 30)
    for (const point of points) {
      assert.equal(
        Object.values(point.counts).reduce((sum, count) => sum + count, 0),
        point.linked
      )
      assert.equal(point.hashing + point.other, point.linked)
      assert.equal(point.linked, summary.linked)
      assert.ok(
        Object.values(point.counts).every(
          (count) => Number.isInteger(count) && count >= 0
        )
      )
    }
    assert.ok(points.at(-1).hashing > points[0].hashing)
  }
  const company = historyFor("all", 30)
  for (let day = 0; day < 30; day++)
    for (const status of statuses)
      assert.equal(
        company[day].counts[status.id],
        demoSites.reduce(
          (sum, site) => sum + siteHistory[site.id][day].counts[status.id],
          0
        )
      )
  assert.deepEqual(company.at(-1).counts, summarize("all").counts)
})
test("range selection changes history only; seven days are the last seven daily points", () => {
  for (const scope of ["all", ...demoSites.map((site) => site.id)]) {
    const before = summarize(scope),
      seven = historyFor(scope, 7),
      thirty = historyFor(scope, 30)
    assert.equal(seven.length, 7)
    assert.deepEqual(seven, thirty.slice(-7))
    assert.deepEqual(summarize(scope), before)
  }
  assert.equal(percent(0, 0), 0)
  assert.equal(percent(5, 0), 0)
  assert.equal(percent(5, 10), 50)
})
test("recent activity counts distinct assets with movement-log activity in the sample seven-day window", () => {
  const snapshot = Date.parse(SNAPSHOT_AT),
    cutoff = snapshot - 7 * 86400000
  assert.equal(
    summarize("all").recent,
    assets.filter(
      (asset) =>
        Date.parse(asset.lastMovementAt) > cutoff &&
        Date.parse(asset.lastMovementAt) <= snapshot
    ).length
  )
})
test("fixtures are deterministic and management-only", async () => {
  const again = await import(
    moduleUrl(compiled + "\n// independent evaluation")
  )
  assert.deepEqual(again.assets, assets)
  assert.deepEqual(again.issues, issues)
  assert.deepEqual(again.siteHistory, siteHistory)
  assert.ok(
    !/\bfetch\s*\(|prisma|lib\/auth|lib\/miners|lib\/demo/.test(compiled)
  )
  console.log(
    `Verified ${assets.length} tracked assets, ${summarize("all").linked} linked, ${summarize("all").flagged} distinct flagged assets, ${issues.length} sample findings.`
  )
})

test("the management runtime has no application API, database, auth, or cross-experience navigation calls", async () => {
  for (const name of ["page.tsx", "management-overview.tsx", "demo-data.ts"]) {
    const text = await readFile(new URL(`./${name}`, import.meta.url), "utf8")
    assert.ok(
      !/\bfetch\s*\(|\bXMLHttpRequest\b|\bWebSocket\b|prisma|lib\/auth|next\/link|\/api\/|href\s*=|\/technician/.test(
        text
      ),
      name
    )
  }
})
