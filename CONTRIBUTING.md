# Contributing to XYPH

XYPH is not a generic dashboard or a generic agent wrapper. It is a sovereign,
graph-native control plane for humans and agents.

If you contribute here, the job is not just to land working code. The job is to
protect the product doctrine while making the system more capable.

## Core Product Philosophy

- The graph is the plan.
- Governance is a first-class product surface.
- Provenance matters.
- Human and agent surfaces share one reality.
- Suggestions are advisory, not sovereign.
- The substrate may be sophisticated; the operator experience cannot feel
  like substrate maintenance.

The highest-level rule is simple:

If a change makes XYPH less truthful, less governable, less legible, or more
dependent on hidden side channels, it is probably the wrong change.

## Development Philosophy

This project prefers:

- DX over ceremony
- behavior over architecture theater
- explicit boundaries over clever coupling
- local-first operation over network dependency
- boring default flows over impressive internals
- explicit semantics at governance boundaries

In practice, that means:

- keep commands and pages small and obvious
- keep default UX boring and legible
- keep product language free of unnecessary Git / WARP jargon
- keep AI advisory until it is explicitly adopted into governed work
- keep UI and CLI behavior honest to the same graph truth

## Architectural Principles

### Hexagonal architecture

The product should have clear boundaries between:

- domain behavior
- application / use-case orchestration
- ingress adapters such as CLI and TUI
- infrastructure such as git-warp persistence and synchronization

Do not let UI concerns leak into persistence.
Do not let storage details leak into normal UX.
Do not let XYPH meaning leak down into git-warp core.

### SOLID, pragmatically applied

Use SOLID as boundary discipline, not as a reason to create needless classes or
abstractions.

Good:

- narrow modules
- explicit seams
- dependency inversion around important adapters

Bad:

- abstraction for its own sake
- indirection before there is pressure for it
- “clean architecture” rituals that slow delivery without protecting behavior

## Current Active Plan

XYPH is currently following the sovereign-ontology redesign documented in `docs/plans/sovereign-ontology-current.md`.

Use that plan, plus the canonical docs in `docs/canonical/`, as the current direction of travel. In particular:
- XYPH is moving toward an observer-native, worldline-native control plane
- observer profiles do **not** grant authority by existing
- conflict and counterfactual substrate facts are being pushed down into git-warp instead of being re-invented in XYPH

If older workflow guidance in this file conflicts with the current redesign, the plan doc and canonical docs win.

## Development Cycle Loop

XYPH uses an explicit development-cycle loop inspired by IBM Design Thinking, but
adapted to XYPH's actual invariants: hexagonal architecture, graph-as-plan,
governance as a product surface, and provenance visibility.

For bounded product or debt work, the default loop is:

1. **Design docs first**
2. **Acceptance tests as spec second**
3. **Implementation third**
4. **Retrospective**
5. **Rewrite the root README to reflect reality**
6. **Close the cycle**

The slice is not done because code landed. It is done when:

- the relevant human or agent sponsor actor can do their job better
- the behavior is captured in executable tests
- the docs reflect what is now true

### Tests Are The Spec

XYPH follows a hard rule:

- design docs define intent and invariants
- executable tests define the behavioral spec
- implementation follows

There is no separate prose-spec layer between design and tests.

For cycle-scale behavior:

- acceptance tests live under `test/acceptance/`
- reusable fixtures live under `test/fixtures/`
- lower-level unit and integration tests remain organized by architecture

Until older tests are migrated, existing unit/integration tests elsewhere in
`test/` remain valid. New cycle-level behavioral spec should follow the
acceptance hierarchy described in [`/Users/james/git/xyph/test/acceptance/README.md`](test/acceptance/README.md).

### Cycle Closeout And Reset

Closing a cycle does **not** mean immediately starting the next design doc.

After the cycle is merged, released when appropriate, and closed, the **first**
move before writing the next cycle design docs is:

1. reconcile the graph backlog
2. add work discovered during the cycle
3. add retrospective fallout
4. add worthwhile COOL IDEAS™
5. triage and reconcile the backlog against current reality

That reconciliation step may produce:

- the next major outcome milestone
- one or more smaller debt-reduction cycles
- cleanup or simplification cycles between larger releases

This is intentional. XYPH should not roll blindly from one cycle into the next
while tech debt, product drift, or newly discovered work piles up off to the
side.

### Development Standard

When in doubt:

- choose less structure
- choose lower latency
- choose fewer fields
- choose local-first
- choose behavior over architecture theater
- keep it boring

These defaults do **not** override XYPH's invariants. At governance and
provenance boundaries, prefer explicit semantics over clever compression.

## Product Management Philosophy

XYPH uses IBM Design Thinking style framing for cycle design:

- sponsor actors
- hills
- playbacks
- explicit invariants and non-goals

Cycles should be grounded in operator and agent value, not backend vanity.

Before promoting a new direction, ask:

- which hill does this support?
- which sponsor actor improves?
- what trust, orientation, or lawful action gets easier?
- does this preserve graph truth, governance, and provenance?

If the answer is unclear, the work probably belongs in the backlog, not in the
active cycle.

## Project Planning

XYPH plans and tracks its own development through the WARP graph. The `xyph-actuator.ts` CLI is the single source of truth for what's been done, what's next, and what's in the backlog.

**Before you start working**, check the graph:

```bash
# What's the current roadmap?
npx tsx xyph-actuator.ts status --view roadmap

# What's in the triage inbox?
npx tsx xyph-actuator.ts status --view inbox

# See every node in the graph
npx tsx xyph-actuator.ts status --view all
```

**When you want to add work**, write it to the graph:

```bash
# Suggest a task for triage
npx tsx xyph-actuator.ts inbox task:MY-001 \
  --title "Proposed feature" --suggested-by human.yourname

# Declare a sovereign Intent (required root for all quests)
npx tsx xyph-actuator.ts intent intent:MY-001 \
  --title "Why this work matters" --requested-by human.yourname

# Promote an inbox task to the backlog
npx tsx xyph-actuator.ts promote task:MY-001 --intent intent:MY-001
```

All planning, prioritization, and progress tracking flows through the actuator. Don't plan outside the system — the graph is the plan.

## Build Order

The expected order of work is:

1. write or revise design docs first
2. encode behavior as executable tests second
3. implement third

Tests are the spec.

Do not insert a second prose-spec layer between design and tests.
Do not treat implementation details as the primary unit of correctness.

## Quest Workflow

1. **Check the graph** to find work or add new tasks.
2. **Claim a quest** with `xyph-actuator.ts claim <id>`.
3. **Do the work** on a feature branch.
4. **Submit for review** with `xyph-actuator.ts submit <quest-id> --description "..."`.
5. **Get reviewed** — reviewers use `xyph-actuator.ts review <patchset-id> --verdict approve --comment "..."`.
6. **Merge** with `xyph-actuator.ts merge <submission-id> --rationale "..."` (auto-seals quest).

For solo work without review, you can still **seal directly** with `xyph-actuator.ts seal <id> --artifact <hash> --rationale "..."`.

![Development workflow](docs/diagrams/contribution-workflow.svg)

## Quality Gates

Before opening or updating a PR, or before pushing a working branch, **always** run:

```bash
npm run build    # Verify TypeScript compilation
npm test         # Run full test suite
```

Never push code that doesn't pass both checks.

- Do not use `--no-verify` to skip git hooks.
- Do not use `eslint-disable` comments to silence lint rules.
- Do not use `@ts-ignore` or `@ts-expect-error` to silence TypeScript.
- If you encounter lint errors, test failures, or warnings — even pre-existing ones — fix them. Leave the codebase better than you found it.

## Release Discipline

Milestone closure and release discipline are coupled.

Rules:

- keep the root [`CHANGELOG.md`](CHANGELOG.md) current
- when a milestone closes and results in a release, bump the package version on
  the release commit
- create a Git tag on the commit that lands on `main` for that milestone
  release

The version and tag should reflect milestone reality, not aspirational scope.

## Testing Rules

Tests must be deterministic.

That means:

- no real network dependency in the core suite
- no ambient home-directory state assumptions
- no ambient Git config assumptions
- no interactive shell expectations
- no timing-based flakes

Prefer:

- isolated temp graph state
- fixed env and fixed IDs where practical
- graph-backed scenarios that pin user-visible behavior

Tests should pin:

- user-visible behavior
- governance semantics
- provenance visibility
- machine-readable agent behavior
- substrate/application boundary honesty

They should not overfit:

- class layout
- file-private helpers
- incidental implementation structure

## Diagrams

Documentation diagrams live in `docs/diagrams/` as Mermaid source (`.mmd`) pre-rendered to SVG. Markdown files reference the SVGs directly — no inline Mermaid code fences.

**To add or edit a diagram:**

```bash
# Edit (or create) the Mermaid source
vim docs/diagrams/my-diagram.mmd

# Render all diagrams to SVG (writes .svg + .sha256 sidecar)
./scripts/render-diagrams.sh

# Reference from markdown (path is relative to the .md file)
# From docs/:           ![Alt text](diagrams/my-diagram.svg)
# From docs/canonical/: ![Alt text](../diagrams/my-diagram.svg)
# From project root:    ![Alt text](docs/diagrams/my-diagram.svg)
```

**Why pre-rendered SVGs?** Inline Mermaid depends on the viewer's renderer — GitHub, Obsidian, and VS Code all have different Mermaid versions with different feature support. Pre-rendered SVGs look identical everywhere.

**Security note:** `@mermaid-js/mermaid-cli` is intentionally kept as a `devDependency` and is used only to render local `.mmd` sources into committed SVGs. If `npm audit` reports transitive Mermaid/Puppeteer ZIP-parsing findings, treat them as docs-tooling risk unless XYPH starts processing untrusted ZIP uploads through that path.

**CI enforces:**
- No inline Mermaid code fences in any `.md` file
- Every `.mmd` has a corresponding `.svg` and `.mmd.sha256`
- Source hash freshness — if you edit a `.mmd` without re-rendering, CI fails

The pre-commit hook catches inline mermaid blocks locally. The pre-push hook runs the full freshness check.

## Design Doc Accuracy

XYPH's canonical design documents (`docs/canonical/`) describe the planning compiler pipeline and domain rules. When writing or updating these docs, remember:

**git-warp is a CRDT, not a database.** The substrate has no locks, no transactions, no centralized snapshots, and no rollback. All writes go through `graph.patch()`, which produces a single atomic Git commit. Multiple writers can emit patches concurrently without coordination — convergence is deterministic.

- Use "emit a patch" or "call `graph.patch()`", not "commit a transaction".
- Use "compensating patch" (new forward-only correction via LWW), not "rollback".
- Use "domain validation before `graph.patch()`", not "optimistic concurrency check" or "snapshot precondition".
- Use `graph.traverse.weightedLongestPath()` for critical path, not Dijkstra (which finds shortest paths).
- Never describe userland graph algorithms — reference `graph.traverse.*` primitives.

If a design doc contradicts how git-warp actually works, the doc is wrong — fix it. Always cross-reference against the [git-warp README](https://github.com/git-stunts/git-warp) and ARCHITECTURE.md for ground truth.

## Constitution

Every mutation must obey the [CONSTITUTION.md](docs/canonical/CONSTITUTION.md). Key rules:

- Every quest must trace back to a human-declared `intent:` node (Art. IV).
- No cycles in the dependency graph (Art. II).
- Critical path changes require an ApprovalGate signed by a human (Art. IV.2).

## Command Reference

| Command | Description |
|---------|-------------|
| `status --view <roadmap\|lineage\|all\|inbox\|submissions>` | View the roadmap state |
| `quest <id> --title "..." --campaign <id> --intent <id>` | Initialize a Quest |
| `intent <id> --title "..." --requested-by human.<name>` | Declare a sovereign Intent |
| `claim <id>` | Volunteer for a task (OCP) |
| `submit <quest-id> --description "..."` | Submit quest for review |
| `revise <submission-id> --description "..."` | Push new patchset superseding tip |
| `review <patchset-id> --verdict <v> --comment "..."` | Review: approve, request-changes, comment |
| `merge <submission-id> --rationale "..."` | Merge (git settlement + auto-seal) |
| `close <submission-id> --rationale "..."` | Close submission without merging |
| `seal <id> --artifact <hash> --rationale "..."` | Mark as DONE directly (solo work) |
| `inbox <id> --title "..." --suggested-by <principal>` | Suggest a task for triage |
| `promote <id> --intent <id>` | Promote INBOX to BACKLOG |
| `reject <id> --rationale "..."` | Reject to GRAVEYARD |
| `audit-sovereignty` | Audit quests for missing intent lineage |
| `generate-key` | Generate an Ed25519 Guild Seal keypair |

All commands are run via `npx tsx xyph-actuator.ts <command>`.

## What To Read First

Before making non-trivial changes, read:

- [`README.md`](README.md)
- [`design/README.md`](design/README.md)
- [`design/hills.md`](design/hills.md)
- [`design/playbacks.md`](design/playbacks.md)
- [`design/product-model.md`](design/product-model.md)
- [`docs/canonical/ARCHITECTURE.md`](docs/canonical/ARCHITECTURE.md)
- [`docs/canonical/AGENT_PROTOCOL.md`](docs/canonical/AGENT_PROTOCOL.md)
- [`docs/plans/sovereign-ontology-current.md`](docs/plans/sovereign-ontology-current.md)

Then inspect the graph via `status`, the dashboard, or the canonical API
surface. XYPH planning truth lives in the graph, not in a parallel markdown
backlog.

## Git Workflow

Prefer small, honest commits.

Do not rewrite shared history casually.
Prefer additive commits over history surgery.
Prefer merges over rebases for shared collaboration unless there is a
compelling, explicitly discussed reason otherwise.

The point is not aesthetic Git history. The point is trustworthy collaboration.

## Decision Rule

When in doubt:

- choose less structure
- choose lower latency
- choose fewer fields
- choose local-first
- choose behavior over architecture
- keep it boring
- choose explicit semantics at governance boundaries
