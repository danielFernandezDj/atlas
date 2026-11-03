# Compact operational dashboard

The dashboard and miner views omit the repeated ATLAS / OPERATIONS page hero.
The selected-miner record and its content are unchanged; its existing action
button stays available at the upper right. The sidebar and top header are
slightly narrower/shorter. Site selection remains labelled for assistive tools.
Weather keeps its responsive three/seven-day preview without an extra outlook
heading. The full National Weather Service link is below Refresh (NWS on phones).

The dashboard search is a compact full-width row without its redundant caption.
Bitcoin always starts collapsed, at every viewport size; Show/Hide still lets
the user reveal or tuck away the chart. Resizing does not reopen it.

Three cards remain: physical miners at this site, deployed miners, and physical
miners in repair. Configured-slot, component inventory and site-configuration
sections are removed from this view. Mining readings retains an empty container
for a later integration. Movement history is unchanged.

The status donut and its percentage legend replace the component panel. Green
hashing, orange warning and red zero-hash categories are shown as unavailable,
not as fabricated zeros, because live telemetry is not connected. Blue represents
miners currently in repair with a reserved port at the selected site. Remaining
linked miners have unknown live status, represented neutrally. The chart's total
is the unique union of miners physically at the site and miners reserved to its
ports; its subtitle states this scope. This includes a miner reserved here even
if it is physically in a repair area elsewhere. All graph aggregates are computed
in the dashboard's existing repeatable-read transaction. Empty inventory produces
an empty ring and zero total, with no division-by-zero or synthetic health data.
