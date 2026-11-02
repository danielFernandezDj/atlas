# Live miner workspace

The Miners navigation tab uses `LiveMinerWorkspace` and read-only, authenticated
server endpoints. It has no dependency on the old demo miner service or mock
telemetry. Inventory search, site/kind filters, counts and pagination execute in
Postgres; search is not limited to the rows already loaded in the browser.

- `GET /api/miners`: `search`, optional positive `site`, `kind`, `page`, `pageSize`.
  Page size defaults to 12 and is limited to 50. Results sort by permanent miner
  identifier and primary key. Out-of-range pages are clamped to the last page.
- `GET /api/miners/:id`: current identity, ownership, location, IP addresses,
  installed parts, reserved port, and the latest 20 movements and asset events.

Both endpoints require a current Neon Auth session with verified email and an
active `public.users` record matching that email. As with the dashboard, all
active staff roles can read all sites. No write methods are exposed. Responses
are not cached. Invalid filters return 400, missing miners 404, unauthenticated
requests 401, unapproved accounts 403, and unavailable reads 503.

The directory's site filter follows the miner's current physical location, not
its reserved deployment slot. Choose all sites to include unassigned miners.
Choosing the unassigned kind clears the site filter. A reservation is displayed
separately from physical location. Repair/staging/pallet locations may have no
building or can. Inactive configuration is retained and labelled.

The permanent miner identity is `identify_miner_id`; serial labels and component
serials remain separate values. Hashboard positions 1–3 are shown independently.
An empty position means no current assignment, not a detected fault. Component
condition is recorded inventory data, not live operational health. No hash rate,
temperature, online status or firmware settings are fabricated or inferred.

Movement and asset history show at most the latest 20 records with total counts.
Soft-removed asset history is excluded. Automated entries identify their source
rather than invent a technician. The browser aborts stale reads during search,
pagination and detail changes. Closing details restores the opening control's
focus. Data errors have retry actions rather than becoming false empty results.

Registration, movement recording and component replacement remain separate
future write integrations; this connection does not mutate inventory.
