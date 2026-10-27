# Technician Site Map MVP

The existing Site map rail button selects an in-page technician view, matching Dashboard and Miners. The header is the only site selector. No routes, redirects, authentication, management screens, schema, or production integrations change.

## Data and scope

`lib/site-map/model.ts` defines a read-only `SiteMapService` boundary. The existing `createDemoMinerService` implements it using its existing locations and miners, so additions and movements through existing demo workflows appear when the map is opened/refreshed. The map itself invokes only overview, can-detail, and existing paginated miner-search reads. No write commands, actor identity, occupied-slot IDs, or movement controls are introduced.

The existing North/South/East/West fixtures have 8 × 16 cans and only three deployment location records per can. Remaining coordinates are **Not configured**, not available. Inactive hierarchy is retained for inspection. The SOP's real-site ranges are separately documented as reference metadata; they are never merged with demo sites or used to overwrite dimensions. Standard 11 × 35 zero-based corner behavior is covered by tests.

Occupancy comes from miners' current location relationships. Shared pallet/staging/repair records remain outside the rack. Multiple miners or location records at a deployment coordinate produce a conflict with all occupants retained. Operational telemetry is unavailable, so the occupied color is neutral and no health or hashing claim is made.

Search uses the existing full fixture search, scoped to miners with a current location at the selected site. It searches across all cans and shared locations, supports non-unique asset tags, and paginates results. Unassigned miners remain available in Miners, outside this site's map search. Deployment results focus and highlight the exact cell. Shared-area results open the correct can; the separate shared-area cards inspect their occupants.

## Interaction

Only the selected can mounts a detailed grid. Cells never move or disappear under filtering. Arrows move focus, Home/End move within a row, Ctrl+Home/End move to grid corners, and Enter/Space open the native modal inspector. Escape dismisses it. Full serials wrap and can be copied. Open miner record uses the existing miner detail modal and its authorization behavior. The map does not preselect a movement destination.

Feature-scoped CSS uses existing Atlas theme tokens. A horizontally scrollable viewport keeps cell dimensions readable on narrow screens.

## Remaining production integration

There are no inventory/topology HTTP APIs in this MVP. A future server adapter must implement the typed read interface with existing authentication/site capabilities; return complete can location and occupancy coverage (including inactive historical assignments); and distinguish read failures/partial data from confirmed emptiness. The server remains authoritative for slot exclusivity and all writes. A telemetry integration would require a separate explicit contract; location kind and movement reason must not become operational statuses.

## Verification

`npm run typecheck`, scoped ESLint, `node --test tests/*.test.mjs app/management/demo-data.test.mjs`, and interactive browser checks cover overview/detail navigation, site/building/can resets, search targets, fixed-coordinate filters, keyboard inspection, empty/inactive/unconfigured states, shared destinations, and existing miner details. Management and schema contents are compared with their pre-change fingerprints.
