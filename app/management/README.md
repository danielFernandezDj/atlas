# Atlas Management Overview

Open `/management` directly. The route displays empty states until operational data is connected. Unavailable metrics use an em dash rather than invented counts or zeroes.

The runtime does not import `demo-data.ts`. That module remains a test fixture for the existing reconciliation tests. Technician fixture adapters likewise remain available for isolated tests but are not mounted by the technician route. No synthetic profile, sites, inventory, movements, weather, or telemetry are loaded by either workspace.

No authentication, database records, schema, migrations, reference configuration, or integrations were changed. The technician workspace retains the live Bitcoin market component.

Validation: `npm run typecheck`, scoped ESLint, and `node --test tests/*.test.mjs app/management/demo-data.test.mjs`.
