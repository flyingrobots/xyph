# 0025: Pre-Push Enforcement

## Cycle Type

Maintenance hardening cycle

## Status

Active design note.

This cycle was pulled on 2026-04-03 after discovering that XYPH's local Git
hooks were performing enforcement theater: pre-push printed failing test
output, and pre-commit used the same shell pattern for lint, but both scripts
still exited successfully if a later command passed.

This slice intentionally preempts the prepared workflow-model follow-on in
[0024: Graph-Native Backlog And Case Modeling](./0024-graph-native-backlog-and-case-modeling.md).
The graph remains the plan, but repo-local quality gates must stop lying before
we keep building more workflow doctrine on top of them.

## Graph Anchor

- Work item: `task:pre-push-enforcing`
- Sovereign intent: `intent:honest-local-gates`
- Campaign: `campaign:CLITOOL`

Related graph-visible context:

- `task:pre-push-typecheck`
- `task:git-hooks-lifecycle`
- `task:lint-hook-drift-cleanup`

## Why This Cycle Exists

The repo just demonstrated a bad and specific failure mode:

- `scripts/hooks/pre-push` ran `npm run test:local`
- Vitest reported real failures
- the script kept going into later checks
- a later command succeeded
- Git accepted the push

That means the hook currently looks like a gate while behaving like a noisy
status report. The same structural bug exists in `scripts/hooks/pre-commit`:
`npm run lint` can fail, but later commands can still wash the exit status back
to success.

This is not a CI problem. It is a repo-truth problem.

If local gates claim to enforce but do not fail closed, humans and agents are
both being lied to about what repo movement means.

## Sponsor Actors

### Primary sponsor actor

**Operator-Supervisor**

Needs local validation gates that are boring, inspectable, and truthful so a
push means the local push contract was actually satisfied.

### Secondary sponsor actors

**Cold-Start Worker Agent**

Needs shell-visible validation boundaries that match real enforcement so it can
trust its own local verification loop instead of treating hook output as
ambient prose.

**Application Integrator**

Needs hook behavior to be simple enough to inspect in one read and hard enough
to fail that repo movement cannot outrun local quality policy by accident.

## Outcome Hill

**As a human or agent pushing from this repo, I can rely on pre-push to fail
closed when local validation fails, so hook output and repo movement describe
the same truth.**

## Invariants

This cycle must preserve:

- The graph is the plan.
- Hook output must not claim enforcement that the exit status does not back.
- `pre-push` must fail closed on failed local validation.
- Subsequent checks must not mask an earlier validation failure.
- Hook logic should stay boring shell, not become a miniature orchestration
  framework.
- Diagram integrity checks remain part of the push contract once earlier
  validation passes.
- If `pre-commit` is touched in the same slice, it must be because the same
  failure mechanism exists there too, not because this cycle is quietly
  expanding into a general hook rewrite.
- This cycle does not make currently failing tests pass by redefining the gate
  away.

## Scope

In scope:

- define the authoritative pass/fail contract for `scripts/hooks/pre-push`
- make `pre-push` fail closed when `npm run test:local` fails
- ensure later checks do not overwrite the failing exit status
- decide and document whether the identical pre-commit harness bug is fixed in
  the same slice
- add focused regression coverage or harness verification for hook behavior
- make the resulting behavior easy to inspect from the repo

Out of scope:

- fixing the currently failing test suites themselves
- redesigning the full repo automation stack
- replacing Git hooks with a custom daemon or CLI wrapper
- changing what `npm run test:local` means
- broad CI policy changes outside the local hook contract

## Acceptance-Test Plan

### Checkpoint 1: Fail-closed push gate

1. When the pre-push validation command fails, the hook exits non-zero.
2. A later successful command cannot overwrite that failure.
3. A failed push is attributable to the failing validation step, not to vague
   shell behavior.

### Checkpoint 2: Honest pass path

4. When local tests pass, later diagram checks still run.
5. A clean push path exits zero only when the full hook contract passes.
6. The hook remains easy to inspect without following indirect control flow.

### Checkpoint 3: Shared harness honesty

7. If `pre-commit` shares the same broken shell pattern, either:
   - it is fixed in the same slice, or
   - the cycle closeout explicitly records why it was deferred.
8. Repo-local docs and task comments describe the actual enforcement posture,
   not the aspirational one.

### Checkpoint 4: Regression safety

9. Focused verification proves the hook now fails closed.
10. `npm run lint` passes.
11. `npx tsc --noEmit` passes.

## Implementation Notes

- The favored direction is simple shell truth, not cleverness:
  - `set -e` / `set -eu`, or
  - explicit `|| exit 1` discipline
- Prefer preserving the current command order rather than introducing a more
  complex wrapper unless a wrapper materially improves inspectability.
- If the same shell bug is fixed in both hooks, do it explicitly and say so in
  the witness.
- The implementation should make it obvious which command failed and why the
  hook stopped.
- Do not hide the existing red test suites. The point is to surface them
  honestly.

## Playback Questions

1. If local tests fail, does `git push` actually stop?
2. If local tests pass, do the remaining push checks still run and matter?
3. Can a reader explain hook behavior directly from the script without folklore?
4. Did we restore truthful local enforcement instead of merely changing the
   wording around a fake gate?

## Exit Criteria

This cycle closes when:

- `pre-push` fails closed on validation failure
- later hook steps cannot mask earlier failures
- any same-mechanism pre-commit alignment is either landed or honestly deferred
- the witness shows both failure-path and pass-path behavior clearly
- the retro records any remaining local gate doctrine drift
