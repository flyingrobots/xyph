# XYPH Steering Plan: Honest Core -> Agent-Native -> Human-Friendly

## Summary

XYPH should be steered through three checkpoints:

1. **Honest Core** — make the runtime, graph, and canonical docs agree.
2. **Agent-Native** — make XYPH the policy-bounded operating interface for agents.
3. **Human-Friendly** — make the human operator surface reuse the same kernel.

This replaces the earlier bias toward “truth first, then TUI.” The TUI is
important, but it should be layered on top of a real agent-native protocol and
action kernel, not built ahead of it.

## Checkpoint 1 — Honest Core

Focus:

- keep lifecycle, readiness, traceability, and settlement behavior truthful
- finish self-dogfooding on governed campaigns such as `CLITOOL` and `TRACE`
- backfill stale self-roadmap state so shipped capabilities are reflected in the
  graph
- treat `show` and the quest-detail projection as the canonical issue-page
  substrate

Completion bar:

- `status --json`, `show --json`, and `audit-sovereignty --json` are truthful
  and stable
- governed quests cannot pass readiness or settlement dishonestly
- the repo's own graph contains real stories, requirements, criteria, and
  evidence

## Checkpoint 2 — Agent-Native

Focus:

- build the shared agent services:
  - `AgentBriefingService`
  - `AgentRecommender`
  - `AgentActionValidator`
  - `AgentActionService`
  - `AgentContextService` or equivalent
- stabilize the agent-facing JSON commands:
  - `briefing`
  - `next`
  - `context`
  - `submissions`
  - `act`
  - `handoff`
- make `act` a policy-bounded action kernel over routine operations

Checkpoint-2 action kinds:

- `claim`
- `shape`
- `packet`
- `ready`
- `comment`
- `submit`
- `review`
- `handoff`
- `seal`
- `merge`

Still human-only in checkpoint 2:

- `intent`
- `promote`
- `reject`
- `reopen`
- `depend`
- campaign mutation
- policy mutation
- any constitutionally sensitive scope or sovereignty change

Completion bar:

- a cold-start agent can orient, choose work, act through XYPH, submit or
  review, settle governed work when policy passes, and leave a graph-native
  handoff
- every allowed agent mutation flows through the same validators and gates as
  the human CLI

## Checkpoint 3 — Human-Friendly

Focus:

- build an ops-grade human surface on top of the same read/write services
- prioritize quest detail, triage, submissions, graveyard, alerts,
  traceability coverage, and graph/trust health
- keep the TUI as an operator console, not a separate workflow model
- drive the human surface through the sponsor-user / hills / playback framing in
  [`docs/XYPH_PRODUCT_DESIGN.md`](docs/XYPH_PRODUCT_DESIGN.md) rather than
  through ad hoc pane accretion

Defer out of this checkpoint:

- web UI
- polish-first redesign work
- graph explorer vanity features
- large TUI chains that do not improve operator throughput

Completion bar:

- a human can supervise agents, inspect quests like issue pages, triage work,
  review submissions, and override when allowed, entirely through XYPH

## Product Decisions

- **One source of truth**: CLI, agent protocol, and TUI all consume the same
  graph-backed read models.
- **One action kernel**: `act` and future human surfaces reuse the same domain
  validators and mutation services.
- **JSON first**: CLI `--json` is the primary automation surface; MCP is later.
  The `--json` contract is JSONL: commands may emit non-terminal `start` /
  `progress` records, and they always terminate with exactly one success or
  error record.
- **Graph-native collaboration**: quest-linked notes, specs, comments, and
  handoffs live in the graph, not in repo files as the source of truth.
- **Compiler track deferred**: ORACLE/FORGE remains important, but it is not a
  checkpoint blocker before the agent-native kernel is real.

## Acceptance and Verification

- Keep build, lint, and local test suite green through every checkpoint.
- Add golden JSON tests for the agent-facing commands.
- Add end-to-end agent session tests:
  - `briefing -> next -> context -> act -> submit/review/merge/seal -> handoff`
- Add negative tests for:
  - human-only actions
  - readiness, sovereignty, and settlement rejections
  - governed incomplete work
- Add self-hosting checks proving XYPH can coordinate and advance its own
  roadmap through the agent-native protocol.

## Assumptions and Defaults

- Checkpoint order is fixed: Honest Core -> Agent-Native -> Human-Friendly.
- The agent-native checkpoint is intentionally bold: it includes an action
  kernel, not just read-only agent commands.
- Agent authority is policy-bounded, not sovereign.
- Human-friendly means ops-grade TUI first, not web-first.
