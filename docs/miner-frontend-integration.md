# Miner frontend integration

This Miner workspace is a synthetic prototype. It does not write to Prisma, call a miner HTTP endpoint, or provide production authorization/concurrency protection. The existing dashboard telemetry and weather remain separate illustrative fixtures.

## Repository review

- `prisma/schema.prisma` matches the supplied miner, movement, company, and location architecture. It was read without changes.
- Existing routes are auth, health, and Bitcoin. There are no miner search/detail/history, destination eligibility, capability, or movement endpoints to integrate with.
- The generated Prisma client currently contains an empty model map and no enums; its `models/` folder is empty. It predates the current schema. Consequently generated types cannot confirm the optional `building` relation at present. Regeneration/validation is deferred along with database work.
- Every location fixture has a required site, building ID, and can. The presentation type allows a null building relation and displays “Building unavailable”; it never drops the building/can from shared destinations.
- No implemented coordinate display convention or API transformation was found. The prototype displays stored row/slot values unchanged (including zero), with no index offset. The stored deployment fixtures use row 2 and slots 4–6. Confirm this convention before production integration.

## Boundaries

`lib/miners/contracts.ts` defines a **proposed**, transport-independent `MinerService` interface and presentation DTOs. No endpoint URLs have been invented. A future adapter must implement these operations using authenticated server routes/actions:

- `searchMiners`: full authorized-dataset search, site/kind filters, stable pagination and totals. Do not search just the current page. Access to unassigned miners must be explicitly authorized.
- `getMiner`: readable model/company/location relations, record version, and server-derived `can_move`, explanation, and allowed movement reasons. Enum role names alone do not grant capabilities.
- `getHistory`: paginated `miner_movements`, actor display name, nullable source, required destination, notes, occurrence and recording times. Keep inactive historical relations readable. Order by occurrence time and a stable record tie-breaker. Do not use `audit_log` as movement history.
- `getDestinations`: authorized active sites/buildings/cans and existing locations, kind filtering, paginated location options, and authoritative availability/unavailability explanations. A nullable building relation must be resolved/validated before offering a destination. The browser does not create locations.
- `move`: one atomic authenticated server operation. The command contains only `miner_id`, `destination_location_id`, exact reason enum, optional movement notes, `expected_version`, and UUID `submission_key`. No client-supplied actor, source location, or editable occupied-slot ID.

`lib/demo/miner-service.ts` is the explicit in-memory adapter, instantiated only by the demo Technician shell. It operates on the entire fixture collection before pagination. Fixture capabilities, site visibility, and allowed reasons are examples, not a production permission policy. It simulates validation, version conflicts, exclusive deployment slots, shared capacity, and idempotency. Its `demo` test controls are outside the production interface.

The directory includes optional model/asset-tag values, repeated asset tags, same/different owner/manager companies, a long serial, unassigned miners, view-only records, inactive existing locations, and multiple miners in a shared repair area. Being in a repair area makes no claim about miner condition. No IP, telemetry, hardware condition, repair session/ticket/outcome, or scrap fields are introduced.

## Proposed movement server contract (not implemented)

1. Authenticate the session and derive the acting user. Check miner and destination access, `user_sites`, account activity, workflow capabilities, and allowed reasons on the server.
2. Within one transaction, look up the submission key and payload fingerprint. An identical retry returns the original committed outcome; reusing a key for a different payload is rejected. Check idempotency **before** version validation so a lost response can be retried after its successful version increment.
3. Lock or conditionally update the miner using `expected_version`. Read its source location on the server. Validate destination hierarchy, active flags, coordinate requirements, and location eligibility. Claim a deployment slot atomically; translate uniqueness races into a destination conflict. Shared locations do not have exclusive occupancy.
4. In the same transaction, set current location, set occupied-slot ID to that destination only for deployment slots (otherwise null), increment the version, and create `miner_movements` with authenticated actor, authoritative source, reason, notes, and the two timestamps. Roll back all changes on failure.
5. Return a stable movement outcome. Expose typed errors corresponding to version conflict, slot occupied, forbidden, not found, invalid request, and transport failure. HTTP status/error-envelope choices remain to be decided with the backend; this frontend does not assume existing HTTP contracts.
6. After success the UI re-reads detail/version/history and the directory. A conflict closes the stale form, refreshes data and availability on reopening, and requires explicit review/new submission. It never automatically replays a stale command. If refresh fails, the UI shows a retryable read error rather than displaying stale details as current.

The UI creates a UUID when a logical command is first submitted, reuses it for unchanged retries, and generates a new key if any payload field or expected version changes. A synchronous in-flight guard prevents duplicate clicks. An ambiguous transport failure preserves the draft/key and offers retry or authoritative refresh. These protections depend on the future server contract; the browser alone cannot make authoritative writes safe.

## Verification

Run `npm run typecheck`, scoped ESLint, and `node --test tests/miner-demo.test.mjs`. Adapter tests cover full-dataset search/pagination, optional values, exact coordinates, hierarchy eligibility, exclusive/shared destinations, capability rejection, version conflict, lost-response retry, changed-payload key rejection, actor/source authority, and error recovery. Browser checks cover directory/detail navigation, empty and unassigned states, inactive locations, move success and refreshed history/version, read-only records, and responsive layout. No database connectivity, migration, or production authorization checks are performed.

## Add a miner demo

Actions → Add a miner now uses the same isolated adapter. It collects a required unique serial (preserving case and trimming surrounding whitespace), optional non-unique asset tag, optional existing manufacturer/model/variant, required Owner and Managed by companies, and an optional existing physical location. It does not create company/model/location records, expose occupied-slot IDs, or add operational/condition fields.

The proposed service boundary adds `getRegistrationOptions` (authorized existing company/model choices, active location hierarchy/availability, and `can_register`) and `registerMiner`. These remain interface proposals, not implemented production APIs. The demo explicitly grants registration capability; this is not inferred from the role enum. New demo records remain movable; only the original explicit read-only fixtures retain their view-only capability.

A registration without a location has version 0 and no movement record, because movements require a destination. With a location, the demo atomically creates the miner and a source-null `INITIAL_REGISTRATION` movement, sets the initial version to 1, and attaches optional notes to that movement only. The initial-version rule is an explicit demo contract proposal for backend confirmation. Shared locations permit multiple miners; occupied deployment slots and inactive hierarchy records are rejected at save, not only disabled in the form.

Registration uses a UUID per logical payload, unchanged retry reuse, duplicate-click prevention, exact serial uniqueness, and a confirmation screen linking to the canonical miner record. A lost response can be retried without duplicating the miner or initial movement in the demo. A payload change gets a new UUID. Serial and slot conflicts preserve the draft and require a corrected serial or refreshed destination choice.

Production still needs an authenticated, authorized registration operation with atomic serial uniqueness/slot claims and optional initial movement creation. It must derive actor/source/version/occupied-slot values on the server. Durable registration idempotency **without an initial location cannot be supplied by `miner_movements.submission_key` alone**: the backend needs an explicit durable operation-key strategy. No schema change or endpoint was added to solve that here. Registration authorization, allowed initial-location rules, coordinate conventions, and version initialization must be confirmed when implementing that backend.
