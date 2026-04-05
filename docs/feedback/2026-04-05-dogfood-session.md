# Dogfood Session: 2026-04-05

First full end-to-end development session using XYPH's own governance
pipeline. One feature cycle completed (`task:cli-search`), one stale quest
sealed (`task:GRAPH-CLEANUP`), and extensive friction discovered across
both CLI and TUI surfaces.

**Milestone:** Completed a full METHOD cycle (design doc → RED → GREEN →
playback → retro → seal) entirely through XYPH's graph — no GitHub issues,
no PRs for governance. The WARP graph handled intent, sovereignty,
traceability, and settlement for a real feature.

---

## Session Statistics

- **Backlog items filed:** 20
- **Throwaway scripts written:** 9
- **Command failures/retries:** ~15
- **Quests sealed:** 2 (task:cli-search, task:GRAPH-CLEANUP)
- **Invariant violations found:** 1 (substrate-boundary)
- **Bugs found:** 5

---

## Friction Log: Every Throwaway Script

Every time the agent wrote a custom script to work around CLI limitations.

| # | What | Why | Backlog item |
|---|---|---|---|
| 1 | `status --view all --json \| python3` count by status | No stats command | task:cli-search (DONE) |
| 2 | `doctor --json \| python3 json.load()` → failed, multi-line JSONL | Doctor emits JSONL, not single JSON | (unfiled — doctor output format) |
| 3 | `status --view all --json \| python3` search for "MCP" | No keyword search | task:cli-search (DONE) |
| 4 | `status --view lineage --json \| python3` list intent IDs | No way to discover valid reference values | task:governance-friction-audit |
| 5 | `status --view all --json \| python3` list campaign IDs | Same — no reference value discovery | task:governance-friction-audit |
| 6 | `search --status GRAVEYARD --json \| python3` format count | Even after building search, piped through python | (habit / pretty-print) |
| 7 | `search --json \| python3 -m json.tool` pretty-print | No built-in pretty output for JSON | (minor) |
| 8 | `search --stats --json \| python3 -m json.tool` pretty-print | Same | (minor) |
| 9 | `_check-suggestions.ts` (5 attempts to get working) | Cannot see TUI suggestion nodes from CLI | task:suggestion-visibility-fix |

**Pattern:** The CLI's `--json` mode is designed for agent consumption but
the agent still has to parse it through external tools. The most common
queries (search, stats, list valid values) had no built-in commands.

---

## Friction Log: Every Command That Failed on First Try

Every time a command was invoked incorrectly and required a retry.

| # | What was tried | Error | Root cause |
|---|---|---|---|
| 1 | `doctor --json \| json.load()` | JSONDecodeError: Extra data | Doctor emits multi-line JSONL, not single JSON object |
| 2 | `link task:cli-search --to campaign:CLITOOL` | required option '--campaign' not specified | `link` uses `--campaign`, not `--to` |
| 3 | `promote ... --intent intent:agent-ergonomics` | Intent not found | No way to discover valid intents without separate query |
| 4 | `promote task:cli-search` (as agent.prime) | promote requires human principal | Discovered by error, not documented in help |
| 5 | `promote ...` (without --description) | requires --description when quest has none | Conditional requirement, discovered by error |
| 6 | `story ...` (without --title) | required option '--title' not specified | Missing required arg |
| 7 | `story ...` (without --persona) | required option '--persona' not specified | Had to run --help after first failure |
| 8 | `merge ...` (without XYPH_ALLOW_UNSIGNED_SCROLLS) | Missing private key | No guild seal key configured for human.james |
| 9 | `_check-suggestions.ts` with `WarpGraph` | Does not provide export named 'WarpGraph' | Export is `WarpCore`, not `WarpGraph` |
| 10 | `_check-suggestions.ts` with top-level await | Top-level await not supported with cjs | tsx -e doesn't support top-level await |
| 11 | `_check-suggestions.ts` in /tmp/ | Cannot find module '@git-stunts/git-warp' | Must run from project dir for node_modules |
| 12 | `_check-suggestions.ts` wrong constructor args | logger?.debug is not a function | Constructor arg order: (cwd, graphName, writerId, logger?) |
| 13 | `_check-suggestions.ts` without writerId | Invalid writer ID: expected string, got undefined | writerId is required, not optional |

**Pattern:** Almost every governance command required 1–2 failures to
discover required arguments. The CLI does not guide you through the flow —
it waits for you to fail and then tells you what was wrong.

---

## Friction Log: Governance Pipeline (13 Steps for 109 LOC)

The full BACKLOG → DONE pipeline for `task:cli-search`:

| Step | Command | Required fields | Friction |
|---|---|---|---|
| 1 | `promote` | `--as human.*`, `--description`, `--intent` | 3 retries to get right |
| 2 | `move` | `--campaign` | Separate from promote — why? |
| 3 | `story` | `--title`, `--persona`, `--goal`, `--benefit`, `--intent` | 2 retries (missing required args) |
| 4 | `decompose` | `<from> <to>` | OK |
| 5 | `requirement` | `--description`, `--kind`, `--priority` | OK |
| 6 | `implement` | `<quest> <requirement>` | OK |
| 7 | `criterion` | `--description`, `--requirement` | OK |
| 8 | `ready` | (gated on steps 1–7) | Failed twice before prerequisites met |
| 9 | `claim` | (none) | OK |
| 10 | `submit` | `--description` | OK |
| 11 | `evidence` | `--kind`, `--result`, `--criterion`, `--produced-by`, `--artifact-hash` | 5 required fields to say "tests pass" |
| 12 | `review` | `--as human.*`, `--verdict`, `--comment` | OK |
| 13 | `merge` | `--rationale` + `XYPH_ALLOW_UNSIGNED_SCROLLS=1` | Env var workaround |

**Observations:**
- Steps 2–7 (campaign + traceability chain) are 6 commands to establish
  governance metadata. For a solo agent cycle, this is pure overhead.
- The traceability chain (story → requirement → criterion → evidence) is
  designed for multi-stakeholder review but is mandatory even for trivial
  features.
- `promote` + `move` + `authorize` could be one command.
- `evidence` requires 5 fields to record "14 tests pass" — the test suite
  result should be auto-capturable.

---

## Bugs Found

| Bug | Status | Backlog item |
|---|---|---|
| TUI spiral animation doesn't animate (cached during loading, no tick source after) | Filed | task:landing-spiral-animation |
| `status --view suggestions` returns 0 despite 8 suggestion nodes in graph | Root-caused | task:suggestion-visibility-fix |
| Merged/closed quests appear in TUI review tab | Filed | task:review-tab-stale-quests |
| Graph sync blocks main thread, TUI hitches | Filed | task:sync-blocks-main-thread |
| [ai] tag appears on human suggestions, not AI ones | Filed | task:ai-tag-wrong-source |

---

## Invariant Violation

**invariant:substrate-boundary** — `ObservedGraphProjection.ts` (1700 LOC)
reimplements git-warp's read surface. It re-queries every node type, builds
typed arrays, re-resolves edges into denormalized fields, and maintains
per-entity-type projection loops. This is XYPH owning substrate mechanics
that belong to git-warp.

Direct consequence: the `aiSuggestions` blind spot. The projection builds
two separate arrays (`suggestions` and `aiSuggestions`) but the CLI only
reads one. Every time a new entity type is added, every consumer must be
manually updated.

Filed: task:snapshot-invariant-violation, task:snapshot-layer-audit

---

## Cool Ideas and Feature Requests

| Idea | Source | Backlog item |
|---|---|---|
| MCP API — expose WARP graph as MCP tools | human.james | task:mcp-api |
| Configurable estimation (t-shirt sizes, hours, none) per project | human.james | task:configurable-estimation |
| TUI incomplete quest indicator (!) | human.james | task:tui-incomplete-quest-indicator |
| TUI create backlog item (inbox) from dashboard | human.james | task:tui-create-quest |
| TUI mark all as seen | human.james | task:tui-mark-all-seen |
| TUI assign flow | human.james | task:tui-assign-flow |
| TUI guild view | human.james | task:tui-guild-view |
| TUI notification feedback improvements | human.james | task:notification-feedback-improvements |
| CLI next/frontier command | agent.claude | task:cli-next-command |
| Doctor: flag stale IN_PROGRESS quests | agent.claude | task:doctor-stale-in-progress |
| Bridge TUI ask-ai jobs to CLI agent visibility | agent.claude | task:tui-cli-bridge |

---

## Process Violations Caught

1. **Code before design doc.** The search command was fully implemented
   before the design doc was written. James caught it. Corrected
   retroactively. Feedback memory saved: every feature requires a cycle.

2. **Backlog items filed before consolidation.** Filed 4 separate CLI
   search items, then consolidated into 1. Should have designed first.

3. **Forgot to seal completed work.** `task:GRAPH-CLEANUP` sat in
   IN_PROGRESS for an entire session after its work was merged.

---

## What We Proved

Despite all the friction, this session proved that XYPH's governance model
works end-to-end:

- **Full cycle without GitHub:** Design doc → RED → GREEN → playback →
  retro → seal, all through the WARP graph.
- **Stigmergy works:** Human filed ask-ai jobs in TUI, agent found them
  in the graph (even if the CLI couldn't surface them yet).
- **The graph is the truth:** Every piece of work, every decision, every
  rejection rationale is in the graph with provenance.
- **Dogfooding produces signal:** 20 backlog items from one session. The
  friction IS the roadmap.

---

## Recommended Priority Sort

### Critical (invariant violations, data loss risk)
1. task:snapshot-invariant-violation — substrate-boundary violation
2. task:suggestion-visibility-fix — data exists but CLI can't see it
3. task:sync-blocks-main-thread — UX-breaking hitch

### High (workflow blockers)
4. task:governance-friction-audit — 13 commands for 109 LOC
5. task:tui-create-quest — humans can't do basic project management in TUI
6. task:tui-cli-bridge — surfaces can't see each other's writes
7. task:review-tab-stale-quests — stale data in review tab

### Medium (ergonomic gaps)
8. task:cli-next-command — "what should I work on?"
9. task:doctor-stale-in-progress — forgotten IN_PROGRESS quests
10. task:configurable-estimation — per-project estimation style
11. task:tui-mark-all-seen — bulk mark-as-read
12. task:ai-tag-wrong-source — inverted label

### Lower (enhancements)
13. task:landing-spiral-animation — cosmetic bug
14. task:tui-assign-flow — assign quests from TUI
15. task:tui-guild-view — see guild members
16. task:tui-incomplete-quest-indicator — visual indicator
17. task:notification-feedback-improvements — better toast/feedback
18. task:xyph-retrospectives — first-class retro entities
19. task:mcp-api — MCP server (bigger effort, deferred)
20. task:snapshot-layer-audit — deeper architectural analysis
