# AGENT PROTOCOL
**Version:** 0.1.0
**Status:** DRAFT
**Depends on:** CONSTITUTION.md, ROADMAP_PROTOCOL.md, TRACEABILITY.md, ARCHITECTURE.md

## 1. Purpose

XYPH's agent protocol defines the **agent-native CLI** and the **action kernel**
that sits behind it.

The goal is not "friendlier scripting." The goal is that an agent can:

1. enter the repo cold,
2. ask XYPH what is true,
3. ask XYPH what it is allowed to do,
4. execute allowed routine work through XYPH itself,
5. leave durable graph-native handoff state behind.

The agent protocol is therefore a **policy-bounded operating interface**, not a
second workflow model and not an informal wrapper around raw commands.

## 2. Core Rules

1. **One source of truth**
   All agent protocol reads come from the same graph-backed read models used by
   human surfaces. No agent-only shadow state.

2. **One action kernel**
   Agent writes must reuse the same validators and domain services that govern
   normal CLI commands. `act` is a strict door, not a shortcut.

3. **JSON first**
   The primary agent API is CLI `--json`. Text and markdown are debug and
   context-injection modes, not the canonical wire shape.

4. **Policy-bounded authority**
   Agents may perform routine operations when XYPH gates pass. Sovereignty,
   scope control, and constitutionally sensitive changes remain human-bound.

5. **Graph-native collaboration**
   Handoffs, notes, comments, and quest-linked discussion live in the WARP
   graph as nodes with queryable metadata and attached content blobs.

## 3. Command Set

The agent-native CLI surface is:

- `xyph briefing`
- `xyph next`
- `xyph context <id>`
- `xyph submissions`
- `xyph act <kind> <target>`
- `xyph handoff`

Existing domain commands such as `submit`, `review`, `seal`, and `merge` remain
the underlying mutation primitives. `act` wraps them with a common validation
and response contract.

Current runtime tranche:

- shipped now: `claim`, `shape`, `packet`, `ready`, `comment`
- planned later in checkpoint 2: `submit`, `review`, `handoff`, `seal`, `merge`

### 3.1 `show` vs `context`

- `show <id>` remains general entity inspection.
- `context <id>` is the work packet for agents.

`context` must be deeper and more action-oriented than `show`. For `task:*`, it
includes:

- quest detail and timeline
- campaign and intent lineage
- upstream and downstream dependency context
- active or recent submissions, reviews, and decisions
- traceability packet, computed completion, and applied policy state
- recent graph-native docs and comments
- recommended next actions for that specific target

## 4. JSON Contracts

### 4.1 `briefing --json`

`briefing` is the start-of-session orientation document. At minimum it returns:

- `identity`
- `assignments`
- `reviewQueue`
- `frontier`
- `alerts`
- `graphMeta`

Each frontier or review entry should already contain an executable next step or
an action candidate reference.

### 4.2 `next --json`

`next` returns structured action candidates, not prose-only recommendations.

Each candidate must include at least:

- `kind`
- `targetId`
- `args`
- `reason`
- `confidence`
- `requiresHumanApproval`
- `dryRunSummary`
- `blockedBy`

The first candidate is the default recommendation. Remaining candidates are
ordered alternatives.

### 4.3 `submissions --json`

`submissions` is the agent-facing queue view. It should group at least:

- `owned` submissions
- `reviewable` submissions
- `stale` or attention-needed submissions

Each entry should expose enough normalized data for `act review ...` or
follow-on `context` calls without forcing extra graph archaeology.

### 4.4 `act --json`

`act` is a generic validated execution wrapper:

```bash
xyph act <kind> <target> [action-specific options] [--dry-run] --json
```

The `--json` result must include:

- `kind`
- `targetId`
- `allowed`
- `dryRun`
- `requiresHumanApproval`
- `validation`
- `normalizedArgs`
- `underlyingCommand`
- `sideEffects`
- `result`
- `patch` when a mutation succeeds

`validation` must contain machine-readable failure reasons when the action is
rejected. Rejections must happen **before** any graph or workspace mutation.

### 4.5 `handoff --json`

`handoff` records session closeout as durable graph state. The JSON result must
include:

- `noteId`
- `authoredBy`
- `authoredAt`
- `relatedIds`
- `patch`

The output may also include summarization stats such as affected tasks,
submissions, or recent patches, but those are secondary to the durable note.

## 5. Action Kernel

Checkpoint-2 action kinds are:

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

These are the only routine agent actions that should be executable through
`act` in the checkpoint-2 kernel.

The current runtime implementation ships the first tranche only:

- `claim`
- `shape`
- `packet`
- `ready`
- `comment`

### 5.1 Human-only actions

The following remain human-only in checkpoint 2:

- `intent`
- `promote`
- `reject`
- `reopen`
- `depend`
- campaign mutation
- policy mutation
- any action that changes scope, critical path, or sovereignty state in a way
  that the constitution reserves for humans

If an agent requests one of these through `act`, XYPH must reject it with an
explicit machine-readable reason such as:

- `human-only-action`
- `requires-human-approval`
- `sovereignty-boundary`

### 5.2 Validation sources

The action kernel must reuse existing domain gates rather than re-inventing
them:

- readiness checks from `ReadinessService`
- submission workflow validation from `SubmissionService`
- settlement checks from `SettlementGateService`
- sovereignty enforcement from `SovereigntyService`
- quest/campaign read models from `GraphContext`

### 5.3 Dry-run semantics

Every `act` kind supports `--dry-run`.

Dry-run must:

- run the same validation stack as real execution
- resolve normalized arguments
- report expected side effects
- perform no graph or workspace mutation

## 6. Handoff Storage Model

`handoff` does not introduce a new node family in checkpoint 2.

It writes a `note:*` node with:

- `type = note`
- `note_kind = handoff`
- `authored_by`
- `authored_at`
- optional session metadata such as `session_started_at` and `session_ended_at`

Relationships are represented with edges:

- `documents -> task:*`
- `documents -> submission:*`
- `documents -> campaign:*` when the handoff is campaign-scoped

The long-form session summary lives in attached content via WARP content blobs.

## 7. Architecture

The agent-native CLI should be implemented as a thin driving adapter over shared
domain services:

- `AgentBriefingService`
- `AgentRecommender`
- `AgentActionValidator`
- `AgentActionService`
- `AgentContextService` or an equivalent context-specialized read service

The high-level flow is:

```text
CLI command
  -> GraphContext-backed read model or agent service
  -> shared domain validator / action service
  -> existing mutation adapters and domain services
  -> WARP graph / git workspace
```

The TUI and future MCP layer must reuse these services rather than implementing
their own mutation logic.

## 8. Relationship to Other Agent Docs

`AGENT_CHARTER.md` describes a speculative multi-agent role architecture.
It does **not** define the concrete agent-native CLI.

This document is the canonical spec for:

- the agent-facing CLI contract
- the action-kernel authority boundary
- the required JSON envelopes
- handoff persistence

If the charter and this protocol diverge, this protocol governs implementation
of the CLI and action kernel.

## 9. Acceptance Bar

The agent-native checkpoint is complete when a cold-start agent can:

1. run `briefing`
2. run `next`
3. inspect a target with `context`
4. execute allowed routine work through `act`
5. submit or review through the same kernel
6. settle governed work only when XYPH gates pass
7. leave a graph-native `handoff`

At that point, XYPH is no longer just "usable by agents." It is the agent's
operating interface.
