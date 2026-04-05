# XYPH Backlog Triage Worksheet

Generated: 2026-04-04

Total quests: 158

## Action Legend

| Action | Meaning |
|--------|---------|
| **SEAL** | Already done. Seal it. |
| **KEEP** | Relevant. Needs a proper backlog doc, then assign to legend. |
| **MERGE** | Combine with related quests into one cycle. |
| **RETHINK** | Scope, framing, or relevance has shifted. Needs redesign. |
| **SPLIT** | Too big. Break into focused pieces. |
| **CUT** | Irrelevant, superseded, or too vague to reconstruct. Graveyard. |

## Summary

| Action | Count |
|--------|-------|
| SEAL | 9 |
| KEEP | 65 |
| MERGE | 24 |
| RETHINK | 23 |
| CUT | 37 |

---

## WARP (2)

| ID | Title | Guess Description | Action (Claude) | Claude Remarks | Action (James) | James Remarks |
|-----|-------|-------------------|-----------------|----------------|----------------|---------------|
| `task:multi-user-proof` | Multi-user proof: 5+ concurrent writers across network boundaries, demonstrate convergence (Docker compose testbed) | 5+ concurrent writers across network boundaries, prove convergence. | **KEEP** | KEEP — this is a real proving ground for invariant:deterministic-convergence. But it's far out. | | |
| `task:auto-graph-push-hook` | Post-push hook: auto-push WARP writer refs after git push | (from title) Post-push hook: auto-push WARP writer refs after git push | **CUT** | No description — title only. Cannot pull into a cycle without reconstructing the original context and motivation. | | |

---

## GOV (11)

| ID | Title | Guess Description | Action (Claude) | Claude Remarks | Action (James) | James Remarks |
|-----|-------|-------------------|-----------------|----------------|----------------|---------------|
| `task:case-driven-governance` | Case-driven shape governance | Case-driven shape governance with case: prefix entities. | **SEAL** | DONE. case: prefix active throughout. Agent case flow implemented. | | |
| `task:DOCS-AUDIT` | Audit and consolidate the docs/ directory — 41 markdown files with unclear authority | Audit 41 markdown files in docs/ for currency, authority, and drift. Consolidate overlapping docs, graveyard stale ones, decide what moves into the graph. | **KEEP** | Has description (154 chars). Legend: GOV. Review for continued relevance under METHOD adoption. | | |
| `task:TRC-009` | Policy node type + governs edge: Definition of Done rules per campaign | Add a policy node type and governs edge so campaigns can declare explicit Definition of Done rules. | **KEEP** | Has description (99 chars). Legend: GOV. Review for continued relevance under METHOD adoption. References campaigns/milestones — may need updating for legends. | | |
| `task:TRC-011` | Enforce Definition of Done in seal/merge: reject if criteria unmet | Reject seal and merge when governed criteria are missing, linked-only, or failing, so settlement reflects real Definition of Done state. | **KEEP** | Has description (136 chars). Legend: GOV. Review for continued relevance under METHOD adoption. | | |
| `task:BX-006` | Sovereignty gate: TTY + /dev/tty confirmation for human-only commands (intent, promote, reject, reopen, quest) | TTY confirmation gate for human-only commands. | **RETHINK** | RETHINK — invariant:principal-general-authority says authority is not species-based. "Human-only commands" may violate this. | | |
| `task:ORC-001` | CLASSIFY phase — intent classification + complexity/risk inference | CLASSIFY phase — intent classification + complexity/risk inference | **RETHINK** | Oracle pipeline predates METHOD adoption. Intent classification, policy engine, merge detection, anti-chain generation — these need rethinking in light of legends, invariants, and cycles. | | |
| `task:ORC-002` | Full MUST/SHOULD/COULD policy engine (VALIDATE phase) | Full MUST/SHOULD/COULD policy engine (VALIDATE phase) | **RETHINK** | Oracle pipeline predates METHOD adoption. Intent classification, policy engine, merge detection, anti-chain generation — these need rethinking in light of legends, invariants, and cycles. | | |
| `task:ORC-003` | MERGE phase — candidate vs. snapshot collision detection + merge ops | MERGE phase — candidate vs. snapshot collision detection + merge ops | **RETHINK** | Oracle pipeline predates METHOD adoption. Intent classification, policy engine, merge detection, anti-chain generation — these need rethinking in light of legends, invariants, and cycles. | | |
| `task:ORC-004` | Anti-chain generation — parallel lane partitioning via graph.traverse.levels() | Anti-chain generation — parallel lane partitioning via graph.traverse.levels() | **RETHINK** | Oracle pipeline predates METHOD adoption. Intent classification, policy engine, merge detection, anti-chain generation — these need rethinking in light of legends, invariants, and cycles. | | |
| `task:principal-capability-model` | Principal-general authority and delegated capability model | Define principal-general authority and delegated capability model. | **RETHINK** | invariant:principal-general-authority now declares this as a project truth. But the implementation (capability grants, delegation contracts) is not built. | | |
| `task:KSP-001` | Transactional KeyringStoragePort API | (from title) Transactional KeyringStoragePort API | **CUT** | No description — title only. Cannot pull into a cycle without reconstructing the original context and motivation. | | |

---

## SURF (117)

| ID | Title | Guess Description | Action (Claude) | Claude Remarks | Action (James) | James Remarks |
|-----|-------|-------------------|-----------------|----------------|----------------|---------------|
| `task:AGT-009` | Comment command: agents and humans can add comments to any entity (quest, submission, intent) | Comment command for agents and humans on any entity. | **SEAL** | DONE. src/cli/commands/show.ts line 292. comment <id> with --on, --message. | | |
| `task:agent-context` | xyph context <id>: full quest context dump — intent lineage, deps, submissions, siblings (--json) | Full quest context dump via xyph context <id>. | **SEAL** | DONE. src/cli/commands/agent.ts line 785. JSON output supported. | | |
| `task:agent-handoff` | xyph handoff: end-of-session summary, auto-detect patches, textarea() notes, write handoff node | End-of-session handoff note via xyph handoff. | **SEAL** | DONE. src/cli/commands/agent.ts line 927. JSON output supported. | | |
| `task:cli-api` | API layer: --json output mode for CLI scriptability + local REST/socket API for external consumers | --json output mode for all CLI commands. | **SEAL** | DONE. Global --json flag in xyph-actuator.ts. Used everywhere. | | |
| `task:cli-move` | xyph move <quest> --campaign <id>: reassign quest to different campaign | Reassign quest to different campaign via xyph move. | **SEAL** | DONE. src/cli/commands/link.ts line 78. Works with --campaign. | | |
| `task:cli-show` | xyph show <id>: full entity inspection — status, campaign, intent, deps, submissions, provenance | Full entity inspection via xyph show <id> with JSON output. | **SEAL** | DONE. src/cli/commands/show.ts implements this. Tests exist. | | |
| `task:AGT-004` | Agent act command: validated action execution with dry-run and structured response | (from title) Agent act command: validated action execution with dry-run and structured response | **KEEP** | No description but title is detailed enough to reconstruct intent. Needs a proper METHOD-style backlog doc (problem, rationale, files, effort) before it can be pulled into a cycle. Legend: SURF. | | |
| `task:AGT-008` | Enhanced inbox command: add --description and --labels for richer agent suggestions and bug reports | (from title) Enhanced inbox command: add --description and --labels for richer agent suggestions and bug reports | **KEEP** | No description but title is detailed enough to reconstruct intent. Needs a proper METHOD-style backlog doc (problem, rationale, files, effort) before it can be pulled into a cycle. Legend: SURF. | | |
| `task:AGT-010` | Flag command: mark entities for human attention with reason, visible in dashboard alerts | (from title) Flag command: mark entities for human attention with reason, visible in dashboard alerts | **KEEP** | No description but title is detailed enough to reconstruct intent. Needs a proper METHOD-style backlog doc (problem, rationale, files, effort) before it can be pulled into a cycle. Legend: SURF. | | |
| `task:AGT-011` | Agent submissions command: structured view of reviewable and owned submissions with actions | (from title) Agent submissions command: structured view of reviewable and owned submissions with actions | **KEEP** | No description but title is detailed enough to reconstruct intent. Needs a proper METHOD-style backlog doc (problem, rationale, files, effort) before it can be pulled into a cycle. Legend: SURF. | | |
| `task:AGT-012` | Agent review command: structured review with pre-validation and status effect feedback | (from title) Agent review command: structured review with pre-validation and status effect feedback | **KEEP** | No description but title is detailed enough to reconstruct intent. Needs a proper METHOD-style backlog doc (problem, rationale, files, effort) before it can be pulled into a cycle. Legend: SURF. | | |
| `task:BX-008` | xyph status positional subcommand: xyph status [roadmap\|lineage\|all\|inbox] with --graveyard flag | (from title) xyph status positional subcommand: xyph status [roadmap\|lineage\|all\|inbox] with --graveyard flag | **KEEP** | No description but title is detailed enough to reconstruct intent. Needs a proper METHOD-style backlog doc (problem, rationale, files, effort) before it can be pulled into a cycle. Legend: SURF. | | |
| `task:BX-010` | TUI h key: entity timeline modal available from any view (Roadmap, Lineage, Inbox, AllNodes) | (from title) TUI h key: entity timeline modal available from any view (Roadmap, Lineage, Inbox, AllNodes) | **KEEP** | No description but title is detailed enough to reconstruct intent. Needs a proper METHOD-style backlog doc (problem, rationale, files, effort) before it can be pulled into a cycle. Legend: SURF. | | |
| `task:BX-011` | xyph receipts <id>: show tick receipts — which ops won/lost LWW with writer IDs and lamport ticks | (from title) xyph receipts <id>: show tick receipts — which ops won/lost LWW with writer IDs and lamport ticks | **KEEP** | No description but title is detailed enough to reconstruct intent. Needs a proper METHOD-style backlog doc (problem, rationale, files, effort) before it can be pulled into a cycle. Legend: SURF. | | |
| `task:BX-012` | xyph seek --tick N / --latest: materialize graph at lamport ceiling via SeekCache | (from title) xyph seek --tick N / --latest: materialize graph at lamport ceiling via SeekCache | **KEEP** | No description but title is detailed enough to reconstruct intent. Needs a proper METHOD-style backlog doc (problem, rationale, files, effort) before it can be pulled into a cycle. Legend: SURF. | | |
| `task:BX-013` | TUI LIVE/PINNED mode: visual indicator in top bar, hard-disable mutations when pinned | (from title) TUI LIVE/PINNED mode: visual indicator in top bar, hard-disable mutations when pinned | **KEEP** | No description but title is detailed enough to reconstruct intent. Needs a proper METHOD-style backlog doc (problem, rationale, files, effort) before it can be pulled into a cycle. Legend: SURF. | | |
| `task:BX-015` | xyph slice <id>: holographic slice via materializeSlice(nodeId) — backward causal cone | (from title) xyph slice <id>: holographic slice via materializeSlice(nodeId) — backward causal cone | **KEEP** | No description but title is detailed enough to reconstruct intent. Needs a proper METHOD-style backlog doc (problem, rationale, files, effort) before it can be pulled into a cycle. Legend: SURF. | | |
| `task:DSH-006` | Show "last refreshed HH:MM:SS" timestamp in dashboard tab bar | Show the last refresh timestamp in the dashboard tab bar so operators can tell when the current snapshot was fetched. | **KEEP** | Has description (117 chars). Legend: SURF. Review for continued relevance under METHOD adoption. | | |
| `task:DSH-008` | RoadmapView: typeahead search/filter — type to filter quests by title or ID | Add typeahead filtering in RoadmapView so typing narrows quests by title or quest ID. | **KEEP** | Has description (85 chars). Legend: SURF. Review for continued relevance under METHOD adoption. | | |
| `task:DSH-009` | Dashboard: g key toggles GRAVEYARD visibility across all views | Add a g-key toggle that controls GRAVEYARD visibility consistently across dashboard views. | **KEEP** | Has description (90 chars). Legend: SURF. Review for continued relevance under METHOD adoption. | | |
| `task:SUB-CLI-001` | Add xyph diff <submission-id> command — show git diff for a submission tip patchset | (from title) Add xyph diff <submission-id> command — show git diff for a submission tip patchset | **KEEP** | No description but title is detailed enough to reconstruct intent. Needs a proper METHOD-style backlog doc (problem, rationale, files, effort) before it can be pulled into a cycle. Legend: SURF. | | |
| `task:SUB-CLI-002` | Add xyph timeline <submission-id> — chronological event log (submitted, reviewed, revised, merged) | (from title) Add xyph timeline <submission-id> — chronological event log (submitted, reviewed, revised, merged) | **KEEP** | No description but title is detailed enough to reconstruct intent. Needs a proper METHOD-style backlog doc (problem, rationale, files, effort) before it can be pulled into a cycle. Legend: SURF. | | |
| `task:SUB-ID-001` | Replace generateId() with proper ULID library — current base36 timestamps are not monotonically sortable | (from title) Replace generateId() with proper ULID library — current base36 timestamps are not monotonically sortable | **KEEP** | No description but title is detailed enough to reconstruct intent. Needs a proper METHOD-style backlog doc (problem, rationale, files, effort) before it can be pulled into a cycle. Legend: SURF. | | |
| `task:SUB-PERF-001` | WarpSubmissionAdapter.getOpenSubmissionsForQuest scans all nodes — add edge-based index | (from title) WarpSubmissionAdapter.getOpenSubmissionsForQuest scans all nodes — add edge-based index | **KEEP** | No description but title is detailed enough to reconstruct intent. Needs a proper METHOD-style backlog doc (problem, rationale, files, effort) before it can be pulled into a cycle. Legend: SURF. | | |
| `task:SUB-SAFETY-001` | GitWorkspaceAdapter.merge mutates worktree (git checkout + merge) — warn user or use plumbing-only strategy | (from title) GitWorkspaceAdapter.merge mutates worktree (git checkout + merge) — warn user or use plumbing-only strategy | **KEEP** | No description but title is detailed enough to reconstruct intent. Needs a proper METHOD-style backlog doc (problem, rationale, files, effort) before it can be pulled into a cycle. Legend: SURF. | | |
| `task:SUB-SCHEMA-001` | decision: prefix collision — pre-existing concept/decision nodes share prefix with submission decision nodes (type discriminates but latent risk) | (from title) decision: prefix collision — pre-existing concept/decision nodes share prefix with submission decision nodes (type discriminates but latent risk) | **KEEP** | No description but title is detailed enough to reconstruct intent. Needs a proper METHOD-style backlog doc (problem, rationale, files, effort) before it can be pulled into a cycle. Legend: SURF. | | |
| `task:TRC-012` | Constraint, assumption, risk, spike node types + actuator commands | Add constraint, assumption, risk, and spike node types with actuator commands so traceability can capture planning qualifiers and uncertainty explicitly. | **KEEP** | Has description (153 chars). Legend: SURF. Review for continued relevance under METHOD adoption. | | |
| `task:TRC-013` | Gap detection + risk analysis queries: what is untested, what is at risk | Add gap-detection and risk-analysis queries so the graph can report what remains untested or at risk. | **KEEP** | Has description (101 chars). Legend: SURF. Review for continued relevance under METHOD adoption. | | |
| `task:agent-cli-identity-gate` | Enforce agent identity on agent-native CLI commands | Require agent-native operational commands like briefing, next, act, and handoff to default to agent.* identities. Keep shared inspection surfaces like status, show, and likely context universal, or require an explicit override for human read-only access. This closes the current boundary leak where human.* identities can execute agent-oriented control-plane commands by accident. | **KEEP** | Has description (380 chars). Legend: SURF. Review for continued relevance under METHOD adoption. | | |
| `task:benchmark-large-graphs` | Benchmarks: materialize/query perf at 10k+ nodes, identify scaling bottlenecks in syncCoverage and DAG traversal | (from title) Benchmarks: materialize/query perf at 10k+ nodes, identify scaling bottlenecks in syncCoverage and DAG traversal | **KEEP** | No description but title is detailed enough to reconstruct intent. Needs a proper METHOD-style backlog doc (problem, rationale, files, effort) before it can be pulled into a cycle. Legend: SURF. | | |
| `task:cli-assign` | xyph assign <quest> <principal>: directed work assignment (complements self-claim) | (from title) xyph assign <quest> <principal>: directed work assignment (complements self-claim) | **KEEP** | No description but title is detailed enough to reconstruct intent. Needs a proper METHOD-style backlog doc (problem, rationale, files, effort) before it can be pulled into a cycle. Legend: SURF. | | |
| `task:cli-diff` | xyph diff [--since <tick\|duration>]: graph-level change detection — sealed, status changes, new items | (from title) xyph diff [--since <tick\|duration>]: graph-level change detection — sealed, status changes, new items | **KEEP** | No description but title is detailed enough to reconstruct intent. Needs a proper METHOD-style backlog doc (problem, rationale, files, effort) before it can be pulled into a cycle. Legend: SURF. | | |
| `task:cli-fuzzy-claim` | Interactive xyph claim/depend with bijou filter() over computeFrontier() — fuzzy task search | (from title) Interactive xyph claim/depend with bijou filter() over computeFrontier() — fuzzy task search | **KEEP** | No description but title is detailed enough to reconstruct intent. Needs a proper METHOD-style backlog doc (problem, rationale, files, effort) before it can be pulled into a cycle. Legend: SURF. | | |
| `task:cli-plan` | xyph plan <campaign>: execution plan with frontier, blocked, critical path, progress per campaign | (from title) xyph plan <campaign>: execution plan with frontier, blocked, critical path, progress per campaign | **KEEP** | No description but title is detailed enough to reconstruct intent. Needs a proper METHOD-style backlog doc (problem, rationale, files, effort) before it can be pulled into a cycle. Legend: SURF. | | |
| `task:confirm-overlay-integration-test` | Integration test: confirm overlay renders in view() from landing/help | (from title) Integration test: confirm overlay renders in view() from landing/help | **KEEP** | Small test task. Title is self-describing — write a failing test for the described behavior. Legend: SURF. | | |
| `task:coverage-threshold` | CI: configure @vitest/coverage-v8 with ratcheting threshold (never allow coverage regression) | (from title) CI: configure @vitest/coverage-v8 with ratcheting threshold (never allow coverage regression) | **KEEP** | No description but title is detailed enough to reconstruct intent. Needs a proper METHOD-style backlog doc (problem, rationale, files, effort) before it can be pulled into a cycle. Legend: SURF. | | |
| `task:cross-adapter-test-stability` | Increase CrossAdapterVisibility test timeout or run integration tests sequentially | (from title) Increase CrossAdapterVisibility test timeout or run integration tests sequentially | **KEEP** | No description but title is detailed enough to reconstruct intent. Needs a proper METHOD-style backlog doc (problem, rationale, files, effort) before it can be pulled into a cycle. Legend: SURF. | | |
| `task:dag-visualization` | DAG visualization: SVG via Graphviz, ASCII for terminal, Mermaid for PR embeds, interactive explorer for web UI | (from title) DAG visualization: SVG via Graphviz, ASCII for terminal, Mermaid for PR embeds, interactive explorer for web UI | **KEEP** | No description but title is detailed enough to reconstruct intent. Needs a proper METHOD-style backlog doc (problem, rationale, files, effort) before it can be pulled into a cycle. Legend: SURF. | | |
| `task:dashboard-adapter-error-isolation` | Add per-node error logging to WarpDashboardAdapter batch fetches (log which node ID failed) | (from title) Add per-node error logging to WarpDashboardAdapter batch fetches (log which node ID failed) | **KEEP** | No description but title is detailed enough to reconstruct intent. Needs a proper METHOD-style backlog doc (problem, rationale, files, effort) before it can be pulled into a cycle. Legend: SURF. | | |
| `task:dashboard-focus-clamp-test` | Add test for dashboard focusRow clamp after panel data shrinks on snapshot refresh | (from title) Add test for dashboard focusRow clamp after panel data shrinks on snapshot refresh | **KEEP** | No description but title is detailed enough to reconstruct intent. Needs a proper METHOD-style backlog doc (problem, rationale, files, effort) before it can be pulled into a cycle. Legend: SURF. | | |
| `task:dashboard-resize-handler` | Add terminal resize handler (SIGWINCH) to re-render dashboard on window size change | (from title) Add terminal resize handler (SIGWINCH) to re-render dashboard on window size change | **KEEP** | No description but title is detailed enough to reconstruct intent. Needs a proper METHOD-style backlog doc (problem, rationale, files, effort) before it can be pulled into a cycle. Legend: SURF. | | |
| `task:doc-tui-plan-update` | Update TUI-plan.md: mark phases 4-5 done, fix overview→dashboard rename, note bijou v0.6.0 deps satisfied | (from title) Update TUI-plan.md: mark phases 4-5 done, fix overview→dashboard rename, note bijou v0.6.0 deps satisfied | **KEEP** | No description but title is detailed enough to reconstruct intent. Needs a proper METHOD-style backlog doc (problem, rationale, files, effort) before it can be pulled into a cycle. Legend: SURF. | | |
| `task:git-hooks-lifecycle` | Git hooks integration: auto-link commits to quests, update status on push, guard against committing to sealed quests | (from title) Git hooks integration: auto-link commits to quests, update status on push, guard against committing to sealed quests | **KEEP** | No description but title is detailed enough to reconstruct intent. Needs a proper METHOD-style backlog doc (problem, rationale, files, effort) before it can be pulled into a cycle. Legend: SURF. | | |
| `task:git-warp-substrate-alignment` | Align git-warp substrate with observer/worldline model | Design and execute the substrate pivot so git-warp, not XYPH, owns worldlines, observer-relative reads, working-set ticking, transfer/collapse primitives, and related receipts. XYPH should keep policy, governance, case handling, and product-facing meaning on top of those substrate facts. | **KEEP** | Has description (288 chars). Legend: SURF. Review for continued relevance under METHOD adoption. | | |
| `task:graph-export-import` | Graph export/import: portable snapshots (JSON/CBOR) for sharing roadmap state across air-gapped environments | (from title) Graph export/import: portable snapshots (JSON/CBOR) for sharing roadmap state across air-gapped environments | **KEEP** | No description but title is detailed enough to reconstruct intent. Needs a proper METHOD-style backlog doc (problem, rationale, files, effort) before it can be pulled into a cycle. Legend: SURF. | | |
| `task:graphmeta-drop-tipsha` | Remove tipSha from GraphMeta (no longer displayed; eliminate checkpoint SHA dependency in view layer) | (from title) Remove tipSha from GraphMeta (no longer displayed; eliminate checkpoint SHA dependency in view layer) | **KEEP** | No description but title is detailed enough to reconstruct intent. Needs a proper METHOD-style backlog doc (problem, rationale, files, effort) before it can be pulled into a cycle. Legend: SURF. | | |
| `task:help-modal-warp-glossary` | Review HelpModal glossary entry for WARP — consider clarifying WARP vs XYPH distinction | (from title) Review HelpModal glossary entry for WARP — consider clarifying WARP vs XYPH distinction | **KEEP** | No description but title is detailed enough to reconstruct intent. Needs a proper METHOD-style backlog doc (problem, rationale, files, effort) before it can be pulled into a cycle. Legend: SURF. | | |
| `task:landing-shell-read-model` | Move dashboard landing shell off the broad operational snapshot | Narrow the remaining shell-level dashboard bridge after cycle 0023. The landing shell still boots from a broad operational snapshot for cross-lane counts, graph meta, drawer compatibility, and non-migrated lane fallbacks even though the Now, Review, and Suggestions lanes now use dedicated observer-backed read models. Add an explicit landing-shell read model and/or lazy snapshot split so shell chrome no longer depends on the omnibus landing snapshot by default. | **KEEP** | Has description (464 chars). Legend: SURF. Review for continued relevance under METHOD adoption. | | |
| `task:lineage-status-legend` | Add status normalization legend to lineage/status output | Add a status-normalization legend to lineage and status output so operators can interpret normalized states quickly. | **KEEP** | Has description (116 chars). Legend: SURF. Review for continued relevance under METHOD adoption. | | |
| `task:mcp-server` | MCP server: expose WARP graph as Model Context Protocol tools so AI agents can query/mutate the roadmap natively | (from title) MCP server: expose WARP graph as Model Context Protocol tools so AI agents can query/mutate the roadmap natively | **KEEP** | No description but title is detailed enough to reconstruct intent. Needs a proper METHOD-style backlog doc (problem, rationale, files, effort) before it can be pulled into a cycle. Legend: SURF. | | |
| `task:no-tui-mode` | Dashboard: offer non-interactive plain-text output mode (--no-tui) for small terminals and CI | (from title) Dashboard: offer non-interactive plain-text output mode (--no-tui) for small terminals and CI | **KEEP** | No description but title is detailed enough to reconstruct intent. Needs a proper METHOD-style backlog doc (problem, rationale, files, effort) before it can be pulled into a cycle. Legend: SURF. | | |
| `task:pr-review-autorecheck` | Add automation to re-check PR merge readiness after CodeRabbit completion | Add an automation that re-checks PR merge readiness after CodeRabbit review completes. | **KEEP** | Has description (86 chars). Legend: SURF. Review for continued relevance under METHOD adoption. | | |
| `task:status-backlog-filter` | Add backlog-only filter to status views for focused validation | Add a backlog-only filter to status views so operators can focus on validation work. | **KEEP** | Has description (84 chars). Legend: SURF. Review for continued relevance under METHOD adoption. | | |
| `task:status-raw-status-flag` | Add --raw-status flag to show unnormalized quest status values | Add a `--raw-status` flag that reveals underlying unnormalized quest status values. | **KEEP** | Has description (83 chars). Legend: SURF. Review for continued relevance under METHOD adoption. | | |
| `task:statusline-graph-health` | StatusLine: show graph health indicators (writer count, sync staleness, checkpoint age) | (from title) StatusLine: show graph health indicators (writer count, sync staleness, checkpoint age) | **KEEP** | No description but title is detailed enough to reconstruct intent. Needs a proper METHOD-style backlog doc (problem, rationale, files, effort) before it can be pulled into a cycle. Legend: SURF. | | |
| `task:terminology-lint` | CI terminology lint: flag non-guild vocabulary (task/item/issue) in user-facing strings | (from title) CI terminology lint: flag non-guild vocabulary (task/item/issue) in user-facing strings | **KEEP** | No description but title is detailed enough to reconstruct intent. Needs a proper METHOD-style backlog doc (problem, rationale, files, effort) before it can be pulled into a cycle. Legend: SURF. | | |
| `task:test-cross-type-depend` | Test: depend rejects cross-type task/campaign edges with TYPE_MISMATCH | (from title) Test: depend rejects cross-type task/campaign edges with TYPE_MISMATCH | **KEEP** | Small test task. Title is self-describing — write a failing test for the described behavior. Legend: SURF. | | |
| `task:test-frontier-zero-edges` | Test: computeFrontier with zero dep edges returns all non-DONE as frontier | (from title) Test: computeFrontier with zero dep edges returns all non-DONE as frontier | **KEEP** | Small test task. Title is self-describing — write a failing test for the described behavior. Legend: SURF. | | |
| `task:tui-chord-commands` | Vim-style chord commands via bijou createInputStack(): g+r goto roadmap, : command mode, etc. | (from title) Vim-style chord commands via bijou createInputStack(): g+r goto roadmap, : command mode, etc. | **KEEP** | No description but title is detailed enough to reconstruct intent. Needs a proper METHOD-style backlog doc (problem, rationale, files, effort) before it can be pulled into a cycle. Legend: SURF. | | |
| `task:tui-logger-unit-tests` | Add unit tests for TuiLogger parent-chain delegation | (from title) Add unit tests for TuiLogger parent-chain delegation | **KEEP** | Small test task. Title is self-describing — write a failing test for the described behavior. Legend: SURF. | | |
| `task:tui-submission-stepper` | Stepper component for submission lifecycle: OPEN → CHANGES_REQUESTED → APPROVED → MERGED | (from title) Stepper component for submission lifecycle: OPEN → CHANGES_REQUESTED → APPROVED → MERGED | **KEEP** | No description but title is detailed enough to reconstruct intent. Needs a proper METHOD-style backlog doc (problem, rationale, files, effort) before it can be pulled into a cycle. Legend: SURF. | | |
| `task:GRV-001` | Graveyard TUI view: browsable rejected quests with rationale, suggester, rejection timeline | Graveyard view: TUI view: browsable rejected quests with rationale, suggester, rejection timeline | **MERGE** | MERGE GRV-001/002/003 into a single "Graveyard View" cycle. | | |
| `task:GRV-002` | Graveyard reopen action: r key sends quest back to INBOX with history preserved | Graveyard view: reopen action: r key sends quest back to INBOX with history preserved | **MERGE** | MERGE GRV-001/002/003 into a single "Graveyard View" cycle. | | |
| `task:GRV-003` | Graveyard patterns section: rejection stats, top rejector/suggester, common reasons | Graveyard view: patterns section: rejection stats, top rejector/suggester, common reasons | **MERGE** | MERGE GRV-001/002/003 into a single "Graveyard View" cycle. | | |
| `task:LIN-001` | Surface intent description in IntentNode snapshot | Lineage view: intent description in IntentNode snapshot | **MERGE** | MERGE LIN-001/002/003 into a single "Lineage View Enhancement" cycle. | | |
| `task:LIN-002` | Lineage view: intent cards with description, progress bar, and derived stats | Lineage view: intent cards with description, progress bar, and derived stats | **MERGE** | MERGE LIN-001/002/003 into a single "Lineage View Enhancement" cycle. | | |
| `task:LIN-003` | Lineage view: promote orphan sovereignty warning to top-level health indicator | Lineage view: promote orphan sovereignty warning to top-level health indicator | **MERGE** | MERGE LIN-001/002/003 into a single "Lineage View Enhancement" cycle. | | |
| `task:OVR-001` | Overview redesign: project header with overall progress bar and project name | Dashboard overview redesign: project header with overall progress bar and project name | **MERGE** | MERGE all OVR-001 through OVR-011 into a single "Dashboard Redesign" cycle. 11 chained stubs with no descriptions is not 11 separate quests. | | |
| `task:OVR-002` | Overview redesign: in-progress section and pending review section | Dashboard overview redesign: in-progress section and pending review section | **MERGE** | MERGE all OVR-001 through OVR-011 into a single "Dashboard Redesign" cycle. 11 chained stubs with no descriptions is not 11 separate quests. | | |
| `task:OVR-003` | Overview redesign: campaign progress bars with active-first sorting and completed fold | Dashboard overview redesign: campaign progress bars with active-first sorting and completed fold | **MERGE** | MERGE all OVR-001 through OVR-011 into a single "Dashboard Redesign" cycle. 11 chained stubs with no descriptions is not 11 separate quests. | | |
| `task:OVR-004` | Overview redesign: My Issues panel, graveyard fold, health, latest activity feed | Dashboard overview redesign: My Issues panel, graveyard fold, health, latest activity feed | **MERGE** | MERGE all OVR-001 through OVR-011 into a single "Dashboard Redesign" cycle. 11 chained stubs with no descriptions is not 11 separate quests. | | |
| `task:OVR-005` | Change default dashboard view from roadmap to overview | Dashboard overview redesign: Change default view from roadmap to overview | **MERGE** | MERGE all OVR-001 through OVR-011 into a single "Dashboard Redesign" cycle. 11 chained stubs with no descriptions is not 11 separate quests. | | |
| `task:OVR-006` | Dashboard alert bar: sovereignty violations, stale claims, forked patchsets, pending approvals | Dashboard overview redesign: alert bar: sovereignty violations, stale claims, forked patchsets, pending approvals | **MERGE** | MERGE all OVR-001 through OVR-011 into a single "Dashboard Redesign" cycle. 11 chained stubs with no descriptions is not 11 separate quests. | | |
| `task:OVR-007` | Dashboard inbox pressure indicator with count and oldest item age | Dashboard overview redesign: inbox pressure indicator with count and oldest item age | **MERGE** | MERGE all OVR-001 through OVR-011 into a single "Dashboard Redesign" cycle. 11 chained stubs with no descriptions is not 11 separate quests. | | |
| `task:OVR-008` | Dashboard dependency blockers summary from Weaver data | Dashboard overview redesign: dependency blockers summary from Weaver data | **MERGE** | MERGE all OVR-001 through OVR-011 into a single "Dashboard Redesign" cycle. 11 chained stubs with no descriptions is not 11 separate quests. | | |
| `task:OVR-009` | Dashboard writer activity panel showing patch counts per writer | Dashboard overview redesign: writer activity panel showing patch counts per writer | **MERGE** | MERGE all OVR-001 through OVR-011 into a single "Dashboard Redesign" cycle. 11 chained stubs with no descriptions is not 11 separate quests. | | |
| `task:OVR-010` | Dashboard quick actions: claim frontier, promote inbox without leaving view | Dashboard overview redesign: quick actions: claim frontier, promote inbox without leaving view | **MERGE** | MERGE all OVR-001 through OVR-011 into a single "Dashboard Redesign" cycle. 11 chained stubs with no descriptions is not 11 separate quests. | | |
| `task:OVR-011` | Dashboard campaign focus mode: filter all sections to a single milestone | Dashboard overview redesign: campaign focus mode: filter all sections to a single milestone | **MERGE** | MERGE all OVR-001 through OVR-011 into a single "Dashboard Redesign" cycle. 11 chained stubs with no descriptions is not 11 separate quests. | | |
| `task:actuator-theme-destructure` | Destructure theme tokens at top of each xyph-actuator action handler to reduce styled() verbosity | Destructure theme tokens in action handlers. | **MERGE** | MERGE with task:theme-shared-module — same theme refactoring effort. | | |
| `task:theme-preview-command` | Add 'xyph-actuator theme --preview' command to render all tokens side-by-side | xyph-actuator theme --preview to render all tokens. | **MERGE** | MERGE with task:theme-shared-module — depends on it anyway. | | |
| `task:theme-shared-module` | Extract chalk theme utilities to src/shared/theme/ for neutral import path | Extract chalk theme utilities to shared module. | **MERGE** | MERGE with task:actuator-theme-destructure and task:theme-preview-command — all theme refactoring. | | |
| `task:AGT-006` | AgentBriefingService + AgentRecommender + AgentActionValidator domain services | AgentBriefingService + AgentRecommender + AgentActionValidator. | **RETHINK** | AgentBriefingService exists. AgentActionService exists. Is this done? | | |
| `task:DSH-002` | Add xyph-actuator campaign command to create campaign nodes with correct type and metadata | Add campaign creation command to actuator. | **RETHINK** | Campaigns are being retired in favor of legends. Do we need a campaign command, or a legend command? | | |
| `task:bijou-v4-uplift` | Upgrade XYPH TUI runtime to BIJOU v4 Surface/LayoutNode contract | Upgrade XYPH TUI to bijou v4 Surface/LayoutNode contract. | **RETHINK** | Depends on bijou v4 existing. Is bijou at v4 yet? | | |
| `task:doc-agent-charter` | Implement or retire AGENT_CHARTER.md: 6-agent role architecture (Parser, Planner, Graph, QA, Coordinator, Worker) | Implement or retire AGENT_CHARTER.md 6-agent role architecture. | **RETHINK** | AGENT_CHARTER.md exists as DRAFT. Describes unimplemented 6-agent architecture. Current system uses single writer identity. Needs decision: implement or retire. | | |
| `task:AGT-002` | Agent status command: quick state check with filter options | (from title) Agent status command: quick state check with filter options | **CUT** | No description — title only. Cannot pull into a cycle without reconstructing the original context and motivation. | | |
| `task:AGT-005` | Agent log command: session activity audit from writer patches | (from title) Agent log command: session activity audit from writer patches | **CUT** | No description — title only. Cannot pull into a cycle without reconstructing the original context and motivation. | | |
| `task:AGT-013` | Agent submit command: structured submission with test results and file metadata | (from title) Agent submit command: structured submission with test results and file metadata | **CUT** | No description — title only. Cannot pull into a cycle without reconstructing the original context and motivation. | | |
| `task:BX-007` | Fix promote provenance gap: record promoted_by and promoted_at on quest node | (from title) Fix promote provenance gap: record promoted_by and promoted_at on quest node | **CUT** | No description — title only. Cannot pull into a cycle without reconstructing the original context and motivation. | | |
| `task:BX-009` | xyph history <id>: entity timeline from provenanceIndex.patchesFor(nodeId) | (from title) xyph history <id>: entity timeline from provenanceIndex.patchesFor(nodeId) | **CUT** | No description — title only. Cannot pull into a cycle without reconstructing the original context and motivation. | | |
| `task:BX-014` | xyph diff <tickA> <tickB>: roadmap-level diff between two lamport ticks | (from title) xyph diff <tickA> <tickB>: roadmap-level diff between two lamport ticks | **CUT** | No description — title only. Cannot pull into a cycle without reconstructing the original context and motivation. | | |
| `task:BX-016` | TUI provenance panel: property-level causal history with LWW conflict story | (from title) TUI provenance panel: property-level causal history with LWW conflict story | **CUT** | No description — title only. Cannot pull into a cycle without reconstructing the original context and motivation. | | |
| `task:DIAG-001` | Dark-mode SVG diagrams: render dual-theme variants or CSS-adaptive SVGs | (from title) Dark-mode SVG diagrams: render dual-theme variants or CSS-adaptive SVGs | **CUT** | No description — title only. Cannot pull into a cycle without reconstructing the original context and motivation. | | |
| `task:OVR-012` | Rename overview view to dashboard everywhere (ViewName, tab, filename) | Rename "overview" view to "dashboard" everywhere. | **CUT** | No "overview" view exists in the codebase. Nothing to rename. Superseded. | | |
| `task:advisory-doc-versioning` | Advisory docs: auto-expire or link to commit hash they were written against | (from title) Advisory docs: auto-expire or link to commit hash they were written against | **CUT** | No description — title only. Cannot pull into a cycle without reconstructing the original context and motivation. | | |
| `task:agent-cli-hardening` | Bring the agent CLI to the same product standard as the TUI | (from title) Bring the agent CLI to the same product standard as the TUI | **CUT** | No description — title only. Cannot pull into a cycle without reconstructing the original context and motivation. | | |
| `task:appframe-migration` | Migrate DashboardApp to bijou appFrame when available | (from title) Migrate DashboardApp to bijou appFrame when available | **CUT** | No description — title only. Cannot pull into a cycle without reconstructing the original context and motivation. | | |
| `task:bijou-dag-renderer` | Upstream bijou dag() component: ASCII DAG renderer with auto-layout and edge routing | Upstream a dag() component to bijou. | **CUT** | CUT — this is bijou upstream work, not XYPH work. Track in bijou repo. | | |
| `task:bijou-generic-resolved-theme` | Upstream bijou: generic ResolvedTheme<T> to eliminate double cast in bridge.ts | Upstream generic ResolvedTheme<T> to bijou. | **CUT** | CUT — bijou upstream work. Track in bijou repo. | | |
| `task:cli-batch` | xyph batch claim/seal: multi-item operations to reduce round-trips for agents | (from title) xyph batch claim/seal: multi-item operations to reduce round-trips for agents | **CUT** | No description — title only. Cannot pull into a cycle without reconstructing the original context and motivation. | | |
| `task:dashboard-visibility-constants` | Extract dashboard panel visibility caps (8/6) into shared config | (from title) Extract dashboard panel visibility caps (8/6) into shared config | **CUT** | No description — title only. Cannot pull into a cycle without reconstructing the original context and motivation. | | |
| `task:docstring-coverage` | Improve docstring coverage in CLI commands and domain services | (from title) Improve docstring coverage in CLI commands and domain services | **CUT** | No description — title only. Cannot pull into a cycle without reconstructing the original context and motivation. | | |
| `task:ide-integration` | IDE integration: VSCode extension + Neovim plugin for quest-aware editing | VSCode extension + Neovim plugin. | **CUT** | CUT — way too far out. No foundation for this yet. | | |
| `task:lint-unused-interface-fields` | Add stricter lint rule for detecting unused interface fields in model types | (from title) Add stricter lint rule for detecting unused interface fields in model types | **CUT** | No description — title only. Cannot pull into a cycle without reconstructing the original context and motivation. | | |
| `task:pr-health-script` | PR health script: summarize checks, review count, and unresolved comments | (from title) PR health script: summarize checks, review count, and unresolved comments | **CUT** | No description — title only. Cannot pull into a cycle without reconstructing the original context and motivation. | | |
| `task:pre-push-typecheck` | Git pre-push hook: run tsc --noEmit to catch type errors before they hit CI | (from title) Git pre-push hook: run tsc --noEmit to catch type errors before they hit CI | **CUT** | No description — title only. Cannot pull into a cycle without reconstructing the original context and motivation. | | |
| `task:roadmap-coverage-badge` | Coverage badge in roadmap view (criteria met/total per quest) | (from title) Coverage badge in roadmap view (criteria met/total per quest) | **CUT** | No description — title only. Cannot pull into a cycle without reconstructing the original context and motivation. | | |
| `task:snapshot-render-regression` | Add snapshot regression tests for renderRoadmap/renderAll/renderLineage output | (from title) Add snapshot regression tests for renderRoadmap/renderAll/renderLineage output | **CUT** | No description — title only. Cannot pull into a cycle without reconstructing the original context and motivation. | | |
| `task:soft-gate-merge` | Soft-gate merge: warn on unmet traceability coverage | (from title) Soft-gate merge: warn on unmet traceability coverage | **CUT** | No description — title only. Cannot pull into a cycle without reconstructing the original context and motivation. | | |
| `task:style-guide-md040` | Add language identifiers to fenced code blocks in STYLE_GUIDE.md (MD040) | (from title) Add language identifiers to fenced code blocks in STYLE_GUIDE.md (MD040) | **CUT** | No description — title only. Cannot pull into a cycle without reconstructing the original context and motivation. | | |
| `task:traceability-heatmap` | Traceability heat map: visual coverage heat map in TUI with bijou DAG renderer | (from title) Traceability heat map: visual coverage heat map in TUI with bijou DAG renderer | **CUT** | No description — title only. Cannot pull into a cycle without reconstructing the original context and motivation. | | |
| `task:tui-min-size-guard` | Dashboard: show friendly message when terminal is too small for TUI rendering | (from title) Dashboard: show friendly message when terminal is too small for TUI rendering | **CUT** | No description — title only. Cannot pull into a cycle without reconstructing the original context and motivation. | | |
| `task:tui-runscript-tests` | Add runScript()-based automated tests for TUI views | (from title) Add runScript()-based automated tests for TUI views | **CUT** | No description — title only. Cannot pull into a cycle without reconstructing the original context and motivation. | | |
| `task:tui-toast-watch` | Toast notifications for remote graph changes via graph.watch() + bijou toast() | (from title) Toast notifications for remote graph changes via graph.watch() + bijou toast() | **CUT** | No description — title only. Cannot pull into a cycle without reconstructing the original context and motivation. | | |
| `task:vi-stub-env-migration` | Migrate resolve.test.ts process.env mutations to vi.stubEnv | (from title) Migrate resolve.test.ts process.env mutations to vi.stubEnv | **CUT** | No description — title only. Cannot pull into a cycle without reconstructing the original context and motivation. | | |
| `task:web-ui` | Web UI: local air-gapped SPA for browsing WARP graph (offline-first, no CDN deps) | Local air-gapped SPA for browsing the WARP graph. | **CUT** | CUT — bearing says TUI is the human surface, web follows later. Too far out to track. | | |
| `task:worker-thread-loading` | Offload fetchSnapshot to worker_threads for zero-hitch TUI loading | (from title) Offload fetchSnapshot to worker_threads for zero-hitch TUI loading | **CUT** | No description — title only. Cannot pull into a cycle without reconstructing the original context and motivation. | | |
---

## PROV (3)

| ID | Title | Guess Description | Action (Claude) | Claude Remarks | Action (James) | James Remarks |
|-----|-------|-------------------|-----------------|----------------|----------------|---------------|
| `task:TRC-010` | Computed DONE status: TraceabilityService replaces manual flag with graph query | Replace manual DONE flag with computed status from criterion verdicts. | **RETHINK** | IN_PROGRESS but blocker TRC-009 is still PLANNED. Stale claim. Reset to BACKLOG. | | |
| `task:scan-production-annotations` | Extend xyph scan to production code: @xyph implements:req:ID annotations | (from title) Extend xyph scan to production code: @xyph implements:req:ID annotations | **CUT** | No description — title only. Cannot pull into a cycle without reconstructing the original context and motivation. | | |
| `task:temporal-traceability` | Temporal traceability queries: CTL* always/eventually over evidence history | (from title) Temporal traceability queries: CTL* always/eventually over evidence history | **CUT** | No description — title only. Cannot pull into a cycle without reconstructing the original context and motivation. | | |

---

## FLOW (23)

| ID | Title | Guess Description | Action (Claude) | Claude Remarks | Action (James) | James Remarks |
|-----|-------|-------------------|-----------------|----------------|----------------|---------------|
| `task:pre-push-enforcing` | Make pre-push enforcing | Make pre-push hook fail-closed so test failures block pushes. | **SEAL** | DONE. scripts/hooks/pre-push has set -e. Commit e347c1a landed this. | | |
| `task:suggestion-adoption` | Adopt AI suggestions into governed work with provenance and explainability | Adopt AI suggestions into governed work with provenance. | **SEAL** | DONE. suggestion accept/reject/accept-all in suggestions.ts. PR #55 landed this. | | |
| `task:GRAPH-CLEANUP` | Audit and clean up the XYPH graph: seal completed quests, close irrelevant ones, doctor the rest | Audit the XYPH graph: seal completed, close irrelevant, doctor the rest. | **KEEP** | This is us, right now. IN_PROGRESS. | | |
| `task:gh-safe-commenting` | Safe gh comment workflow: use --body-file and quoted heredoc to avoid shell interpolation | (from title) Safe gh comment workflow: use --body-file and quoted heredoc to avoid shell interpolation | **KEEP** | No description but title is detailed enough to reconstruct intent. Needs a proper METHOD-style backlog doc (problem, rationale, files, effort) before it can be pulled into a cycle. Legend: FLOW. | | |
| `task:submission-playback-loop` | Explore playback-aligned submission cycle | Design how XYPH's submission/review/settlement loop could reflect the newer hill/sponsor-actor/playback methodology, including whether submissions should carry explicit playback or receipt semantics. | **KEEP** | Has description (199 chars). Legend: FLOW. Review for continued relevance under METHOD adoption. | | |
| `task:suggestion-learning-loop` | Suggestion learning loop: auto-calibrate heuristic weights from accept/reject decisions | (from title) Suggestion learning loop: auto-calibrate heuristic weights from accept/reject decisions | **KEEP** | No description but title is detailed enough to reconstruct intent. Needs a proper METHOD-style backlog doc (problem, rationale, files, effort) before it can be pulled into a cycle. Legend: FLOW. | | |
| `task:DIAG-002` | Diagram rot detection: CI check that state machine diagrams match QuestStatus enum values | CI check that diagram state machines match QuestStatus enum. | **MERGE** | MERGE with task:DIAG-003 — both diagram CI hardening. | | |
| `task:DIAG-003` | Pin mmdc version in render-diagrams.sh for reproducible SVG output across environments | Pin mmdc version for reproducible SVG rendering. | **MERGE** | MERGE with task:DIAG-002 — both diagram CI hardening. | | |
| `task:lockfile-consistency-guard` | Add lockfile consistency guard when package.json deps change (CI + pre-push) | CI + pre-push guard that catches lockfile drift on dep changes. | **MERGE** | MERGE with task:pr-dependency-checklist — both are about dep hygiene on version changes. | | |
| `task:pr-dependency-checklist` | Add PR checklist item for dependency and lockfile sync on version changes | PR checklist reminder for dep and lockfile sync. | **MERGE** | MERGE with task:lockfile-consistency-guard — same concern. | | |
| `task:FRG-001` | REVIEW phase — human-readable diff + approver resolution | REVIEW phase — human-readable diff + approver resolution | **RETHINK** | Forge pipeline (REVIEW/EMIT/APPLY) predates METHOD adoption. The cycle discipline may change what "forge" means. | | |
| `task:FRG-002` | EMIT phase — PlanPatchArtifact generation + signing | EMIT phase — PlanPatchArtifact generation + signing | **RETHINK** | Forge pipeline (REVIEW/EMIT/APPLY) predates METHOD adoption. The cycle discipline may change what "forge" means. | | |
| `task:FRG-003` | APPLY phase — domain validation + graph.patch() + audit record | APPLY phase — domain validation + graph.patch() + audit record | **RETHINK** | Forge pipeline (REVIEW/EMIT/APPLY) predates METHOD adoption. The cycle discipline may change what "forge" means. | | |
| `task:FRG-004` | Full pipeline integration test: INGEST → APPLY end-to-end | Full pipeline integration test: INGEST → APPLY end-to-end | **RETHINK** | Forge pipeline (REVIEW/EMIT/APPLY) predates METHOD adoption. The cycle discipline may change what "forge" means. | | |
| `task:TRG-001` | Promotion review workflow: propose/review-proposal/accept-proposal with PROPOSED status | Promotion review workflow: propose/review-proposal/accept-proposal with PROPOSED status | **RETHINK** | Triage workflow predates METHOD adoption. METHOD has its own backlog triage pattern (lanes, pull, promote). These need reconciliation. | | |
| `task:TRG-002` | Triage policy config: approval counts, human-required, agent permissions stored in WARP graph | Triage policy config: approval counts, human-required, agent permissions stored in WARP graph | **RETHINK** | Triage workflow predates METHOD adoption. METHOD has its own backlog triage pattern (lanes, pull, promote). These need reconciliation. | | |
| `task:TRG-003` | TUI triage view: pending proposals, inbox queue, item detail with recommendations | TUI triage view: pending proposals, inbox queue, item detail with recommendations | **RETHINK** | Triage workflow predates METHOD adoption. METHOD has its own backlog triage pattern (lanes, pull, promote). These need reconciliation. | | |
| `task:TRG-004` | Triage recommendation engine: campaign/intent suggestion, priority signals, duplicate detection | Triage recommendation engine: campaign/intent suggestion, priority signals, duplicate detection | **RETHINK** | Triage workflow predates METHOD adoption. METHOD has its own backlog triage pattern (lanes, pull, promote). These need reconciliation. | | |
| `task:TRG-005` | Triage report command: structured inbox analysis with recommendations (JSON/text/markdown) | Triage report command: structured inbox analysis with recommendations (JSON/text/markdown) | **RETHINK** | Triage workflow predates METHOD adoption. METHOD has its own backlog triage pattern (lanes, pull, promote). These need reconciliation. | | |
| `task:VOC-003` | Promotion as DAG insertion: require campaign, intent, dependencies, hours at promote time | Require campaign/intent/deps/hours at promote time. | **RETHINK** | RETHINK — campaigns are becoming legends. The promote workflow may change with METHOD cycles. | | |
| `task:lint-hook-drift-cleanup` | Clean up repo-wide lint failures so commit hooks report honest status | Clean up lint failures so commit hooks report honest status. | **RETHINK** | Mostly done — commit 6c1d4d6 cleaned up lint drift. 2 errors remain in generate-triage.ts (our temp file). Real codebase is clean. | | |
| `task:method-alignment-profile` | METHOD alignment: graph-native programmable workflow profile | Adapt METHOD into XYPH as a programmable workflow profile. | **RETHINK** | Partially addressed by current invariants/legends/bearing work. The "programmable profile" part is the remaining scope. | | |
| `task:ci-graph-cache` | CI graph materialization cache: GitHub Actions cache for incremental materialize | (from title) CI graph materialization cache: GitHub Actions cache for incremental materialize | **CUT** | No description — title only. Cannot pull into a cycle without reconstructing the original context and motivation. | | |

---

## OTHER (2)

| ID | Title | Guess Description | Action (Claude) | Claude Remarks | Action (James) | James Remarks |
|-----|-------|-------------------|-----------------|----------------|----------------|---------------|
| `task:dep-hygiene-automation` | Dependency hygiene automation for transitive vulnerability detection and alerting | (from title) Dependency hygiene automation for transitive vulnerability detection and alerting | **KEEP** | No description but title is detailed enough to reconstruct intent. Needs a proper METHOD-style backlog doc (problem, rationale, files, effort) before it can be pulled into a cycle. Legend: OTHER. | | |
| `task:ssjs-runtime-hardening` | SSJS adoption boundary and runtime-truth hardening | Define the XYPH SSJS boundary and harden policy-sensitive domain code with runtime-backed errors, validation, and invariant preservation. Keep projections, read models, and packets lightweight where plain structured data is the honest representation. | **KEEP** | Has description (250 chars). Legend: OTHER. Review for continued relevance under METHOD adoption. | | |

---

# Appendix: Questions for James

These are things I'm unsure about. Your answers will help me boost confidence on categorization, scope, and action.

### 1. `task:auto-graph-push-hook` — Post-push hook: auto-push WARP writer refs after git push

- What was the original context for this? Can you reconstruct the problem/motivation?

> Add a script to configure local git repo settings to push xyph refs when you do `git push`.

### 2. `task:case-driven-governance` — Case-driven shape governance

- Is this fully complete or was it a spike? Description says "starting with agent-side briefing, next, context, and brief preparation semantics."

> IDK what this is, tbh.

### 3. `task:BX-006` — Sovereignty gate: TTY + /dev/tty confirmation for human-only commands (intent, promote, reject, reopen, quest)

- Does principal-general-authority mean we shouldn't have "human-only" commands? Or are there legitimate cases where TTY confirmation is a policy choice, not a species gate?

> Perhaps this should be left up to configuration. I personally don't think xyph will internally use this (besides tests maybe), but some projects might want to lock certain capabilities behind certain types of gates. This is to accommodate those users.

### 4. `task:ORC-001` — CLASSIFY phase — intent classification + complexity/risk inference

- Is the Oracle pipeline still the right abstraction? With METHOD cycles and policy-is-plastic, does XYPH still need a built-in CLASSIFY/VALIDATE/MERGE pipeline, or should this be a programmable workflow profile?

> I don't even remember what the Oracle pipeline is. Are there docs about it somewhere? METHOD probably usurps whatever Oracle was all about. The workflow should be programmable, yes! METHOD should inspire the defaults, and it is what we will use internally to build XYPH, but it shouldn't be the holy doctrine.

### 5. `task:ORC-002` — Full MUST/SHOULD/COULD policy engine (VALIDATE phase)

- Is the Oracle pipeline still the right abstraction? With METHOD cycles and policy-is-plastic, does XYPH still need a built-in CLASSIFY/VALIDATE/MERGE pipeline, or should this be a programmable workflow profile?

> This was more about the template used to suggest or comment on design docs, I think... Pipeline should be programmable, templates customizable. This informs how the default template would be written and how we will build xyph itself.

### 6. `task:ORC-003` — MERGE phase — candidate vs. snapshot collision detection + merge ops

- Is the Oracle pipeline still the right abstraction? With METHOD cycles and policy-is-plastic, does XYPH still need a built-in CLASSIFY/VALIDATE/MERGE pipeline, or should this be a programmable workflow profile?

> :\ I'm done answering this lol. PROGRAMMABLE.

### 7. `task:ORC-004` — Anti-chain generation — parallel lane partitioning via graph.traverse.levels()

- Is the Oracle pipeline still the right abstraction? With METHOD cycles and policy-is-plastic, does XYPH still need a built-in CLASSIFY/VALIDATE/MERGE pipeline, or should this be a programmable workflow profile?

> This was about xyph being able to generate MECE workloads for a swarm of agents. Probably not necessary.

### 8. `task:principal-capability-model` — Principal-general authority and delegated capability model

- The invariant is set. Is this quest about IMPLEMENTING the capability model, or was it about DEFINING it? If defining, it may be done.

> Both. All quests go through `design -> red -> green -> playback -> retro`.

### 9. `task:KSP-001` — Transactional KeyringStoragePort API

- What was the original context for this? Can you reconstruct the problem/motivation?

> Pretty sure this has to do with cryptographically sealing quests or policy/governance stuff? Not 100% sure.

### 10. `task:cli-api` — API layer: --json output mode for CLI scriptability + local REST/socket API for external consumers

- Was a local REST/socket API part of scope too? Title says "local REST/socket API for external consumers" — that part is NOT done.

> Yeah, for a web UX, remote UX idk but yeah

### 11. `task:AGT-004` — Agent act command: validated action execution with dry-run and structured response

- What was the original context for this? Can you reconstruct the problem/motivation?

> Not sure, really. Agent command, so... You made this one up.

### 12. `task:AGT-008` — Enhanced inbox command: add --description and --labels for richer agent suggestions and bug reports

- What was the original context for this? Can you reconstruct the problem/motivation?

> Inbox was the old system's backlog's staging area, before items were triaged and promoted from "cool idea/suggestion" to become "item we will work on some day". Since we now create documents as attachments for backlog items... Well, actually, having some node properties could help speed up UX idk.

### 13. `task:AGT-010` — Flag command: mark entities for human attention with reason, visible in dashboard alerts

- What was the original context for this? Can you reconstruct the problem/motivation?

> Agents can do stuff. They can also flag stuff as "needs human attention". This could apply to anything, really.

### 14. `task:AGT-011` — Agent submissions command: structured view of reviewable and owned submissions with actions

- What was the original context for this? Can you reconstruct the problem/motivation?

> Agents can work on stuff, just like humans. They must follow the same submission workflow as humans. This command lets an agent see their "My Stuff" view, just like the human can see "My Stuff" in the TUI dashboard.

### 15. `task:AGT-012` — Agent review command: structured review with pre-validation and status effect feedback

- What was the original context for this? Can you reconstruct the problem/motivation?

> Agents can review submissions. I don't know what the "pre-validation and status effect feedback" means, exactly. But I think this probably about recreating a PR review experience that is interactive, sort of like how Code Rabbit AI opens "issues" in your PR (submission), can comment, can close issues, request changes, block a submission from being merged, resolve issues, etc.

### 16. `task:BX-008` — xyph status positional subcommand: xyph status [roadmap|lineage|all|inbox] with --graveyard flag

- What was the original context for this? Can you reconstruct the problem/motivation?
- Depends on task:BX-001 — do these exist? Are they still relevant?

> Original idea was xyph keeps the backlog in its graph. This command would:
> 
> `roadmap` generate a roadmap based on materialized graph state
> `lineage` show you a quest's lineage? who suggested it? who promoted it to work on the DAG, who has worked on it, who submitted, etc. The causal history of a quest as it moves through the state machine.
> `all` no idea (view all quests, maybe including done?)
> `inbox` shows you the backlog items that need triage
> 
> I assume `--graveyard` flag means "Include quests that were graveyarded in the output"

### 17. `task:BX-010` — TUI h key: entity timeline modal available from any view (Roadmap, Lineage, Inbox, AllNodes)

- What was the original context for this? Can you reconstruct the problem/motivation?

> No idea what the heck this one is

### 18. `task:BX-011` — `xyph receipts <id>`: show tick receipts — which ops won/lost LWW with writer IDs and lamport ticks

- What was the original context for this? Can you reconstruct the problem/motivation?
- Depends on task:BX-017 — do these exist? Are they still relevant?

> Don't do this one. We have ~/git/warp-ttd to debug the WARP graph

### 19. `task:BX-012` — xyph seek --tick N / --latest: materialize graph at lamport ceiling via SeekCache

- What was the original context for this? Can you reconstruct the problem/motivation?
- Depends on task:BX-017 — do these exist? Are they still relevant?

> Probably not relevant unless you think agents would want to fork the xyph graph to run strands and simulate project state under counterfactuals idk 

### 20. `task:BX-013` — TUI LIVE/PINNED mode: visual indicator in top bar, hard-disable mutations when pinned

- What was the original context for this? Can you reconstruct the problem/motivation?
- Depends on task:BJU-009 — do these exist? Are they still relevant?

> again, we have warp-ttd to debug, probably can CUT this one

### 21. `task:BX-015` — `xyph slice <id>`: holographic slice via materializeSlice(nodeId) — backward causal cone

- What was the original context for this? Can you reconstruct the problem/motivation?
- Depends on task:BX-001 — do these exist? Are they still relevant?

> This one could still be relevant so you can view a quest's ENTIRE causal cone

### 22. `task:DSH-008` — RoadmapView: typeahead search/filter — type to filter quests by title or ID

- Depends on task:BJU-002 — do these exist? Are they still relevant?

> I think this is "when viewing the materialized roadmap, add a `/foo` type search, like in VIM or something"

### 23. `task:SUB-CLI-001` — Add `xyph diff <submission-id>` command — show git diff for a submission tip patchset

- What was the original context for this? Can you reconstruct the problem/motivation?

> This is to replace traditional github-based "pull requests" with our own "submissions". The agent command should show git diffs for the submission, and comments, issues, etc. just like a real pull request on github.

### 24. `task:SUB-CLI-002` — Add `xyph timeline <submission-id>` — chronological event log (submitted, reviewed, revised, merged)

- What was the original context for this? Can you reconstruct the problem/motivation?
- Depends on task:BX-017 — do these exist? Are they still relevant?

> Show the full chronological causal history of a submission

### 25. `task:SUB-ID-001` — Replace generateId() with proper ULID library — current base36 timestamps are not monotonically sortable

- What was the original context for this? Can you reconstruct the problem/motivation?

> Submissions need unique identifiers

### 26. `task:SUB-PERF-001` — WarpSubmissionAdapter.getOpenSubmissionsForQuest scans all nodes — add edge-based index

- What was the original context for this? Can you reconstruct the problem/motivation?

> I think this is about the xyph WARP graph model. Submission nodes need edges back to the quest node that represented the path set (the code modifications)

### 27. `task:SUB-SAFETY-001` — GitWorkspaceAdapter.merge mutates worktree (git checkout + merge) — warn user or use plumbing-only strategy

- What was the original context for this? Can you reconstruct the problem/motivation?

> This has to do with collapsing a submission's changeset (patches) into the actual filesystem git branch. (Since submissions could be like forks of the xyph graph, and an agent could work inside of a git-warp strand, bypassing the need to create a worktree, adding patches to a WARP node... honestly, needs RETHINK or deeper design session)

### 28. `task:SUB-SCHEMA-001` — decision: prefix collision — pre-existing concept/decision nodes share prefix with submission decision nodes (type discriminates but latent risk)

- What was the original context for this? Can you reconstruct the problem/motivation?

> No idea wtf this means

### 29. `task:benchmark-large-graphs` — Benchmarks: materialize/query perf at 10k+ nodes, identify scaling bottlenecks in syncCoverage and DAG traversal

- What was the original context for this? Can you reconstruct the problem/motivation?

> THis was written when XYPH was trying to do graph shit instead of leaning on git-warp, CUT

### 30. `task:cli-assign` — `xyph assign <quest> <principal>`: directed work assignment (complements self-claim)

- What was the original context for this? Can you reconstruct the problem/motivation?

> Agentic CLI to claim a quest? IDK what "principal" is in this context.

### 31. `task:cli-diff` — `xyph diff [--since <tick|duration>]`: graph-level change detection — sealed, status changes, new items

- What was the original context for this? Can you reconstruct the problem/motivation?

> git-warp diff between ticks on a worldline... might have been xyph trying to be git-warp intead of just using git-warp. Potentially CUT.

### 32. `task:cli-fuzzy-claim` — Interactive xyph claim/depend with bijou filter() over computeFrontier() — fuzzy task search

- What was the original context for this? Can you reconstruct the problem/motivation?

> CLI to fuzzy match and claim a quest

### 33. `task:cli-plan` — `xyph plan <campaign>`: execution plan with frontier, blocked, critical path, progress per campaign

- What was the original context for this? Can you reconstruct the problem/motivation?

> No idea

### 34. `task:confirm-overlay-integration-test` — Integration test: confirm overlay renders in view() from landing/help

- What was the original context for this? Can you reconstruct the problem/motivation?

### 35. `task:coverage-threshold` — CI: configure @vitest/coverage-v8 with ratcheting threshold (never allow coverage regression)

- What was the original context for this? Can you reconstruct the problem/motivation?

### 36. `task:cross-adapter-test-stability` — Increase CrossAdapterVisibility test timeout or run integration tests sequentially

- What was the original context for this? Can you reconstruct the problem/motivation?

### 37. `task:dag-visualization` — DAG visualization: SVG via Graphviz, ASCII for terminal, Mermaid for PR embeds, interactive explorer for web UI

- What was the original context for this? Can you reconstruct the problem/motivation?

### 38. `task:dashboard-adapter-error-isolation` — Add per-node error logging to WarpDashboardAdapter batch fetches (log which node ID failed)

- What was the original context for this? Can you reconstruct the problem/motivation?
- Depends on task:BJU-002 — do these exist? Are they still relevant?

### 39. `task:dashboard-focus-clamp-test` — Add test for dashboard focusRow clamp after panel data shrinks on snapshot refresh

- What was the original context for this? Can you reconstruct the problem/motivation?

### 40. `task:dashboard-resize-handler` — Add terminal resize handler (SIGWINCH) to re-render dashboard on window size change

- What was the original context for this? Can you reconstruct the problem/motivation?
- Depends on task:BJU-002 — do these exist? Are they still relevant?

### 41. `task:doc-tui-plan-update` — Update TUI-plan.md: mark phases 4-5 done, fix overview→dashboard rename, note bijou v0.6.0 deps satisfied

- What was the original context for this? Can you reconstruct the problem/motivation?

### 42. `task:git-hooks-lifecycle` — Git hooks integration: auto-link commits to quests, update status on push, guard against committing to sealed quests

- What was the original context for this? Can you reconstruct the problem/motivation?
- Depends on task:BX-001 — do these exist? Are they still relevant?

### 43. `task:graph-export-import` — Graph export/import: portable snapshots (JSON/CBOR) for sharing roadmap state across air-gapped environments

- What was the original context for this? Can you reconstruct the problem/motivation?

### 44. `task:graphmeta-drop-tipsha` — Remove tipSha from GraphMeta (no longer displayed; eliminate checkpoint SHA dependency in view layer)

- What was the original context for this? Can you reconstruct the problem/motivation?

### 45. `task:help-modal-warp-glossary` — Review HelpModal glossary entry for WARP — consider clarifying WARP vs XYPH distinction

- What was the original context for this? Can you reconstruct the problem/motivation?
- Depends on task:BJU-002 — do these exist? Are they still relevant?

### 46. `task:mcp-server` — MCP server: expose WARP graph as Model Context Protocol tools so AI agents can query/mutate the roadmap natively

- What was the original context for this? Can you reconstruct the problem/motivation?

### 47. `task:no-tui-mode` — Dashboard: offer non-interactive plain-text output mode (--no-tui) for small terminals and CI

- What was the original context for this? Can you reconstruct the problem/motivation?
- Depends on task:BX-001 — do these exist? Are they still relevant?

### 48. `task:statusline-graph-health` — StatusLine: show graph health indicators (writer count, sync staleness, checkpoint age)

- What was the original context for this? Can you reconstruct the problem/motivation?
- Depends on task:BJU-002 — do these exist? Are they still relevant?

### 49. `task:terminology-lint` — CI terminology lint: flag non-guild vocabulary (task/item/issue) in user-facing strings

- What was the original context for this? Can you reconstruct the problem/motivation?

### 50. `task:test-cross-type-depend` — Test: depend rejects cross-type task/campaign edges with TYPE_MISMATCH

- What was the original context for this? Can you reconstruct the problem/motivation?

### 51. `task:test-frontier-zero-edges` — Test: computeFrontier with zero dep edges returns all non-DONE as frontier

- What was the original context for this? Can you reconstruct the problem/motivation?

### 52. `task:tui-chord-commands` — Vim-style chord commands via bijou createInputStack(): g+r goto roadmap, : command mode, etc.

- What was the original context for this? Can you reconstruct the problem/motivation?

### 53. `task:tui-logger-unit-tests` — Add unit tests for TuiLogger parent-chain delegation

- What was the original context for this? Can you reconstruct the problem/motivation?
- Depends on task:BJU-002 — do these exist? Are they still relevant?

### 54. `task:tui-submission-stepper` — Stepper component for submission lifecycle: OPEN → CHANGES_REQUESTED → APPROVED → MERGED

- What was the original context for this? Can you reconstruct the problem/motivation?
- Depends on task:BJU-002 — do these exist? Are they still relevant?

### 55. `task:AGT-006` — AgentBriefingService + AgentRecommender + AgentActionValidator domain services

- AgentBriefingService and AgentActionService both exist. What's missing — AgentRecommender? AgentActionValidator?

### 56. `task:DSH-002` — Add xyph-actuator campaign command to create campaign nodes with correct type and metadata

- With legends replacing campaigns, should this become "add legend command" instead?

### 57. `task:bijou-v4-uplift` — Upgrade XYPH TUI runtime to BIJOU v4 Surface/LayoutNode contract

- Is bijou v4 released? If not, this is premature.

### 58. `task:doc-agent-charter` — Implement or retire AGENT_CHARTER.md: 6-agent role architecture (Parser, Planner, Graph, QA, Coordinator, Worker)

- Is the 6-agent role architecture (Parser, Planner, Graph, QA, Coordinator, Worker) still the vision, or has principal-general-authority replaced it?

### 59. `task:AGT-002` — Agent status command: quick state check with filter options

- What was the original context for this? Can you reconstruct the problem/motivation?

### 60. `task:AGT-005` — Agent log command: session activity audit from writer patches

- What was the original context for this? Can you reconstruct the problem/motivation?

### 61. `task:AGT-013` — Agent submit command: structured submission with test results and file metadata

- What was the original context for this? Can you reconstruct the problem/motivation?

### 62. `task:BX-007` — Fix promote provenance gap: record promoted_by and promoted_at on quest node

- What was the original context for this? Can you reconstruct the problem/motivation?
- Depends on task:BX-001 — do these exist? Are they still relevant?

### 63. `task:BX-009` — xyph history <id>: entity timeline from provenanceIndex.patchesFor(nodeId)

- What was the original context for this? Can you reconstruct the problem/motivation?
- Depends on task:BX-017 — do these exist? Are they still relevant?

### 64. `task:BX-014` — xyph diff <tickA> <tickB>: roadmap-level diff between two lamport ticks

- What was the original context for this? Can you reconstruct the problem/motivation?
- Depends on task:BX-017 — do these exist? Are they still relevant?

### 65. `task:BX-016` — TUI provenance panel: property-level causal history with LWW conflict story

- What was the original context for this? Can you reconstruct the problem/motivation?
- Depends on task:BX-017 — do these exist? Are they still relevant?

### 66. `task:DIAG-001` — Dark-mode SVG diagrams: render dual-theme variants or CSS-adaptive SVGs

- What was the original context for this? Can you reconstruct the problem/motivation?

### 67. `task:advisory-doc-versioning` — Advisory docs: auto-expire or link to commit hash they were written against

- What was the original context for this? Can you reconstruct the problem/motivation?

### 68. `task:agent-cli-hardening` — Bring the agent CLI to the same product standard as the TUI

- What was the original context for this? Can you reconstruct the problem/motivation?

### 69. `task:appframe-migration` — Migrate DashboardApp to bijou appFrame when available

- What was the original context for this? Can you reconstruct the problem/motivation?

### 70. `task:cli-batch` — xyph batch claim/seal: multi-item operations to reduce round-trips for agents

- What was the original context for this? Can you reconstruct the problem/motivation?

### 71. `task:dashboard-visibility-constants` — Extract dashboard panel visibility caps (8/6) into shared config

- What was the original context for this? Can you reconstruct the problem/motivation?

### 72. `task:docstring-coverage` — Improve docstring coverage in CLI commands and domain services

- What was the original context for this? Can you reconstruct the problem/motivation?

### 73. `task:lint-unused-interface-fields` — Add stricter lint rule for detecting unused interface fields in model types

- What was the original context for this? Can you reconstruct the problem/motivation?

### 74. `task:pr-health-script` — PR health script: summarize checks, review count, and unresolved comments

- What was the original context for this? Can you reconstruct the problem/motivation?

### 75. `task:pre-push-typecheck` — Git pre-push hook: run tsc --noEmit to catch type errors before they hit CI

- What was the original context for this? Can you reconstruct the problem/motivation?

### 76. `task:roadmap-coverage-badge` — Coverage badge in roadmap view (criteria met/total per quest)

- What was the original context for this? Can you reconstruct the problem/motivation?

### 77. `task:snapshot-render-regression` — Add snapshot regression tests for renderRoadmap/renderAll/renderLineage output

- What was the original context for this? Can you reconstruct the problem/motivation?
- Depends on task:BJU-002 — do these exist? Are they still relevant?

### 78. `task:soft-gate-merge` — Soft-gate merge: warn on unmet traceability coverage

- What was the original context for this? Can you reconstruct the problem/motivation?

### 79. `task:style-guide-md040` — Add language identifiers to fenced code blocks in STYLE_GUIDE.md (MD040)

- What was the original context for this? Can you reconstruct the problem/motivation?

### 80. `task:traceability-heatmap` — Traceability heat map: visual coverage heat map in TUI with bijou DAG renderer

- What was the original context for this? Can you reconstruct the problem/motivation?

### 81. `task:tui-min-size-guard` — Dashboard: show friendly message when terminal is too small for TUI rendering

- What was the original context for this? Can you reconstruct the problem/motivation?
- Depends on task:BJU-002 — do these exist? Are they still relevant?

### 82. `task:tui-runscript-tests` — Add runScript()-based automated tests for TUI views

- What was the original context for this? Can you reconstruct the problem/motivation?

### 83. `task:tui-toast-watch` — Toast notifications for remote graph changes via graph.watch() + bijou toast()

- What was the original context for this? Can you reconstruct the problem/motivation?
- Depends on task:BJU-009 — do these exist? Are they still relevant?

### 84. `task:vi-stub-env-migration` — Migrate resolve.test.ts process.env mutations to vi.stubEnv

- What was the original context for this? Can you reconstruct the problem/motivation?

### 85. `task:web-ui` — Web UI: local air-gapped SPA for browsing WARP graph (offline-first, no CDN deps)

- Is web UI still in the vision, or is TUI + CLI sufficient?

### 86. `task:worker-thread-loading` — Offload fetchSnapshot to worker_threads for zero-hitch TUI loading

- What was the original context for this? Can you reconstruct the problem/motivation?

### 87. `task:TRC-010` — Computed DONE status: TraceabilityService replaces manual flag with graph query

- Is computed DONE status still the right approach, or does witness-before-done (invariant #9) change the criteria for "done"?

### 88. `task:scan-production-annotations` — Extend xyph scan to production code: @xyph implements:req:ID annotations

- What was the original context for this? Can you reconstruct the problem/motivation?

### 89. `task:temporal-traceability` — Temporal traceability queries: CTL* always/eventually over evidence history

- What was the original context for this? Can you reconstruct the problem/motivation?

### 90. `task:gh-safe-commenting` — Safe gh comment workflow: use --body-file and quoted heredoc to avoid shell interpolation

- What was the original context for this? Can you reconstruct the problem/motivation?

### 91. `task:suggestion-learning-loop` — Suggestion learning loop: auto-calibrate heuristic weights from accept/reject decisions

- What was the original context for this? Can you reconstruct the problem/motivation?

### 92. `task:FRG-001` — REVIEW phase — human-readable diff + approver resolution

- Does METHOD's design→red→green→playback→retro loop replace the Forge pipeline, or do they coexist?

### 93. `task:FRG-002` — EMIT phase — PlanPatchArtifact generation + signing

- Does METHOD's design→red→green→playback→retro loop replace the Forge pipeline, or do they coexist?

### 94. `task:FRG-003` — APPLY phase — domain validation + graph.patch() + audit record

- Does METHOD's design→red→green→playback→retro loop replace the Forge pipeline, or do they coexist?

### 95. `task:FRG-004` — Full pipeline integration test: INGEST → APPLY end-to-end

- Does METHOD's design→red→green→playback→retro loop replace the Forge pipeline, or do they coexist?

### 96. `task:TRG-001` — Promotion review workflow: propose/review-proposal/accept-proposal with PROPOSED status

- Does METHOD's backlog lane model (inbox→asap→up-next) replace or augment the TRG triage engine?

### 97. `task:TRG-002` — Triage policy config: approval counts, human-required, agent permissions stored in WARP graph

- Does METHOD's backlog lane model (inbox→asap→up-next) replace or augment the TRG triage engine?

### 98. `task:TRG-003` — TUI triage view: pending proposals, inbox queue, item detail with recommendations

- Does METHOD's backlog lane model (inbox→asap→up-next) replace or augment the TRG triage engine?

### 99. `task:TRG-004` — Triage recommendation engine: campaign/intent suggestion, priority signals, duplicate detection

- Does METHOD's backlog lane model (inbox→asap→up-next) replace or augment the TRG triage engine?

### 100. `task:TRG-005` — Triage report command: structured inbox analysis with recommendations (JSON/text/markdown)

- Does METHOD's backlog lane model (inbox→asap→up-next) replace or augment the TRG triage engine?

### 101. `task:lint-hook-drift-cleanup` — Clean up repo-wide lint failures so commit hooks report honest status

- Is this done enough to seal once we delete the temp scripts?

### 102. `task:method-alignment-profile` — METHOD alignment: graph-native programmable workflow profile

- Is this being satisfied by our current METHOD adoption work, or is there remaining scope around making the workflow pipeline itself programmable?

### 103. `task:ci-graph-cache` — CI graph materialization cache: GitHub Actions cache for incremental materialize

- What was the original context for this? Can you reconstruct the problem/motivation?

### 104. `task:dep-hygiene-automation` — Dependency hygiene automation for transitive vulnerability detection and alerting

- What was the original context for this? Can you reconstruct the problem/motivation?
