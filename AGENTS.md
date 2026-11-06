<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Project workflow

Follow the Git workflow in `.cursor/rules/git-workflow.mdc`: commit completed tasks locally; push only when explicitly requested for that task.

## Maintainable application code

Read `docs/developer-guide.md` for feature locations and UI → API → database paths.
For all authored application source (excluding generated/vendor code):

- Use descriptive names and group components by feature/responsibility. Put truly
  shared primitives in a shared location; avoid giant coordinators and tiny-file fragmentation.
- Put a useful responsibility paragraph near the top of every application source
  file, immediately after `"use client"` when present. Explain important named
  collaborators and whether the file holds local state, reads APIs, submits
  commands or performs database writes. Preserve required directives.
- Give genuinely long files an ordered section guide and matching section comments.
  Explain why tightly coupled responsibilities remain together. Avoid line numbers.
- Comment business rules, boundaries and reasoning rather than obvious syntax.
  Distinguish staging a local review entry from final API submission and database commit.
- Extract cohesive forms, panels, hooks or helpers when it clarifies the workflow;
  keep the coordinating component readable. Do not split solely to meet a line target.
- Update imports, styles, tests and developer documentation when moving code. Avoid
  circular dependencies and keep browser code out of server/database modules.
- Preserve permissions, retry keys, versions, transactions, reservations and history
  safeguards during refactors. Do not change migrations or live inventory for cleanup.
- Run TypeScript, lint, relevant tests, production build and affected UI checks.
  Report validation and remaining limitations, then follow the Git workflow above.
