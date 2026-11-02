export type DashboardSite = {
  id: number
  name: string
  description: string | null
  is_active: boolean
}

export type DashboardData = {
  sites: DashboardSite[]
  selectedSite: DashboardSite | null
  siteUnavailable: boolean
  loadedAt: string
  summary: {
    miners: number
    deployed: number
    repair: number
    staging: number
    pallet: number
    slots: number
    occupied: number
    reserved: number
    skeletons: number
    controlBoards: number
    hashBoards: number
  } | null
  buildings: {
    id: number
    number: number
    active: boolean
    cans: { id: number; number: string; active: boolean; slots: number }[]
  }[]
  movements: {
    id: number
    minerId: number
    identity: number
    serial: string
    from: string
    to: string
    reason: string
    by: string
    occurredAt: string
  }[]
}

export type DashboardAccess =
  | { status: "verify-email" | "denied" }
  | {
      status: "ready"
      viewer: { name: string; role: string }
      dashboard: DashboardData
    }
