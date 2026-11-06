/**
 * Reads JSON picker/options resources from /api/inventory-actions for the action
 * coordinator and insertion/location selectors. This browser transport performs reads
 * only; the API route owns authentication and database queries.
 */
export async function readActionResource<T>(
  params: Record<string, string>,
  signal?: AbortSignal,
  failureMessage = "Inventory unavailable."
): Promise<T> {
  const response = await fetch(
    `/api/inventory-actions?${new URLSearchParams(params)}`,
    { cache: "no-store", signal }
  )
  const body = await response.json()
  if (!response.ok) throw new Error(body.message ?? failureMessage)
  return body
}

/** Creation reads use their existing error wording while sharing the same HTTP transport. */
export function readRegistrationResource<T>(
  params: Record<string, string>,
  signal?: AbortSignal
): Promise<T> {
  return readActionResource<T>(
    params,
    signal,
    "Registration information unavailable."
  )
}
