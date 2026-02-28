# XYPH Roadmap

The milestones below are ordered by dependency — each layer builds on the one before it. The numbering is historical (order of conception), not execution order.

## The Arc

```
DONE                          NEXT                    FUTURE
─────────────────────────    ──────────────────────   ──────────────────────────────
Bedrock → Heartbeat →        CLI Tooling →            Oracle →
Triage → Sovereignty →       Agent Protocol →         Forge →
Dashboard → Submission →     Traceability             Ecosystem (MCP, Web, IDE)
Weaver
```

---

## DONE — Foundation is Laid

### Milestone 1: Bedrock Foundations
*Bootstrapped the project: docs, repo, actuator, WARP graph.*

Everything starts here. The graph exists, the CLI can mutate it, and the constitution governs what's allowed.

### Milestone 2: The Heartbeat
*Coordinator service, ingest pipeline, normalize phase, orchestration FSM.*

The system can accept work, normalize it, and orchestrate state transitions. The heartbeat is the scheduler loop.

### Milestone 3: Triage
*Triage service, origin context, backlog rebalancer.*

Work can be ingested from multiple sources, triaged, and rebalanced across the roadmap. The INBOX → BACKLOG flow works.

### Milestone 4: Sovereignty
*Intents, constitutional enforcement, approval gates, Guild Seals.*

Human authority is cryptographically enforced. Every quest traces to a human intent. Completed work is signed with Ed25519 seals. The genealogy of intent is live.

### Milestone 5: WARP Dashboard
*Fullscreen TUI, alternate screen, flicker-free rendering, status line, log gutter.*

The roadmap is browsable in a terminal. Multiple views (roadmap, lineage, inbox, submissions). Real-time graph state.

### Milestone 6: Submission & Review Workflow
*Submit, revise, review, merge, close — all graph-native.*

The PR model reimagined as WARP graph nodes. Patchsets, reviews, and decisions are append-only. Status is computed, not stored. Auto-seal on merge.

### Milestone 7: Weaver
*Task dependency graph, cycle detection, frontier computation, topological sort, critical path.*

The graph became computable. `depends-on` edges, cycle rejection, frontier sets, topo sort, and critical path — all implemented via `DepAnalysis.ts` and git-warp v12's `LogicalTraversal`. The `depend` command and `--view deps` dashboard view are live.

---

## NEXT — The Interface Sprint

These milestones transform XYPH from a dev tool into a collaborative platform. CLI and agent interfaces are the priority.

**See:** `CLI-plan.md` for the full enhancement plan.

### Milestone 10: CLI Tooling
*Identity resolution, `xyph whoami`, `xyph login/logout`, `--json` output, interactive wizards, missing commands.*

**Why it's next:** The CLI is the primary interface. It needs proper identity, scriptable output, and ergonomic interactive flows.

**Key items:**
- 5-layer identity resolution (replaces `XYPH_AGENT_ID` env var)
- `--json` output mode (enables scripting, agent protocol, web UI, MCP)
- `xyph show <id>` — single entity inspection (the most glaring gap)
- `xyph plan <campaign>` — per-campaign execution plan
- `xyph diff` — graph-level change detection
- `xyph assign` / `xyph move` — directed work management
- Interactive wizards via bijou v0.6.0 `wizard()` + `filter()` for quest, review, promote, triage
- `xyph batch` — multi-item claim/seal operations

### Milestone 12: Agent Protocol *(NEW)*
*Structured agent interface: briefing, next, context, handoff.*

**Why it's next:** Agents are first-class writers. They need structured session lifecycle commands, not human-formatted table output.

**Key items:**
- `xyph briefing` — start-of-session summary (changes, assignments, frontier, pending reviews)
- `xyph next` — opinionated single-task recommendation with scoring heuristic
- `xyph context <id>` — full quest context dump (intent lineage, deps, submissions, siblings)
- `xyph handoff` — end-of-session summary with handoff node written to graph
- All commands support `--json` for machine-parseable output

**Depends on:** `--json` flag from CLI Tooling (M10).

### Milestone 11: Traceability *(NEW)*
*Stories, requirements, acceptance criteria, evidence, computed completion.*

**Why it's next:** This is where "done means done" becomes provable. Tasks link to requirements, requirements have criteria, criteria have evidence. DONE is a graph query, not a checkbox.

**What it unlocks:**
- User stories, requirements, and acceptance criteria as graph nodes
- Evidence nodes linked to criteria (test results, benchmarks, attestations)
- `xyph scan` maps test annotations to criteria
- Computed task status: DONE only when all criteria have passing evidence
- Gap detection: "these criteria have no tests"
- Policy nodes: Definition of Done at campaign level

**See:** `docs/canonical/TRACEABILITY.md` for the full spec.

---

## FUTURE — Intelligence and Reach

These milestones depend on the structure sprint being complete. Order is flexible.

### Milestone 8: Oracle
*Intent classification, MUST/SHOULD/COULD policy engine, merge conflict detection, anti-chain generation.*

The system gets smart about *what* to do — classifying intent, enforcing policies, detecting conflicts before they happen, and generating parallelizable work lanes.

**Depends on:** Weaver (needs the dependency DAG), Traceability (needs requirements to classify).

### Milestone 9: Forge
*REVIEW phase, EMIT phase (PlanPatchArtifact), APPLY phase (optimistic concurrency), full pipeline integration.*

The planning compiler becomes real — human intent goes in, verified artifacts come out. The full INGEST → ANALYZE → REVIEW → EMIT → APPLY pipeline.

**Depends on:** Oracle (needs classification and policy), Weaver (needs dependency ordering).

### Ecosystem
*MCP server, Web UI, IDE integration, graph export/import.*

XYPH becomes accessible beyond the terminal:
- **MCP server** — AI agents as native graph participants (depends on CLI `--json` mode)
- **Web UI** — local, air-gapped SPA for browsing the graph (depends on API layer)
- **IDE integration** — VSCode/Neovim quest-aware editing (depends on API layer)
- **Graph export/import** — portable snapshots for sharing across environments

---

## Inbox (~100 items)

Untriaged ideas awaiting promotion into the milestones above. Run `npx tsx xyph-actuator.ts status --view inbox` to see them.

---

## How to Read This

- **DONE** milestones are shipped and tested. Their tasks are sealed in the graph.
- **NEXT** milestones are the current focus, in dependency order. Start at Weaver.
- **FUTURE** milestones have specs but depend on the structure sprint.
- The inbox is a parking lot — items get promoted into milestones during triage.
- Task-level detail lives in the WARP graph: `npx tsx xyph-actuator.ts status --view all`
