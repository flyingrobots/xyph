# 0026: CLI Search Command

## Cycle Type

Feature delivery cycle

## Status

Active — GREEN complete, playback pending.

This cycle was pulled on 2026-04-05 after repeatedly scripting ad-hoc Python
parsers to search, filter, and count quests from `status --json` output. The
agent (Claude) is the primary consumer of the xyph CLI, and the lack of a
built-in search surface was creating a desire-path pattern every session.

## Graph Anchor

- Work item: `task:cli-search`
- Legend: SURF (surface layer)

Related graph-visible context:

- `task:mcp-api` (future: MCP will expose search as a tool)
- `task:mcp-server` (future: search becomes an MCP endpoint)

## Why This Cycle Exists

Every session, the agent writes throwaway Python scripts to answer basic
questions about the graph:

- "Are there any MCP-related tasks already?"
- "What's in the graveyard?"
- "How many quests per status?"

These are not exotic queries. They are the first thing an agent does before
adding a backlog item (check for prior art) or starting work (understand the
landscape). The CLI had no search surface — only fixed views via
`status --view`, which exclude graveyard by default and offer no keyword
filtering.

The `status --view all --json` + Python pipeline worked but violated the
principle that the tool should serve its primary consumer natively.

## Sponsor Actors

### Primary sponsor actor

**Working Agent**

Needs to search the full quest graph (including graveyard) by keyword and
status before adding backlog items or starting work. Cannot afford to write
throwaway scripts every session — the search must be a single CLI invocation
with structured JSON output.

### Secondary sponsor actors

**Operator-Supervisor**

Needs a quick way to query the graph from the terminal without memorizing
view names or piping through jq. Wants to answer "how many things are in
each status?" and "what happened to task X?" in one command.

## Outcome Hill

**As an agent or human working in the xyph repo, I can find any quest in the
graph — including graveyard — by keyword, status, or summary stats, in a
single CLI invocation with structured output.**

## Invariants

This cycle must preserve:

- The graph is the plan — search reads from the materialized snapshot, no
  separate index or cache.
- Graveyard quests are first-class searchable results, not hidden behind
  opt-in flags.
- JSON output follows the existing `{ success, command, data }` envelope.
- No new graph schema — search is a read-only projection over existing
  `QuestNode` data.
- No userland graph algorithms — filtering happens on the materialized
  snapshot array.

## Scope

In scope:

- `search [keyword]` command with case-insensitive matching on ID, title,
  description
- `--status <STATUS>` filter for any valid quest status including GRAVEYARD
- `--stats` mode returning counts grouped by status
- Combined keyword + status filtering
- JSON and human-readable output modes
- Registration in xyph-actuator, CHANGELOG, CLAUDE.md command reference

Out of scope:

- Regex or glob pattern matching
- Searching non-quest entities (intents, campaigns, submissions)
- Full-text search or relevance ranking
- Pagination or result limits
- MCP tool exposure (that's `task:mcp-api` / `task:mcp-server`)

## Acceptance-Test Plan

### Checkpoint 1: Keyword search

1. Case-insensitive substring match on quest title.
2. Substring match on quest ID.
3. Substring match on quest description.
4. No match returns empty results (not an error).

### Checkpoint 2: Status filter

5. `--status BACKLOG` returns only BACKLOG quests.
6. `--status GRAVEYARD` returns graveyard quests (always included).
7. Keyword + status combined narrows results correctly.
8. Keyword + status with no intersection returns empty.

### Checkpoint 3: Stats mode

9. `--stats` returns counts grouped by status with total.

### Checkpoint 4: Output modes

10. JSON mode emits `{ success, command, data }` envelope.
11. Non-JSON mode prints human-readable lines.

### Checkpoint 5: Graveyard metadata

12. Graveyard quest results include `rejectionRationale`.

## Implementation Notes

- Reuses the existing `ObservationPort.fetchSnapshot()` pipeline — same
  read path as `status`, just with different post-filtering.
- Snapshot is fetched with `'operational'` profile. Graveyard inclusion is
  inherent — the raw snapshot always includes graveyard quests, and search
  does NOT apply `filterGraphSnapshot()`.
- `matchesKeyword()` is a pure function: lowercase comparison on three
  string fields. No fuzzy matching, no regex.
- `questToResult()` maps `QuestNode` to a plain object, including optional
  graveyard metadata fields when present.

## Playback Questions

1. Can I search for "MCP" and find existing MCP-related tasks without writing
   a script?
2. Can I see what's in the graveyard by status filter alone?
3. Can I get a quick count of quests per status in one command?
4. Does JSON output work cleanly for agent consumption?

## Exit Criteria

This cycle closes when:

- All 14 unit tests pass
- Live smoke tests demonstrate keyword, status, stats, and graveyard search
- Build and lint are clean
- CHANGELOG and CLAUDE.md command reference updated
- Playback witness recorded
- Retro written
