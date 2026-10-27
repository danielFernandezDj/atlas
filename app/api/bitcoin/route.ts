// Public market data only. No account, trading access, or database connection.
export async function GET() {
  try {
    const [spotResponse, candlesResponse] = await Promise.all([
      fetch("https://api.coinbase.com/v2/prices/BTC-USD/spot", {
        next: { revalidate: 60 },
        signal: AbortSignal.timeout(10000),
      }),
      fetch(
        "https://api.exchange.coinbase.com/products/BTC-USD/candles?granularity=86400",
        { next: { revalidate: 3600 }, signal: AbortSignal.timeout(10000) }
      ),
    ])
    if (!spotResponse.ok || !candlesResponse.ok)
      throw new Error("Market data unavailable")
    const spot = await spotResponse.json()
    const candles: unknown = await candlesResponse.json()
    const price = Number(spot?.data?.amount)
    if (!Number.isFinite(price) || price <= 0 || !Array.isArray(candles))
      throw new Error("Invalid market data")
    const cutoff = Date.now() / 1000 - 30 * 86400
    const points = candles
      .filter(
        (row): row is number[] =>
          Array.isArray(row) &&
          row.length >= 5 &&
          Number.isFinite(row[0]) &&
          Number.isFinite(row[4]) &&
          row[4] > 0 &&
          row[0] >= cutoff &&
          row[0] <= Date.now() / 1000
      )
      .sort((a, b) => a[0] - b[0])
      .map((row) => ({ at: row[0] * 1000, value: row[4] }))
    if (points.length < 2) throw new Error("History unavailable")
    points.push({ at: Date.now(), value: price })
    return Response.json({
      price,
      points,
      change: (price / points[0].value - 1) * 100,
      fetchedAt: new Date().toISOString(),
      source: "Coinbase",
    })
  } catch {
    return Response.json(
      { error: "Bitcoin market data is temporarily unavailable." },
      { status: 503 }
    )
  }
}
