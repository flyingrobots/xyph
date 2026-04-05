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

## Lessons

1. **Every feature requires a cycle.** No exceptions based on perceived size.
   The design doc is where you discover scope, invariants, and what NOT to
   build. Skipping it means flying blind even if the code is trivial.
2. **Desire paths are feature signals.** When the agent writes throwaway scripts
   around the CLI, that's a backlog item. Feedback memory saved for this.
3. **Consolidate before filing.** Think about whether multiple items are really
   one implementation before creating separate graph nodes.
