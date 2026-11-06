# Miner identity and component inventory

The Prisma model `miner` maps to the existing `miners` SQL table. Existing IDs,
serial labels, company ownership, product models, location assignments, timestamps,
movement history and audit records survive the migration. `identify_miner_id` is
an automatically allocated, permanent business identifier; relationships use `id`.
`serial_number` remains a unique legacy/display label for compatibility with the
current demo contract. It is independent of any later skeleton replacement.

## Installed components

There is no combined components table. A skeleton, control board or hashboard is
one physical inventory record. Its nullable `miner_id` is its current installation.
An unassigned component has `miner_id = null`; do not delete a part when removing
it. Mark scrapped parts `SCRAPPED` after detaching them. Installation is derived,
so there is no second `installed` flag to contradict the relationship.

Each miner has at most one skeleton and one control board. Hashboards have
`position = SLOT_1 | SLOT_2 | SLOT_3`. Both position and miner must be present for
installation, or both null for loose inventory. The unique pair prevents two
boards in one position. A physical hashboard has only one miner assignment.

For example, miner 42 may have rows `(42, SLOT_1, HB-A)` and `(42, SLOT_3, HB-C)`.
That is a miner with two installed hashboards and an empty position 2. Adding
`(42, SLOT_2, HB-B)` represents three boards. Zero or one board is also representable
during repairs; the production readiness workflow should require at least two
working boards before declaring a miner operational. Board count alone does not
prove that firmware, power or network health is operational.

`miner.control_board.mac_address` is the source for the current expected MAC.
There are no duplicate MAC or component-ID columns on `miner`. Include the
component relationships when loading a miner. MAC values are normalized by the
database to lowercase colon-separated form before uniqueness checks. Board
serials may be unknown (`null`), but empty strings are rejected. Skeleton serials
are required and unique. New miner registration must create the miner and its
skeleton within one transaction; a deferred database trigger checks this at commit.

## Ports, locations and reservations

A switch has many ports, uniquely identified by `(switch_id, port_number)`.
This design maps one port to one deployment slot. Site/building/can ancestry
comes from the mapped location. The database checks that the switch and slot
belong to the same site. Empty/unobserved ports have null `observed_mac` and
`last_seen_at`. Observed MACs need not be globally unique: stale observations on
an old port can coexist with a fresh observation on another port.

Port observations are evidence, not an automatic component reassignment. Match
a known observed MAC to the installed control board to identify a miner. Unknown
MACs require a verified repair/installation association or manual confirmation.
The network collector must reject out-of-order observations based on its observed
timestamp; this migration does not implement the collector.

`reserved_miner_id` records which miner keeps the slot while away for repair.
It does not assert that the miner is physically there. Physical placement uses
`current_location_id`; exclusive deployment occupancy uses `occupied_slot_id`.
The database checks that these agree for deployment slots and that shared areas
have no occupied slot. Repair/staging areas may exist without a can or building.

## History, auditing and transactional writes

`miner_history` is a one-to-many event stream. Component triggers record installed,
removed and changed events with before/after snapshots, including serials, MACs,
condition, position and miner assignment. A transfer creates a removal event for
the previous miner and an installation event for the new miner. The same triggers
write `audit_log` even for loose parts. Movement inserts create linked history
events. Existing movements remain in `miner_movements`; imported initial-state
events retain the migration baseline. Component changes after migration append
events rather than overwrite that baseline. `dateDeleted` is a soft-removal marker
for a history entry, not the time a component was removed. Applications should
treat accepted history snapshots as immutable and use correction events.

Inside an authenticated server transaction, set transaction-local actor metadata:

```sql
SELECT set_config('atlas.actor_id', '123', true);
SELECT set_config('atlas.source', 'MANUAL', true);
```

The source can be MANUAL, NETWORK, IMPORT or SYSTEM. Actor IDs must reference a
user. Without actor context, component events use SYSTEM with a null user.
Network/import movements can have a null recorder; manual movements require one.
Never derive trusted actor metadata from browser-submitted IDs.

When replacing a component, detach the old row first, then attach the new one
within the same transaction. Hashboard removal clears both `miner_id` and
`position`. A board swap between occupied positions needs a temporary unassigned
step. Component writes lock affected miner rows in ID order and increment their
versions. A production adapter must check the expected miner `version` before
starting the operation, increment it for moves without component changes, and save
its retry key, movement and any reservation changes in that same transaction.
The live miner workspace uses `/api/miners` and `/api/inventory-actions` with
server readers and transactional writes. Older service/demo components are kept
in `components/technician/legacy/`; they are not the production UI entry point.
See [the developer guide](developer-guide.md) for the current file layout.

## Migration and validation

The migration creates skeleton records from the old miner enclosure serials.
It never invents board serials or MAC addresses. Existing inconsistent occupancy
or blank enclosure serials aborts the transaction for correction, preserving data.
The SQL includes checks and triggers that cannot be expressed solely in Prisma.
Keep them in the versioned migration; do not replace this migration with `db push`.

Run the schema validator and PostgreSQL migration tests:

```sh
pnpm exec prisma validate --config prisma7.config.ts
node --test tests/schema-migration.test.mjs
```

The tests use disposable PGlite PostgreSQL databases and apply the existing
migration chain to populated old-schema fixtures. No configured Neon database is
used. Before deployment, apply the migration to an isolated Neon branch and test
the future production adapter there. This change prepares a migration; it does
not apply it to the configured database or connect the network collector.

## Firmware and network address fields

`control_boards.firmware_version` is nullable text. Unknown firmware is null;
version labels such as `24.03-build.2` are stored without numeric conversion.
Changing firmware on an installed board uses the existing component history and
audit triggers. Existing numeric values are preserved as text by the correction
migration; already-applied migration files remain unchanged.

`miner.miner_ip` is the currently reported address. `last_api_ip` is the last
address used to contact that miner's API. Both are nullable PostgreSQL `inet`
fields accepting IPv4 and IPv6, and neither identifies the permanent asset.
The correction migration converts values in place, treats blank/whitespace-only
addresses as unknown, and aborts atomically for any invalid nonblank address.
IP observation timestamps can be added with the future network collector.

The migration suite now applies every migration through the latest schema before
checking installation invariants. It separately exercises upgrades with existing
firmware/IP data and rollback on invalid addresses. The old architectural backup
is retained as `docs/archive/schema-before-component-inventory.prisma.txt` and is
not an active Prisma schema.
