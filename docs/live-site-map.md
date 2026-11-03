# Live site map

The Site map navigation view reads buildings and cans from the current dashboard
site. Selecting a building selects its first can in natural numeric order; can
selection loads only that can's deployment locations. The authenticated
`GET /api/site-map?site=<id>&can=<id>` uses the existing verified-session and active
Atlas staff checks, validates both IDs, restricts the can to the requested site,
and returns uncached reads. No mutation endpoints or schema changes are included.

Dimensions and zero-based coordinates come from each can. The user confirmed
keeping the populated 11 × 35 layouts (rows 0–10, columns 0–34) for now. Other cans
retain their stored dimensions. Missing location records have outlined cells;
they are distinct from gray empty locations. Invalid coordinate records produce
a visible warning. Assignment conflicts and inactive hierarchies remain visible.

Physical occupants come from `current_miners`; reservations come from
`port_index.reserved_miner`. A reserved miner currently in repair produces a blue
R cell even when no miner physically occupies the slot. Another occupant at that
reserved slot is a conflict. The port menu can open either the physical occupant
or the reservation when they differ; database miner IDs drive navigation to the
existing selected-miner view. Recorded IPs are not evidence of a live connection.

Hover and keyboard focus show serial/name, recorded IP, switch/port, and state.
Left-click or Enter opens the anchored options panel; Escape closes it. Arrow
keys move through cells, Home/End move within a row, and Ctrl+Home/End move to the
first/last cell. A single cell is in the Tab order. On small screens the grid
scrolls horizontally while selectors and detail panels fit the viewport.

Live telemetry is not connected. Occupied cells therefore show ? instead of
inventing hash rates, sleep, health, or zero-rate readings. `portDisplay` supports
future fresh snapshots: green hashing, orange below 90% of a reported expected
rate, red 0 H, and light purple S for an explicit sleep state. Samples older than
two minutes, invalid values, or absent readings remain unknown. The threshold
requires a real expected rate; no universal 78 TH/s threshold is assumed.

Disconnect and Replace miner appear disabled with an explanation. Implementing
those workflows requires authorization, concurrency protection and history
recording; the current map never changes assignments.

## Compact controls and building inventory

The map omits the page hero and duplicate site title; the top header continues
to identify the site. Building and can controls occupy the left half of the
selector card, with smaller can buttons. The right half shows database counts
for the selected building: unique linked miners, deployed here, in repair,
in staging, on pallets, and reserved ports. Small screens stack the two halves.

`GET /api/site-map/building?site=<id>&building=<id>` applies the same staff access
checks as the can endpoint and verifies building/site membership. Counts run in
a repeatable-read transaction. Linked miners use the union of physical building
location and reserved-port building, so one miner counts once within a building.
Repair/staging/pallet counts use this linkage and the miner's actual current
location kind. A miner in a shared repair area without a building can therefore
still count against its reserved building. Deployed here uses physical location
at the selected building only. Reserved ports count actual reservations.
Linked totals can include miners deployed elsewhere or without a current
location; category counts are not presented as an exhaustive partition.

The inventory panel shows configured locations, physical miners present, and
repair reservations for the selected can. Building figures cover all of its
cans; the explicitly labelled Can summary covers only the selected can.
Unconfigured cans say so. Neither summary infers live mining status from
inventory presence.

## Grid-first layout

Building selectors use two columns (1/2 above 3/4). Can selectors sit beside them
in fixed numeric positions: 1/3/5/7 above 2/4/6/8. Phone labels abbreviate buildings
to B1–B4 and cans to their number while retaining their full accessible names.

The selected-can location/miner/repair-reservation summary lives below building
metrics in the inventory panel. It shares the grid's single can response. A
request key prevents a previous can's response appearing under a new selection,
and changes abort the previous request. Building totals remain scoped to the
building; can counts remain explicitly labelled with the selected can.

The map guide opens from a text-and-icon control and is closed by default. It
contains the status legend, telemetry availability, units, coordinate explanation,
keyboard/hover instructions, and scope explanation for building/can counts.
Actual map data errors and coordinate warnings stay visible. Each port box shows
its row/column address at the top right and its state/rate at the lower left.


## Last working port

Activating a cell (click, Enter, or Space) records its site, building, can,
coordinates and location ID in the dashboard's navigation state. Hover/focus
alone does not replace the marker. Each site keeps a separate last port for the
current dashboard session. Full page reload or sign-out clears this UI state;
no inventory records or browser storage are written.

The Last port control shows the address and building/can, and returns to that
can from another selection. Returning from Miners initializes the map to the
last working building/can, focuses the recorded port and scrolls it into view.
Gold borders/text distinguish the bookmark without replacing the status color.
Matches require the can, coordinates and location ID, so a new location at the
same address is not silently treated as the old port. A changed miner assignment
at the same location retains the port marker. Removed cans cannot be revisited
through the marker. No port is assumed selected before the first activation.
