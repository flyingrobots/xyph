# 0022: Durable Diagnostic Logging

## Cycle Type

Design-first recovery and hardening cycle

This cycle establishes the durable diagnostic logging boundary XYPH should have
had before the graph-read incident forced debugging into guesswork.

## Status

Active design note while graph reconciliation is impaired.

The graph remains the authoritative plan, but graph access is currently too
unhealthy to treat it as the only reliable planning surface for this slice.
This cycle note and its spec scaffold exist so the repo can pivot cleanly while
the graph is being recovered. Reconcile the graph anchor once graph operations
are healthy again.

## Graph Anchor

- Pending graph reconciliation after graph health recovery
- Temporary fallback capture:
  [`/Users/james/git/xyph/design/backlog-fallback.md`](../backlog-fallback.md)

## Why This Cycle Exists

XYPH lost a trustworthy way to diagnose graph-read failures.

That exposed several problems at once:

- durable logs were dashboard-local rather than product-wide
- actuator and CLI paths could wedge without leaving a useful forensic trail
- logging assumed process-local callbacks and occasional console output instead
  of an explicit diagnostic boundary
- debugging pressure risks scattering `console.log` and substrate-leaky probes
  through the codebase unless we replace the logging architecture deliberately

The immediate product need is not a full observability platform. It is a
boring, durable, always-on diagnostic stream that gives humans a place to look
when XYPH fails.

## Sponsor Actors

### Primary sponsor actor

**Operator-Supervisor**

Needs one durable place to inspect what XYPH was doing when graph access,
startup, control-plane reads, or TUI workflows fail.

### Secondary sponsor actor

**Cold-Start Worker Agent**

Needs application and adapter failures to become attributable, inspectable
facts rather than silent stalls or missing output.

## Outcome Hill

**As a human or agent diagnosing XYPH behavior, I can rely on one durable,
structured diagnostic log that records lifecycle events and important
port/adapter interactions without assuming stdout/stderr are the canonical log
sink.**

## Locked Decision

The logging architecture decision for this cycle is:

- XYPH owns the diagnostic logging abstraction.
- Durable local file logging is mandatory by default.
- Multiplexing is first-class so one diagnostic event can fan out to multiple
  sinks without changing producer call sites.
- Off-the-shelf logging libraries are optional implementation details behind an
  adapter, not the architecture.
- If an off-the-shelf structured logger is adopted later, the current favored
  candidate is Pino, but only behind an XYPH-owned adapter and never as the
  public port contract.

## Invariants

This cycle must preserve:

- The graph is the plan.
- Hexagonal architecture remains real; logging must respect ports/adapters.
- XYPH must not assume stdout/stderr are the durable logging destination.
- Durable file logging is a default sink, not a best-effort one-off hack.
- Off-the-shelf logger APIs must not leak into domain code or producer call
  sites.
- Stray `console.log`, `console.warn`, `console.error`, and similar debug calls
  in core application code are errors, not a tolerated debugging technique.
- Logging should be structured and attributable, not raw ad hoc strings
  scattered through the codebase.
- The logging boundary must remain generic enough to support additional sinks
  later without rewriting call sites.
- Logging must not silently become a second product-truth channel that replaces
  graph facts, receipts, or governance history.

## Scope

In scope:

- define a logging port or sink abstraction for XYPH diagnostic events
- define the minimal structured log entry shape
- establish a durable local file sink as the default always-on sink
- allow multiplexing so logs can also flow to other sinks without changing
  callers
- keep any third-party logger, if used at all, behind an infrastructure adapter
- instrument application lifecycle events
- instrument meaningful port/adapter interactions, especially graph,
  observation, control-plane, and startup/shutdown boundaries
- define where CLI and TUI sessions write logs by default
- define how failures in logging are contained so they do not crash the product

Out of scope:

- full distributed telemetry or hosted log shipping
- instrumenting every method call
- turning verbose debug traces into graph-native ontology
- replacing git-warp receipts, provenance, or replay facts
- the broader outbound effect-emission substrate slice
- the full observer/worldline read refactor, except where this cycle must name
  logging hooks for that future architecture

## Acceptance-Test Plan

### Checkpoint 1: Durable default sink

1. CLI and TUI entrypoints both write structured diagnostic events to a durable
   local log file by default
2. durable logging does not depend on stdout/stderr remaining visible
3. logging sink initialization failures are contained and reported without
   turning startup into silent failure

### Checkpoint 2: Bounded diagnostic vocabulary

4. application lifecycle events are logged:
   - session start
   - session end
   - uncaught failure / fatal exit
   - key startup phases such as graph or observation load
5. meaningful port/adapter interactions are logged at the seam rather than by
   littering arbitrary call sites
6. the log entry shape is structured enough to include timestamp, level,
   component, event/message, and optional context

### Checkpoint 3: Architectural honesty

7. callers log through an abstraction rather than writing directly to files or
   assuming console output is authoritative
8. the logging abstraction supports multiple sinks without changing producer
   call sites
9. the durable file sink is only one adapter behind that abstraction
10. stray direct `console.*` usage is eliminated from core app paths outside
    explicitly approved user-output surfaces

### Checkpoint 4: Regression safety

11. focused tests pin durable log output and multiplex behavior
12. `npx tsc --noEmit` passes
13. `npm test` passes once the implementation slice lands

## Implementation Notes

- Prefer a generic diagnostic-event sink abstraction over dashboard-specific
  file writing.
- Keep the producer API boring: log structured events, not file paths.
- Do not let a third-party logger define the port shape. If Pino or another
  logger is adopted, it should sit behind an adapter.
- Treat direct `console.*` calls as belonging only to explicitly approved
  output adapters or narrow standalone tooling, not to core product logic.
- Instrument at boundaries:
  - CLI/TUI app lifecycle
  - graph/observation adapter calls
  - control-plane session boundaries
  - startup and shutdown
- Keep event volume bounded. The goal is useful forensics, not exhaust logging.
- The durable file sink should live behind an infrastructure adapter and create
  parent directories automatically.
- A multiplex sink is desirable so durable file logging can coexist with TUI
  gutters, test captures, or future export sinks.

## Playback Questions

1. When XYPH stalls or fails, does a human have one obvious place to look?
2. Do the logged events explain lifecycle and boundary activity without
   flooding the operator with noise?
3. Did we add a real architectural seam instead of sprinkling `console.log`
   calls through the codebase?
4. Is the logging design still compatible with future observer/worldline-native
   reads and substrate-level effect emission?

## Exit Criteria

This cycle closes when:

- XYPH has a real diagnostic logging abstraction
- durable file logging is on by default for CLI and TUI entrypoints
- lifecycle and port/adapter boundary events are durably inspectable
- the implementation does not treat stdout/stderr as the canonical durable log
  path
- the retrospective records what still remains for broader debugging and
  observer-native read recovery

## Immediate Priority Order

Until the graph/read architecture is fully stabilized, the next priorities are:

1. **Finish the logger**
   - complete the product-wide diagnostic logging surface instead of leaving it
     as a partial incident hotfix
   - keep durable local logging as the default and continue instrumenting the
     important port/adapter seams

2. **Read architecture: pivot away from `GraphContext`**
   - stop treating `GraphContext` as XYPH's default read seam
   - move toward observer/worldline-native reads over git-warp
   - keep substrate inspection as an explicit deeper path rather than the
     default application model
   - the active design note for that next slice is
     [`0023-observer-native-read-architecture.md`](./0023-observer-native-read-architecture.md)
