/**
 * Shares required-field markers and location labels across inventory action forms.
 * These presentation primitives keep coordinates legible; callers own selection,
 * validation, submission and database effects.
 */
import type { ActionLocation } from "@/lib/inventory-actions/contracts"
export function RequiredMark() {
  return (
    <span className="atlas-required" aria-label="required">
      *
    </span>
  )
}
export function LocationLabel({ location }: { location: ActionLocation }) {
  const index = location.coordinate
    ? location.label.indexOf(location.coordinate)
    : -1
  return (
    <span>
      {index < 0 ? (
        location.label
      ) : (
        <>
          {location.label.slice(0, index)}
          <strong className="atlas-location-coordinate">
            {location.coordinate}
          </strong>
          {location.label.slice(index + location.coordinate!.length)}
        </>
      )}
    </span>
  )
}
