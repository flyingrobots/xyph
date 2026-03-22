# AGENT PROTOCOL
**Version:** 0.1.0
**Status:** DRAFT
**Depends on:** CONSTITUTION.md, ROADMAP_PROTOCOL.md, TRACEABILITY.md, ARCHITECTURE.md

## 1. Purpose

XYPH's agent protocol defines the **agent-facing compatibility projection** and
the **action kernel** that sits behind it.

The canonical machine-facing protocol is the sovereign `xyph api` JSONL control
plane. This document describes the higher-level agent workflow surface layered
over that control plane while XYPH transitions away from workflow-first CLI
thinking.

The product-design source of truth for how the human and agent surfaces should
fit together now lives in [`../XYPH_PRODUCT_DESIGN.md`](../XYPH_PRODUCT_DESIGN.md).
This protocol document defines command and contract truth; the design document
defines sponsor actors, hills, queue models, and workflow intent.

The goal is not "friendlier scripting." The goal is that an agent can:

1. enter the repo cold,
2. ask XYPH what is true,
3. ask XYPH what it is allowed to do,
4. execute allowed routine work through XYPH itself,
5. leave durable graph-native handoff state behind.

The agent protocol is therefore a **policy-bounded operating interface**, not a
second workflow model and not an informal wrapper around raw commands.

Load-bearing rule: **Observer profiles do not grant authority by existing.**
The agent protocol may name observer-facing projections, but effective
capability is still resolved from the principal, observer profile, policy pack,
and observation/worldline coordinate.

## 2. Core Rules

1. **One source of truth**
   All agent protocol reads come from the same graph-backed read models used by
   human surfaces. No agent-only shadow state.

2. **One action kernel**
   Agent writes must reuse the same validators and domain services that govern
   normal CLI commands. `act` is a strict door, not a shortcut.

3. **JSONL first**
   The canonical machine interface is `xyph api`, which uses versioned JSONL
   request and result envelopes. The legacy agent-facing CLI still uses `--json`
   JSONL streams and is a compatibility layer over the same graph-backed domain
   services.

3a. **JSONL framing**
   `--json` is a newline-delimited JSON stream, not a single giant blob by
   contract. Every command emits:
   - zero or more non-terminal event records such as `start` and `progress`
   - exactly one terminal success or error record

   Commands that have nothing meaningful to stream still comply by emitting a
   one-record JSONL stream whose only line is the terminal success or error
   envelope.

4. **Policy-bounded authority**
   Agents may perform routine operations when XYPH gates pass. Sovereignty,
   scope control, and constitutionally sensitive changes remain human-bound.

5. **Independent review**
   A submitter's own review does not satisfy approval policy. Settlement
   requires approval from a different principal on the current tip.

6. **Graph-native collaboration**
   Handoffs, notes, comments, and quest-linked discussion live in the WARP
   graph as nodes with queryable metadata and attached content blobs.
   Review discussion should attach to `patchset:*` and `review:*` nodes so the
   quest issue-page projection can render change-specific threads without
   deferring to GitHub.

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

These commands should be understood as named projections or wrappers over the
canonical control plane, not as the long-term center of the system's ontology.

Current runtime tranche:

- shipped now: `briefing`
- shipped now: `next`
- shipped now: `context <id>`
- shipped now: `submissions`
- shipped now: `handoff`
- shipped now: `claim`, `shape`, `packet`, `ready`, `comment`, `submit`, `review`, `handoff`, `seal`, `merge`
- shipped now: `act <kind> <target>` for that subset

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

### 3.2 Shared Semantic Fields

The agent-native layer should reuse the same semantic field names across
`briefing`, `next`, `context`, `submissions`, and `act` wherever they apply.

The product-design reason is in
[`../XYPH_PRODUCT_DESIGN.md`](../XYPH_PRODUCT_DESIGN.md): agents should not
need shell archaeology to reconstruct the same work and governance judgments
from different command outputs.

Preferred shared fields:

- `requirements`
- `acceptanceCriteria`
- `evidenceSummary`
- `blockingReasons`
- `missingEvidence`
- `nextLawfulActions`
- `claimability`
- `expectedActor`
- `attentionState`

Not every command must return every field, but commands that speak about the
same target should prefer these names instead of command-local synonyms.

`context` now ships the deepest concrete version of this packet for quest
targets. `briefing` and `next` now also emit compatible semantic subsets for
quest work and submission review candidates instead of inventing parallel
names. That shared shape is the reference future governance-target packets
should grow toward.

## 4. JSON Contracts

All `--json` commands use JSONL framing. Consumers must read records line by
line until they receive the terminal success or error envelope.

Event record shape:

- `event`
- `command`
- `at`
- optional `message`
- optional `data`

Terminal success record shape:

- `success: true`
- `command`
- `data`
- optional `diagnostics`

Terminal error record shape:

- `success: false`
- `error`
- optional `data`
- optional `diagnostics`

### 4.1 `briefing --json`

`briefing` is the start-of-session orientation document. At minimum it returns:

- `identity`
- `assignments`
- `reviewQueue`
- `frontier`
- `recommendationQueue`
- `alerts`
- `graphMeta`

Each frontier or review entry should already contain an executable next step or
an action candidate reference.

The runtime may also include `recentHandoffs` so agents can resume from their
own recent closeout notes without hunting through raw quest history.

`briefing` now exposes enough shared semantics to answer the cold-start
questions "what is true?", "what is blocked?", and "what needs me?" without
another round-trip. Quest assignments/frontier work and submission review queue
entries now carry compatible semantic packets built from the shared domain
services, including:

- `attentionState`
- `blockingReasons`
- `expectedActor`
- `nextLawfulActions`

### 4.2 `next --json`

`next` returns structured action candidates, not prose-only recommendations.

Each candidate must include at least:

- `kind`
- `targetId`
- `priority`
- `args`
- `reason`
- `confidence`
- `requiresHumanApproval`
- `dryRunSummary`
- `blockedBy`
- `nextLawfulActions` when the candidate is informative but not immediately executable
- `claimability` when the candidate competes with other actors

The first candidate is the default recommendation. Remaining candidates are
ordered alternatives.

`next` should combine quest-shaping work with active submission workflow
candidates such as `review`, `merge`, and `inspect`, plus urgent doctor-driven
graph-health remediation work when structural blockers are competing with normal
delivery. When a candidate needs additional operator input, it should still be
surfaced with machine-readable blocking reasons instead of silently disappearing
from the queue.

`next` now carries the same semantic vocabulary on quest and submission
candidates when that judgment already exists in the shared domain layer. When
the candidate targets a quest or governance artifact, the payload should
prefer:

- `requirements`
- `acceptanceCriteria`
- `evidenceSummary`
- `missingEvidence`
- `expectedActor`

### 4.3 `submissions --json`

`submissions` is the agent-facing queue view. It should group at least:

- `owned` submissions
- `reviewable` submissions
- `stale` or attention-needed submissions

Each entry should expose enough normalized data for `act review ...` or
follow-on `context` calls without forcing extra graph archaeology.

### 4.3.1 `context --json`

`context` remains the target-oriented work packet. For quest targets, the
agent-specific payload must include:

- `readiness`
- `dependency`
- `recommendedActions`
- `recommendationRequests`
- `diagnostics`
- `requirements`
- `acceptanceCriteria`
- `evidenceSummary`
- `blockingReasons`
- `missingEvidence`
- `nextLawfulActions`
- `expectedActor`
- `claimability`

Those fields are what make `context` a work packet instead of a fancy `show`
command.

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
If a follow-on step fails after mutation has already been committed, the
outcome must stay truthful. Non-critical follow-on failures may return success
plus `warnings` and structured `partialFailure` data, but failures to record
the authoritative graph-side settlement state must return a non-success outcome
with the committed side effects included so automation can reconcile and retry.
Actions must also refuse execution when doctor-detected structural blockers make
the requested transition illegal under the current graph state.

When an action is refused, the response should prefer explaining refusal in the
same terms the human governance pages will use:

- `blockingReasons`
- `missingEvidence`
- `nextLawfulActions`
- `expectedActor`

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

These are the routine agent actions that should be executable through `act` in
the checkpoint-2 kernel.

`seal` is review-gated. A quest may only be sealed when the latest linked
submission is independently approved; neither `act seal` nor direct `seal`
may bypass the submission review loop.

The current runtime now ships that routine action set:

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
