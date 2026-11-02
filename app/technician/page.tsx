import { TechnicianDashboard } from "@/components/technician-dashboard"
import { prisma } from "@/lib/prisma"

export const metadata = { title: "Technician workspace | Atlas" }

export default async function TechnicianPage() {
const sites = await prisma.sites.findMany()

  return <TechnicianDashboard sites={sites} />
}
