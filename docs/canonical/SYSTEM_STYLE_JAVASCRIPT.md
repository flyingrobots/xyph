# SYSTEM_STYLE_JAVASCRIPT
**Version:** 0.1.0
**Status:** AUTHORITATIVE

## 0. Position

XYPH adopts **System-Style JavaScript** as an engineering doctrine for
infrastructure code, with one XYPH-specific constraint:

> apply it hardest where runtime truth, authority, policy, provenance, and
> replay safety matter most.

This is not a mandate to wrap every object in a class or to rewrite the entire
repo for aesthetic purity. It is a rule about where trust is allowed to come
from.

## 1. Runtime Truth Wins

When XYPH is executing, authority belongs to what is actually true in runtime
objects and validated boundaries.

That means:

- TypeScript is useful but not authoritative
- comments are explanatory, not contractual
- plain object shapes are not trusted merely because they look right
- untrusted input becomes trusted only through parsing, validation, and
  construction

For XYPH, this matters most in areas such as:

- authority and sovereignty checks
- policy evaluation
- lawful mutation planning
- graph-to-domain interpretation
- signed artifact handling
- worldline/governance operations

## 2. XYPH Scope Boundary

System-Style JavaScript is mandatory in the parts of XYPH that carry system
meaning and invariants.

It is lighter-weight in the parts of XYPH that primarily transport or present
already-derived data.

### 2.1 Mandatory: runtime-backed domain modeling

New or substantially changed code should use runtime-backed types when working
in these areas:

- `src/domain/entities/`
- domain services that enforce policy, authority, mutation, or governance rules
- parsing layers that turn graph data or control-plane input into trusted
  internal values
- error paths whose caller behavior depends on the failure category

Examples of concepts that should prefer runtime-backed forms:

- principals and authority-bearing identities
- worldline coordinates and governance artifact handles
- policy decisions and mutation outcomes
- domain failures that need typed handling

### 2.2 Acceptable: plain structured data

Plain objects remain acceptable when the value is primarily a transport or view
artifact rather than a trusted domain concept.

That includes many cases in:

- `src/domain/models/`
- read-model and projection outputs
- JSONL control-plane envelopes
- CLI/TUI render packets
- fixture payloads and test data
- logging and diagnostics payloads

The rule is simple:

- if the value carries invariants, authority, or behavior, model it
- if the value is a packet, projection, or report, structured data is usually
  fine

## 3. Boundary Discipline

### 3.1 Parse at the edge

`unknown` is acceptable only at raw boundaries and should be eliminated
quickly.

Examples:

- CLI argument material
- control-plane JSONL input
- graph node properties
- decoded blobs
- environment/config input

Once a value becomes trusted, downstream code should not keep re-litigating its
shape through ad hoc checks.

### 3.2 Domain types own behavior

When a concept has behavior, that behavior should live on the owning runtime
type or on a closely-related domain service.

Avoid stringly branching that spreads the concept's meaning across unrelated
call sites.

### 3.3 Errors are typed

In core and policy-sensitive code, generic `Error` is debt, not the target
state.

If callers need to react differently to different failure classes, those
failures should become explicit domain errors with stable meaning.

Never parse `err.message` as the primary control path.

## 4. Hexagonal Purity Still Applies

System-Style JavaScript does not weaken XYPH's architectural boundary rules.
It sharpens them.

- portable core logic should not depend on Node-only facilities
- codecs, persistence, and host APIs belong in adapters or boundary utilities
- serialization is the codec's job, not the domain object's job

Node-only code is acceptable where it truly belongs, such as cryptographic,
filesystem, or process adapters. It is not acceptable as a casual dependency of
the portable core.

## 5. TypeScript Is Allowed, Not King

XYPH may continue using TypeScript where it improves editor workflows,
refactoring, and compatibility.

But TypeScript must not be mistaken for runtime enforcement.

Use it to help the reader and the tooling. Do not let it become a substitute
for:

- validation
- construction-time invariants
- typed domain failures
- honest runtime boundaries

## 6. Pragmatic Exceptions

This doctrine is intentionally strict without being theatrical.

It does **not** require:

- converting every projection record into a class
- eliminating all tagged transport unions from wire or plan layers
- rewriting untouched code solely for stylistic purity
- forcing browser-portability into code that is clearly an adapter

It **does** require that new or materially revised core behavior move in the
direction of:

- stronger runtime invariants
- clearer boundary parsing
- typed failure modes
- less shape trust in policy-sensitive code

## 7. Migration Posture

Adopt this doctrine incrementally.

The expected rollout is:

1. new domain-core code follows it immediately
2. touched policy/governance code is improved when modified
3. projection and adapter code stays pragmatic unless the existing shape is
   causing correctness drift

Do not stop useful work for a repo-wide doctrine rewrite.

Do not use "existing code is imperfect" as an excuse to keep adding more shape
trust in the most sensitive parts of the system.

## 8. Review Questions

Before merging infrastructure code, ask:

1. Where does this value become trusted?
2. If it has invariants or authority, where is its runtime-backed form?
3. If it fails, does the caller need a typed failure instead of a generic
   message?
4. Is this logic domain logic, transport logic, or adapter logic?
5. Would this still make sense if the TypeScript annotations vanished at
   runtime?

If those questions do not have clear answers, the code is probably leaning on
tooling fiction instead of runtime truth.
