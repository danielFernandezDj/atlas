/**
 * Displays the pending state while /technician loads its authorized dashboard.
 * Next.js owns this route fallback; it neither requests nor changes inventory.
 */
export default function Loading() {
  return (
    <main
      className="flex min-h-svh items-center justify-center p-6"
      role="status"
    >
      Loading your site dashboard…
    </main>
  )
}
