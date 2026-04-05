# Retrospective: 0026 — CLI Search Command

## Cycle Summary

Added a unified `search` CLI command that replaces ad-hoc Python scripts
agents were writing to query the quest graph.

**Duration:** Single session (2026-04-05)
**Commits:** 3 (implementation, design doc, playback+retro)

## Playback Witness

All 4 playback questions answered affirmatively with live evidence:

1. **Can I search for "MCP" without writing a script?**
   YES — `xyph search "MCP"` returns 2 results (task:mcp-api, task:mcp-server)
   in both JSON and human-readable modes.

2. **Can I see what's in the graveyard by status filter?**
   YES — `xyph search --status GRAVEYARD` returns 124 graveyard quests.
   Graveyard is always included — no opt-in flag needed.

3. **Can I get a quick count per status in one command?**
   YES — `xyph search --stats` returns counts: BACKLOG 46, DONE 86,
   GRAVEYARD 124, IN_PROGRESS 1, PLANNED 13 (270 total).

4. **Does JSON output work for agent consumption?**
   YES — all modes emit `{ success, command, data }` envelopes. Keyword +
   status combination works. Empty results return count: 0, not errors.

## Acceptance Checkpoint Results

- Checkpoint 1 (keyword search): 4/4 tests pass — title, ID, description match, empty result
- Checkpoint 2 (status filter): 4/4 tests pass — single status, GRAVEYARD, combined, empty intersection
- Checkpoint 3 (stats mode): 1/1 test passes — counts by status with total
- Checkpoint 4 (output modes): 2/2 tests pass — JSON envelope, human-readable
- Checkpoint 5 (graveyard metadata): 1/1 test passes — rejectionRationale included

14/14 unit tests green. Build clean. Lint clean. 1005 total tests passing.

## What Went Well

- The command is genuinely useful — I used it within the same session to check
  for MCP prior art before filing a new backlog item.
- Implementation was small (109 LOC) and pure — no new graph schema, no new
  adapters, just filtering over the existing snapshot pipeline.
- Existing test helpers (makeSnapshot, quest builder, makeObservationSessionFake)
  made test setup trivial.

## What Went Wrong

- **Process violation: code before design doc.** I wrote the full implementation
  and tests before writing the design doc. James caught it. The design doc was
  written retroactively. This is the wrong order — even for small features.
- **Initially filed 4 separate backlog items then consolidated.** Should have
  thought through the design before filing granular items. The consolidation
  into one `task:cli-search` was correct but the churn was avoidable.
- **Governance pipeline required 13 commands and 8 retries to ship 109 LOC.**
  The full BACKLOG→DONE flow is documented below.

## Friction Audit: Scripts Written to Parse CLI Output (8 instances)

| # | What | Why |
|---|---|---|
| 1 | `status --view all --json \| python3` | Count quests by status — no stats command existed |
| 2 | `doctor --json \| python3 json.load()` | Parse doctor output — **failed** because doctor emits multi-line JSONL, not single JSON. Had to `tail -1`. |
| 3 | `status --view all --json \| python3` | Search for MCP-related tasks by keyword — no search existed |
| 4 | `status --view lineage --json \| python3` | List intent IDs so I could pick one for `promote` |
| 5 | `status --view all --json \| python3` | List campaign IDs so I could pick one for `move` |
| 6 | `search --status GRAVEYARD --json \| python3` | Even AFTER building search, I piped through python to format the count |
| 7 | `search "MCP" --json \| python3 -m json.tool` | Pretty-print search results |
| 8 | `search --stats --json \| python3 -m json.tool` | Pretty-print stats |

**Pattern:** The CLI has no built-in way to list valid values for reference
fields (intents, campaigns). When a command needs `--intent <id>`, the agent
must query the graph separately to discover valid IDs.

## Friction Audit: Commands That Failed on First Try (8 instances)

| # | What I tried | What went wrong |
|---|---|---|
| 1 | `doctor --json \| json.load()` | Multi-line JSONL, not single JSON object |
| 2 | `link task:cli-search --to campaign:CLITOOL` | Wrong flag — `link` uses `--campaign`, not `--to` |
| 3 | `promote ... --intent intent:agent-ergonomics` | Intent doesn't exist — no way to know without querying first |
| 4 | `promote task:cli-search ...` (as agent.prime) | Promote requires `--as human.*` — discovered by error |
| 5 | `promote ...` (without --description) | Required when quest has no description — discovered by error |
| 6 | `story ...` (without --title) | Missing required arg — discovered by error |
| 7 | `story ...` (without --persona) | Missing required arg — discovered by error on second try |
| 8 | `merge ...` (without unsigned env var) | No guild seal key for human.james — needed `XYPH_ALLOW_UNSIGNED_SCROLLS=1` |

**Pattern:** Almost every governance command required 1–2 failures before the
right incantation was found. The CLI tells you what's wrong after you fail, but
doesn't guide you through required fields upfront.

## Friction Audit: Governance Pipeline (13 commands for 109 LOC)

| Step | Command | Friction |
|---|---|---|
| 1 | `promote` | 3 friction points: human principal, description, valid intent |
| 2 | `move` | Separate from promote — why? |
| 3 | `story` | 5 required fields |
| 4 | `decompose` | story→req edge |
| 5 | `requirement` | 3 required fields |
| 6 | `implement` | task→req edge |
| 7 | `criterion` | 2 required fields |
| 8 | `ready` | Gated on all of the above |
| 9 | `claim` | Fine |
| 10 | `submit` | Fine |
| 11 | `evidence` | 5 required fields to say "tests pass" |
| 12 | `review` | Needed human principal |
| 13 | `merge` | Needed unsigned scroll workaround |

## Friction Categories and Potential Fixes

1. **Discoverability** — The CLI doesn't help discover valid values for
   reference fields. When `promote` needs `--intent <id>`, you shouldn't need a
   separate `status --view lineage` query. Tab completion, fuzzy search, or a
   `--list-intents` flag would eliminate half the retries.

2. **Atomicity mismatch** — The traceability chain (story→req→criterion→evidence)
   models a multi-stakeholder review process, but for solo agent cycles it's
   pure overhead. A "fast-track" command like `cycle start task:X` that
   scaffolds the whole chain in one shot would preserve the graph structure
   while eliminating the 5-command dance.

3. **Error-driven discovery** — Required fields are only surfaced when you fail.
   The wizard system (`registerWizardCommands`) already exists in the codebase —
   interactive prompts could guide the flow instead of making you guess.

## Lessons

1. **Every feature requires a cycle.** No exceptions based on perceived size.
   The design doc is where you discover scope, invariants, and what NOT to
   build. Skipping it means flying blind even if the code is trivial.
2. **Desire paths are feature signals.** When the agent writes throwaway scripts
   around the CLI, that's a backlog item. Feedback memory saved for this.
3. **Consolidate before filing.** Think about whether multiple items are really
   one implementation before creating separate graph nodes.
4. **Dogfood the governance loop.** The 13-command overhead was invisible until
   we actually ran it. Filed as `task:governance-friction-audit`.
5. **CLI must guide, not interrogate.** Error-driven discovery (fail → read
   error → retry) is the worst UX for an agent consumer. The CLI should either
   prompt for missing fields or accept a single composite command.
