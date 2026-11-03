# Inventory actions and account menu

Actions is a popup, not a navigation view. It opens from the sidebar or the
selected miner's heading. The selected-miner trigger supplies its database ID.
Map port menus offer Add a miner here for empty active configured locations,
and Update location / Update miner for an occupant. The destination is prefilled
from the map location; an existing repair reservation prefills its miner.

Create miner begins with a required skeleton serial check, then exposes owner,
management company, optional model/asset tag, location and explanatory notes.
The serial is also the initial miner serial label. An existing unassigned,
non-scrapped skeleton can be attached; otherwise a skeleton is created. No control
boards, MAC addresses or hashboards are invented. Update miner currently edits
model, owner, manager and asset tag; component replacement is a separate future
workflow. Update location searches all existing miners and destinations, including
repair/staging/pallet locations. All actions require notes.

`GET /api/inventory-actions` supplies authorized options, miner revisions,
location searches and skeleton availability. `POST` validates strict discriminated
command shapes, a same-origin JSON request and verified active staff access.
ADMIN, MANAGER and TECHNICIAN can write inventory; VIEWER remains read-only.
The actor is checked again inside a serializable transaction and actor context
is set locally for the existing database history triggers. No role is client
supplied and no schema migration is needed.

Registration, skeleton assignment, occupancy/reservation updates, movement records
and audit receipts commit together. Existing component/movement triggers record
actor-attributed miner history; the service does not duplicate those events.
Metadata edits add an explicitly scoped miner-details event. Version checks and
row locks reject stale edits; uniqueness checks and transactions block occupied
or reserved destinations. Moving to a shared repair/staging/pallet location keeps
the deployment reservation; moving to another deployment releases the prior port
and reserves the new port when configured. A reservation is never stolen.

One UUID submission key is kept for an unchanged retry. A receipt records its
normalized command fingerprint, actor and result. Replaying it returns the prior
result, even when the client still has an older version. A reused key with a
changed command/actor is rejected. Ambiguous transport failures retain the draft
and key; edits produce a new key. Serialization conflicts retry within a bounded
limit. Failed transactions leave no partial location/history changes.

Account is at the bottom of the sidebar. Its popup shows the current staff name,
email and role, the signed-in user's paginated audit activity, and sign-out through
the existing Neon Auth client. `GET /api/account-activity` always scopes records
to the authenticated staff ID. The Slack sign-in recommendation is clearly labelled
planned; this change does not configure a Slack identity provider or contact Slack.

Validation includes unit/access tests, the existing SQL invariant suite, browser
checks without saving inventory, and a real transaction test that explicitly
rolls back registration, deployment, repair, metadata changes and history.
To run that optional integration check against the configured database:

```sh
ATLAS_ACTIONS_ROLLBACK_TEST=1 node --loader ./tests/helpers/ts-loader.mjs --test tests/inventory-actions-rollback.test.mjs
```

The normal test suite skips that network-dependent test. It never signs users out
or changes authentication settings. Final saves in the UI update the dashboard,
map summaries and miner history through a server refresh.
