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
