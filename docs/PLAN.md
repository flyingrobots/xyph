# XYPH Bring-Up Plan: Make the Existing Alpha Honest, Operable, and Then Spec-Complete

## Summary

XYPH is already a real alpha product, but it is not yet “up to spec” in the sense its canonical docs promise.

Current state, based on the repo and its own `--json` status output:
- Build, lint, and tests are green: 56 test files, 732 tests passing.
- Core runtime works: Git-backed graph, CLI, TUI, dependency analysis, submission lifecycle, merge/seal flow, and a traceability model in code.
- Self-tracked graph says 69 quests are `DONE`, 24 are `PLANNED`, and 129 are still `BACKLOG`.
- 7 of 13 campaigns are marked `DONE`, but at least some campaign statuses are stale and not credible relative to quest reality.
- 59 scrolls exist, but only 1 is actually cryptographically signed.
- The self-graph has 0 stories, 0 requirements, 0 criteria, 0 evidence, and 0 suggestions, so the traceability system exists in code but is not yet dogfooded.
- `audit-sovereignty --json` reports 51 violations, which means the repo is not obeying its own intent-lineage story consistently.
- The planning-compiler spec is only partially implemented. The missing weight is in ORACLE/FORGE: classification, policy engine, merge planning, emit/apply, and end-to-end compiler artifacts.

My completeness estimate:
- Product alpha completeness: 60-65%
- Canonical spec completeness: 30-35%
- Self-dogfooding / “truthfulness of its own graph”: 20-25%

## Key Product Decisions

- Optimize for product integrity first, not literal spec completion first. The repo is already useful as a graph-native coordination tool; the fastest path to credibility is making the current system truthful and self-hosting.
- Freeze the status semantics now: `BACKLOG` is unauthorized triage; `PLANNED`, `IN_PROGRESS`, `BLOCKED`, and `DONE` are authorized work. Do not reintroduce a second inbox state. Fix the audits and docs to match this.
- Stop treating stored campaign status as authoritative. Compute campaign status from member quests and show only derived values in CLI/TUI.
- Treat `--json` CLI as the automation API for v1. Do not build a local REST/socket API before the CLI contract is stable.
- Keep direct user-driven CLI mutations for manual workflows. Build the compiler pipeline as a second path for ingest/planning, not as an immediate rewrite of every manual command.
- Defer ecosystem and vanity features until core integrity is fixed. That means no Web UI, IDE plugin, MCP server, graph explorer, or heavy TUI redesign work until the graph model, traceability, and compiler path are trustworthy.

## Milestone Schedule

### Milestone 0 — Truth Repair and Dogfood Hygiene
Target: 1 week

- Remove read-path write behavior and warnings from normal inspection flows. `status --json` should not emit checkpoint failures during routine reads.
- Make sovereignty rules consistent with actual workflow. Audit only authorized work, not triage-only backlog items.
- Backfill or relabel the current self-tracked graph so the repo no longer reports obvious constitutional violations.
- Compute campaign status from quests and ignore stale stored campaign status for display and reporting.
- Surface signature state clearly and require agent key setup for all new seal/merge operations in non-dev workflows.

Exit criteria:
- `audit-sovereignty --json` is green for all authorized work.
- `status --json` runs without checkpoint warnings.
- Campaign status in CLI/TUI matches quest reality.
- All new scrolls are signed by default.

### Milestone 1 — CLI Foundation v1
Target: 2 weeks

- Ship a real `xyph` binary entrypoint and normalize command ergonomics.
- Implement identity resolution with explicit precedence: `--as`, env, repo config, user config, fallback default.
- Add `whoami`, `login`, `logout`, and a full `show/context` inspection path so agents and humans can bootstrap work without reading raw graph dumps.
- Make JSON output a stable v1 contract across all user-facing commands.
- Fix workflow gaps in promote/reject/history/status so provenance is complete and scriptable.
- Harden merge/workspace behavior so graph validation and Git settlement fail more predictably.

Exit criteria:
- A human or agent can bootstrap, inspect, claim, submit, review, and settle work using only the CLI and `--json`.
- JSON output is stable enough to support CI and agent automation.

### Milestone 2 — Traceability v1 That Is Actually Used
Target: 2 weeks

- Finish the missing traceability pieces: policy nodes, governed campaigns, computed coverage queries, and campaign-level definition-of-done checks.
- Dogfood traceability on this repo itself. Start with `CLITOOL` and `FORGE`, not the whole graph.
- Require stories/requirements/criteria/evidence for governed campaigns only. Do not hard-gate the whole repo at once.
- Wire `scan`/`analyze` into CI for governed campaigns so evidence is generated and reviewed continuously.
- Expose coverage and unmet criteria in CLI/TUI status.

Exit criteria:
- Self-graph contains non-zero stories, requirements, criteria, and evidence.
- At least one campaign is governed by real traceability policy.
- Seal/merge is blocked when governed work lacks required evidence.

### Milestone 3 — ORACLE + FORGE Compiler Path
Target: 3 weeks

- Implement the missing compiler phases in the planning path: classify, validate, merge planning, schedule, review, emit, apply.
- Reuse the existing signed patch-ops validator as the compiler IR validation layer instead of inventing a second artifact system.
- Emit typed artifacts and audit records for each phase, but keep manual command flows intact.
- Restrict APPLY semantics to compiler-driven planning operations; manual graph edits remain separate and explicit.
- Add one real end-to-end compiler flow on the self-repo: ingest structured planning input, emit patch artifact, validate, apply, and audit.

Exit criteria:
- One supported compiler path runs end to end from ingest to apply.
- Artifacts and audit nodes are durable and queryable.
- The canonical FORGE story is no longer mostly doc-only.

### Milestone 4 — Agent Protocol and TUI Operationalization
Target: 2 weeks

- Build the useful agent-facing commands first: `briefing`, `context`, `submissions`, `review`, `submit`, and `handoff`.
- Add the minimum TUI surfaces needed for real ops: suggestions, graveyard, alerts, traceability coverage, and signature/health indicators.
- Do not prioritize overview redesign chains, chord-mode polish, or visual experiments ahead of workflow closure.
- Make self-hosting explicit: the repo must be able to plan and drive itself via XYPH without outside spreadsheets/docs.

Exit criteria:
- An agent can enter the repo cold, ask the CLI for context, find work, submit, review, and hand off.
- TUI surfaces the operational state that matters, not just pretty summaries.

### Milestone 5 — Ecosystem and Expansion
Target: later, after v1 core is stable

- MCP server
- Web UI
- IDE integrations
- Time-travel and provenance explorer features (`diff`, `seek`, `slice`, graph explorer)
- Multi-user proof and large-graph scaling work

These are valuable, but they should not block v1 credibility.

## Missing Features to Call Out Explicitly

- Spec/runtime mismatch around sovereignty and backlog semantics
- Derived campaign status and truthful milestone reporting
- Stable CLI identity model and packaging
- Stable JSON automation contract
- Real self-hosted traceability data
- Governed definition-of-done enforcement
- Compiler phases ORACLE/FORGE
- Durable audit artifacts for compiler path
- Agent protocol beyond a few early commands
- Default cryptographic signing discipline for scrolls

## Test and Acceptance Plan

- Keep build, lint, and full test suite green on every milestone.
- Add CI assertions that use the product’s own `--json` output:
  - sovereignty audit passes for authorized work
  - campaign status is derived and consistent
  - governed campaigns have non-zero traceability coverage
  - new scrolls are signed
- Add end-to-end tests for:
  - triage to promoted work with correct intent lineage
  - submit/revise/review/merge with full provenance
  - governed traceability gate on seal/merge
  - compiler ingest → emit → apply → audit flow
- Add golden tests for JSON envelopes so agent integrations do not drift.
- Add a self-hosting acceptance check: the repo can represent and advance its own roadmap without external bookkeeping.

## Assumptions and Defaults

- Schedule assumes one strong maintainer with AI assistance. Two engineers can roughly halve calendar time.
- The zero-hour estimates in the graph are not trustworthy planning inputs; milestone scheduling here is based on implementation risk, not current quest hour fields.
- `BACKLOG` remains the triage bucket. I would not reintroduce `INBOX`.
- REST/socket APIs are deferred; CLI `--json` is the supported automation surface for v1.
- Manual CLI mutations remain supported. The compiler path is additive, not a rewrite of the whole product.
- If forced to cut scope, I would cut ecosystem/UI polish first, not traceability or compiler bring-up.
