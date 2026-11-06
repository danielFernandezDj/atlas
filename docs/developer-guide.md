# Finding your way around Atlas

Start at `app/technician/page.tsx`: it checks the session, calls
`lib/dashboard/read.ts`, and passes the authorized snapshot into
`components/technician/workspace/technician-dashboard.tsx`. That client shell
selects views, remembers the selected miner/last port, and opens actions.

## Component folders

Under `components/technician/`:

- `workspace/`: navigation, site/weather header, clock, account menu and shell styles.
- `dashboard/`: site counts/chart, Bitcoin strip and recent movements.
- `site-map/`: selection coordinator, building inventory and interactive can grid.
- `miners/`: miner search/results, selected record and inventory-backed panels.
- `inventory-actions/`: Quick actions, existing-miner insertion, shared action
  pickers/fields and selected-miner move/edit details.
- `inventory-actions/creation/`: serial-first mixed ready/scrap creation workflow.
- `inventory-actions/pallets/`: Create pallet, directory and single-pallet editor.
- `inventory-actions/ports/`: actions launched from a map port.
- `legacy/`: older service/demo screens and telemetry previews, retained for
  reference and tests. Production routes must not depend on these or `lib/demo/`.

Cross-feature imports use `@/…`; nearby workflow modules may use relative imports.
Styles remain beside their feature. `miners/miner-workspace.css` currently serves
both live and legacy screens, and `workspace/technician-dashboard.css` contains
shared shell/dashboard classes. Check consumers before changing these classes.
`components/ui/` and `lib/utils.ts` contain application-wide UI primitives.
`inventory-actions/action-fields.tsx` shares field markers/location labels across
action workflows, rather than putting feature-specific widgets in global UI.

## Read Create miner in this order

1. `inventory-actions/creation/create-miners.tsx` shows the entire screen assembly.
2. `use-create-miners.ts` owns the draft, local queue, acknowledgments, focus and
   final submission. Its section guide follows the actual workflow order.
3. `creation-draft.tsx` renders the serial gate and ready/scrap form;
   `pallet-picker.tsx` reads active scrap pallets. `creation-model.ts` holds the
   local entry shape and required-part checklist.
4. `creation-review-list.tsx` displays staged entries and routes edits/removal to
   the hook. **Add miner only changes this browser-local list.** Closing the
   workflow discards unsaved drafts and entries.
5. `creation-confirmations.tsx` separates scrap acknowledgment from final batch
   approval. Scrap acknowledgment stages one entry; **Yes, create miners** calls
   `submitBatch`, which POSTs `kind: create-batch` to `/api/inventory-actions`.
6. `app/api/inventory-actions/route.ts` checks identity, role, origin, request shape
   and command schema. `lib/inventory-actions/write.ts` performs the transaction
   through `performCreateBatch` and `applyInventoryAction`.

Ready miners are registered without a location; scrap miners require a pallet,
skeleton, control board and three hashboard presence acknowledgments. Those
acknowledgments are history evidence, not invented component identifiers. The
server creates/attaches the skeleton, records initial history and audit receipts,
and commits the batch together. The client retains its submission key for an
unchanged retry so a lost response cannot create duplicate miners.

## Read pallet management in this order

1. `inventory-actions/inventory-actions.tsx` adds Create pallet and Manage pallets
   to Quick actions and delegates their workflows.
2. `inventory-actions/pallets/manage-pallets.tsx` owns directory search, site filters,
   pagination and selected pallet. It reads `GET /api/inventory-actions?resource=pallets`.
3. `pallet-editor.tsx` owns local edits, required reason, confirmation and the
   `manage-pallet` POST. `create-pallet.tsx` handles the independent creation form.
4. `lib/inventory-actions/manage-pallets.ts` owns directory queries and transactional
   edit/archive/restore/delete rules; `create-pallet.ts` owns creation.

Pallets are `locations` rows with `kind = PALLET`. Miners refer to them through
`current_location_id`; they are shared destinations. Their site stays fixed.
Name/code edits preserve the ID and history. Empty used pallets can be archived
and restored; permanent deletion is only allowed when there are no occupants,
ports, movement references or initial scrap-registration references. Each write
records actor, reason and before/after details in `audit_log` in the same transaction.

## Other UI → API → database paths

- **Dashboard:** server page → `lib/dashboard/read.ts` → Prisma; refresh after a
  successful action reloads that server snapshot.
- **Miner search/detail:** `miners/miner-inventory-search.tsx` and
  `live-miner-workspace.tsx` → `/api/miners` or `/api/miners/[id]` →
  `lib/miners/read-inventory.ts` → Prisma.
- **Site map:** `site-map/live-site-map.tsx` and `building-inventory.tsx` →
  `/api/site-map` and `/api/site-map/building` → `lib/site-map/read-live.ts`.
  `can-grid.tsx` owns selection/hover/filter UI and emits action callbacks.
- **Insert/move/edit miners:** inventory action components → `/api/inventory-actions`
  → `lib/inventory-actions/read.ts` or `write.ts`.
- **Port actions:** `inventory-actions/ports/port-actions.tsx` → `/api/port-actions`
  → `lib/port-actions/read.ts` or `write.ts`; port writes reuse the inventory
  transaction primitive to preserve movement and reservation rules.
- **Account:** `workspace/account-menu.tsx` → `/api/account-activity`; that route
  scopes audit reads to the current staff member. Login/recovery use `lib/auth/`
  and the restricted `/api/auth/[...path]` handler.
- **Weather/Bitcoin:** browser components → `/api/weather` or `/api/bitcoin` →
  public data services. These paths do not modify inventory.

Client components never import Prisma or server readers. Browser-safe `contracts.ts`
modules define DTOs/schemas; API routes validate them again. Active verified staff
access is mandatory, and write roles are checked again inside transactions. Never
trust a browser-supplied actor ID. Existing SQL constraints/triggers in versioned
Prisma migrations remain part of the correctness boundary.

## Why some files remain long

`lib/inventory-actions/write.ts` keeps the ordered single-action locks, validation,
reservation transitions and writes together so port actions can reuse that exact
transaction primitive. `site-map/can-grid.tsx` keeps keyboard navigation, cell refs,
hover positioning and overlays together because they share focus and coordinates.
Both have section guides and matching comments. Retained legacy screens are
annotated rather than extensively redesigned; they are not the live feature entry
points. Shared styles are grouped by purpose rather than mechanically split.

## Validation and safe changes

Read `AGENTS.md` and the relevant installed Next.js guide first. Keep changes
behavior-preserving unless a feature change was requested. Update paths in imports,
tests and docs when moving modules. Do not edit generated Prisma files or historical
migrations for a component refactor.

From the repository root:

```sh
pnpm exec tsc --noEmit --incremental false
pnpm exec eslint app components lib --ignore-pattern 'lib/generated/**'
node --test tests/*.test.mjs app/management/demo-data.test.mjs
pnpm run build
```

The normal suite includes disposable database migration tests and API/service
safeguard tests. The explicitly opt-in rollback integration test stays skipped
unless its environment flag is set. For UI checks, stage a draft and inspect or
cancel confirmations; do not save test inventory to the live database. Check
Create miner, Insert miners, pallet management, miner search and map interactions
at desktop and narrow sizes after structural changes. Commit locally when done;
push only when explicitly requested for that task.
