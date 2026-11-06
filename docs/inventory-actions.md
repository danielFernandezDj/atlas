# Inventory actions and account menu

For file locations and a step-by-step reading order, start with
[the developer guide](developer-guide.md). Source files contain workflow-specific
responsibilities and navigation comments.

## Entry points and local drafts

Actions is a popup, not a navigation view. The sidebar offers Insert miners,
Create miner, Create pallet and Manage pallets. The selected miner’s controls
open Update location or Update miner for that miner, without a global selection
step. Map port menus open contextual port actions through `/api/port-actions`.

Create miner checks a skeleton serial before showing ready/scrap details. Owner
and management are fixed to the configured Ionic/DigitalCarpenter.io assignment;
model and asset tag are optional. Ready miners have no initial destination.
Scrap miners require an active pallet and acknowledgment of the skeleton,
control board and three hashboards; a power supply is optional. Presence checks
do not fabricate board identities. Add stages one local entry. Edit/Remove stay
local. Final batch confirmation submits all reviewed entries together.

Insert miners similarly stages existing miners with distinct available ports in
a local queue before final confirmation. Update miner changes supported inventory
metadata; firmware setting controls remain unavailable until a real provider is
connected. Component replacement is not implicitly performed by metadata edits.

## Server safeguards

`GET /api/inventory-actions` supplies authorized options, miner revisions,
location/pallet searches and skeleton availability. POST validates strict command
shapes, same-origin JSON and verified active staff access. ADMIN, MANAGER and
TECHNICIAN can write; VIEWER stays read-only. The actor is derived server-side
and checked again in each serializable transaction.

Registration, skeleton assignment, placement/reservations, movement history and
audit receipts commit together. Existing triggers record component/movement
history; services avoid duplicate events. Version checks/locks reject stale changes,
and destination checks block occupied or reserved ports. Shared repair/staging/pallet
moves preserve the deployment reservation; moving to another deployment releases
the prior reservation and reserves the new configured port. Reservations are never stolen.

An unchanged retry retains one UUID submission key. A saved receipt identifies
the normalized command, actor and result. Matching replays return that result;
changed commands or actors cannot reuse a key. Ambiguous failures keep drafts and
keys. Serialization retries are bounded; failed transactions leave no partial writes.

## Pallets

Create pallet saves an active `locations` row with `kind = PALLET`, a selected site,
name and code. Codes are checked case-insensitively within the site. Manage pallets
lists active and archived pallets, supports search/site filters, and delegates one
selected row to its editor. Site is fixed, name/code are editable, and each change
requires a reason and confirmation. Occupied pallets cannot be archived/deleted.
Used empty pallets can be archived and restored; permanent deletion is restricted
to unused pallets without inventory/history references. Writes preserve an audit
receipt with actor and before/after state.

## Account and checks

The sidebar account menu shows current staff details, paginated user activity,
sign-out and an explicitly planned Slack sign-in recommendation. The activity API
scopes reads to the authenticated staff ID; it cannot browse another user’s logs.

The normal test suite covers schema invariants, inventory/port/pallet safeguards,
access and dependency boundaries using fixtures/disposable databases. The optional
network-backed rollback integration check is explicitly opt-in:

```sh
ATLAS_ACTIONS_ROLLBACK_TEST=1 node --loader ./tests/helpers/ts-loader.mjs --test tests/inventory-actions-rollback.test.mjs
```

A successful UI save refreshes server dashboard/map/miner snapshots. Refactor QA
should inspect staged entries and cancel confirmations without saving live test inventory.
