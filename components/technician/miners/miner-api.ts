/**
 * Reads browser-safe JSON from the miner API for search and selected-miner panels.
 * Callers supply cancellation signals; this transport helper translates unreadable
 * or unsuccessful responses and never imports the database client.
 */
export async function readMinerResource<T>(
  url: string,
  signal: AbortSignal
): Promise<T> {
  const response = await fetch(url, {
    signal,
    cache: "no-store",
    credentials: "same-origin",
  })
  const body = await response.json().catch(() => null)
  if (!response.ok)
    throw new Error(
      body?.message ?? "Miner records could not be loaded. Please try again."
    )
  if (!body)
    throw new Error(
      "The inventory response could not be read. Please try again."
    )
  return body as T
}
