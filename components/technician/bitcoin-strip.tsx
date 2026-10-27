"use client"

import { useEffect, useId, useState } from "react"
import { Bitcoin, RefreshCw, TrendingDown, TrendingUp } from "lucide-react"

type Market = {
  price: number
  points: { at: number; value: number }[]
  change: number
  fetchedAt: string
  source: string
}
export function BitcoinStrip() {
  const [market, setMarket] = useState<Market | null>(null)
  const [failed, setFailed] = useState(false)
  const [refresh, setRefresh] = useState(0)
  const gradientId = useId()
  useEffect(() => {
    const controller = new AbortController()
    async function load() {
      try {
        const response = await fetch("/api/bitcoin", {
          signal: controller.signal,
        })
        if (!response.ok) throw new Error("Unavailable")
        const data = await response.json()
        if (!controller.signal.aborted) {
          setMarket(data)
          setFailed(false)
        }
      } catch {
        if (!controller.signal.aborted) setFailed(true)
      }
    }
    void load()
    const timer = setInterval(load, 60000)
    return () => {
      controller.abort()
      clearInterval(timer)
    }
  }, [refresh])
  const values = market?.points.map((point) => point.value) ?? []
  const low = Math.min(...values),
    high = Math.max(...values)
  const coords = values.map(
    (value, index) =>
      `${(index / Math.max(values.length - 1, 1)) * 480},${58 - ((value - low) / (high - low || 1)) * 48}`
  )
  const up = (market?.change ?? 0) >= 0
  const Trend = up ? TrendingUp : TrendingDown
  return (
    <section
      className="atlas-card atlas-bitcoin"
      aria-label="Bitcoin market overview"
    >
      <div className="atlas-bitcoin-label">
        <span className="atlas-bitcoin-icon">
          <Bitcoin size={21} />
        </span>
        <div>
          <h2>
            Bitcoin <span className="atlas-muted">BTC / USD</span>
          </h2>
          <p className="atlas-muted">Market overview · 30 days</p>
        </div>
      </div>
      {market ? (
        <>
          <div className={`atlas-btc-chart ${up ? "is-up" : "is-down"}`}>
            <svg
              viewBox="0 0 480 70"
              preserveAspectRatio="none"
              role="img"
              aria-label={`Bitcoin daily closing prices and latest spot price over the last 30 days. Range ${Math.round(low).toLocaleString("en-US")} to ${Math.round(high).toLocaleString("en-US")} US dollars.`}
            >
              <defs>
                <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                  <stop
                    offset="0%"
                    stopColor="currentColor"
                    stopOpacity=".16"
                  />
                  <stop
                    offset="100%"
                    stopColor="currentColor"
                    stopOpacity="0"
                  />
                </linearGradient>
              </defs>
              <path
                d={`M${coords.join(" L")} L480,70 L0,70 Z`}
                fill={`url(#${gradientId})`}
              />
              <polyline
                points={coords.join(" ")}
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                vectorEffect="non-scaling-stroke"
              />
            </svg>
            <div className="atlas-chart-dates">
              <span>
                {new Date(market.points[0].at).toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                  timeZone: "America/Chicago",
                })}
              </span>
              <span>Today</span>
            </div>
          </div>
          <div className="atlas-btc-price">
            <strong>
              {market.price.toLocaleString("en-US", {
                style: "currency",
                currency: "USD",
                maximumFractionDigits: 0,
              })}
            </strong>
            <span className={up ? "atlas-green" : "atlas-red"}>
              <Trend size={14} />
              {up ? "+" : ""}
              {market.change.toFixed(2)}%{" "}
              <span className="atlas-muted">/ 30d</span>
            </span>
            <p className="atlas-muted">
              <a
                href="https://www.coinbase.com/price/bitcoin"
                target="_blank"
                rel="noreferrer"
              >
                Coinbase
              </a>{" "}
              · {failed ? "Update delayed · " : ""}
              {new Date(market.fetchedAt).toLocaleTimeString("en-US", {
                hour: "numeric",
                minute: "2-digit",
                timeZone: "America/Chicago",
              })}{" "}
              CT
            </p>
          </div>
        </>
      ) : (
        <div className="atlas-market-loading" role="status">
          {failed ? (
            <>
              Market feed unavailable{" "}
              <button
                onClick={() => {
                  setFailed(false)
                  setRefresh((value) => value + 1)
                }}
                className="atlas-text-button"
              >
                <RefreshCw size={13} />
                Retry
              </button>
            </>
          ) : (
            "Loading Bitcoin price and 30-day chart…"
          )}
        </div>
      )}
    </section>
  )
}
