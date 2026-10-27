# Atlas Management Overview — isolated synthetic preview

Open `/management` directly. The page does not link to or from technician, alter routing/authentication, call an API, or write data. Like the existing technician synthetic preview, this route has no shared authentication guard. Account authentication and all existing integrations are unchanged. A real management feature will need its own server authorization before receiving private data.

All new implementation, CSS modules, deterministic fixtures, and tests live in this folder. Only the unchanged shared Button component, icons, existing typography, and theme tokens are reused. No packages were added.

The fixed sample snapshot is October 27, 2026, 9:00 AM Central Time. The four sites total 40,800 invented registered assets. Current KPIs, status breakdown, site audit percentages, findings, and history come from the same typed fixtures.

- Current status covers **currently Foreman-linked assets only**, not the whole registry. Operational status is a management-only sample concept, separate from physical location and movement reason.
- Link Lost and Never Linked are disjoint registered-asset groups. Unlinked Telemetry is a separate set of unmatched reporting references, not another additive asset group.
- Flagged assets are unique registered asset IDs. Findings can overlap per asset. Unregistered log references count as findings, not flagged registered assets.
- Logged in Last 7 Days counts distinct assets with movement-log activity in the seven days preceding the fixed snapshot; it does not count log entries or indicate hashing.
- Thirty daily history points use a fixed cohort of assets linked at the current sample snapshot. Historical hashing and other linked counts always sum to that cohort, with complete status counts retained. The latest point matches the current status breakdown. Range controls change the chart only.
- Findings and supporting observations are illustrative fixtures, not implemented detection rules. The evidence drawer has no resolution, acknowledgment, or relinking controls.

Run `node --test app/management/demo-data.test.mjs`, `npm run typecheck`, and scoped ESLint for this folder. No database checks are needed.
