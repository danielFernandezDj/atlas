/**
 * Routes the root URL to /technician, where the session and staff checks live.
 * This server entry performs navigation only; it does not load inventory.
 */
import { redirect } from "next/navigation"

export default function Page() {
  redirect("/technician")
}
