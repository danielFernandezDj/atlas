/**
 * Renders ManagementOverview for the management route. Reporting remains an
 * explicit unavailable-data presentation until a real reporting adapter is connected.
 */
import { ManagementOverview } from "./management-overview"

export const metadata = { title: "Management Overview | Atlas" }

export default function ManagementPage() {
  return <ManagementOverview />
}
