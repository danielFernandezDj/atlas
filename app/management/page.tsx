import { ManagementOverview } from "./management-overview"

export const metadata = {
  title: "Management Overview | Atlas — Synthetic preview",
}

// Independent synthetic preview. No authentication, redirect, or data integration is changed here.
export default function ManagementPage() {
  return <ManagementOverview />
}
