"use client"
/**
 * Provides /technician with a recoverable error screen when loading fails.
 * The route boundary supplies the retry callback; this component only renders UI.
 */

export default function DashboardError({ retry }: { retry: () => void }) {
  return (
    <main className="flex min-h-svh flex-col items-center justify-center gap-4 p-6">
      <h1 className="text-2xl font-semibold">Dashboard unavailable</h1>
      <p className="text-muted-foreground">
        We couldn’t load your site records. Please try again.
      </p>
      <button className="rounded-md border px-4 py-2" onClick={retry}>
        Try again
      </button>
    </main>
  )
}
