# XYPH Roadmap

The milestones below are ordered by dependency — each layer builds on the one before it. The numbering is historical (order of conception), not execution order.

## The Arc

```
DONE                          NEXT                    FUTURE
─────────────────────────    ──────────────────────   ──────────────────────────────
Bedrock → Heartbeat →        Weaver →                 Oracle →
Triage → Sovereignty →       CLI Tooling →            Forge →
Dashboard → Submission       Traceability             Ecosystem (MCP, Web, IDE)
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

---

## NEXT — The Structure Sprint

These three milestones transform XYPH from a task tracker into a self-organizing system. They should be shipped in this order.

### Milestone 7: Weaver ← **START HERE**
*Task dependency graph, cycle detection, frontier computation, topological sort, critical path.*

**Why it's next:** Without dependencies, we're manually deciding what to work on. Weaver makes the graph computable — it can answer "what's ready?" and "what's the critical path?" automatically.

**What it unlocks:**
- `depends-on` / `blocked-by` edges between tasks
- Cycle detection at ingest (reject circular dependencies)
- Frontier set: the tasks with no unmet dependencies (the "ready" queue)
- Topological sort: execution order via Kahn's algorithm
- Critical path: longest weighted path through the DAG (using task hours)

**After Weaver, the TUI roadmap view becomes meaningful** — it can show tasks in dependency order, highlight the critical path, and surface what's actually workable.

### Milestone 10: CLI Tooling
*Identity resolution, `xyph whoami`, `xyph login/logout`, auto-generated IDs, `--json` output, git hooks.*

**Why it's next:** The CLI is the primary interface. It needs proper identity (not env var spoofing), scriptable output, and auto-generated IDs to support the traceability model.

**Key items:**
- 5-layer identity resolution (replaces `XYPH_AGENT_ID` env var)
- Auto-generated node IDs (kills naming convention overhead)
- `--json` output mode (enables scripting, web UI, MCP)
- Pre-push type-check hook
- `xyph scan` command (test annotation → evidence nodes)

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

## Inbox (33 items)

Untriaged ideas awaiting promotion into the milestones above. Run `npx tsx xyph-actuator.ts status --view inbox` to see them.

---

## How to Read This

- **DONE** milestones are shipped and tested. Their tasks are sealed in the graph.
- **NEXT** milestones are the current focus, in dependency order. Start at Weaver.
- **FUTURE** milestones have specs but depend on the structure sprint.
- The inbox is a parking lot — items get promoted into milestones during triage.
- Task-level detail lives in the WARP graph: `npx tsx xyph-actuator.ts status --view all`
