# Xyph Programmable Optics and Witnessed Settlement

## Status

Proposed architecture.

This proposal does not claim that Xyph already implements full Edict admission, Continuum witness exchange, or cryptographic settlement. It defines the direction in which those mechanisms should be integrated into Xyph’s planning graph and settlement model.

## Purpose

Define a Xyph architecture in which:

1. read-only planning optics may be authored, compiled, registered, and invoked under bounded authority,
2. Xyph-native planning operations (Xyph-local mutation) may eventually mutate planning state under explicit admission,
3. external execution operations (external-target execution) may return provenance-bearing witness via a portable witness envelope,
4. imported witness becomes evidence objects inside Xyph rather than direct state mutation,
5. settlement remains a Xyph-owned governed conclusion over bound evidence.

## Design Goals

- Preserve Xyph as the planning-and-settlement authority.
- Replace static adapter growth with lawful authored artifacts where appropriate.
- Avoid FIDLAR-shaped callback authority in the lawful-autonomous lane.
- Keep runtime execution semantics owned by runtime target profiles, not by Xyph doctrine.
- Treat external execution outputs as admissible evidence, not automatic truth.
- Support phased delivery beginning with read-only optics.

## Non-Goals

- Defining Continuum as a universal graph or official storage runtime.
- Putting graph primitives into Edict Core.
- Treating Echo Span IR as universal IR.
- Allowing arbitrary plugin code as a capability model.
- Letting imported witness silently mutate planning state.
- Claiming composite multi-runtime semantics before a composite target profile exists.

## Architectural Basis

This proposal depends on the following repo-grounded principles:

- Edict v1 is a restricted deterministic language for lawful optics over witnessed causal history.
- Edict compiles to runtime-neutral Core IR with explicit target imports and analyzable effects.
- Target profiles own intrinsics, footprint algebra, target IR, verifier rules, and atomic application semantics.
- Contract bundles are participant-neutral SHA-locked artifacts. Admission requests and receipts are external participant-owned evidence.
- Participant runtimes own preflight, admission, registration, execution, receipts, and obstructions.
- HOLMES, Watson, and Moriarty provide assurance, explanation, and adversarial probing, but are not runtime admission authorities.
- An intent may lower to effects owned by at most one runtime target profile unless a composite target profile owns coordination and atomicity semantics.

## Optic Classes

Xyph strictly defines and enforces three distinct classes across the entire system.

### Read Optic
Projects bounded planning state from witnessed history without mutation. This is the safest and earliest class to support. It aligns with bounded apertures, lawful projections, and zero ambient host callback authority.

### Planning Operation
Performs Xyph-local mutation of Xyph-owned planning or governance state under Xyph-defined lawpacks, profiles, and admission policy. This is more powerful and arrives later than read optics.

### Execution Operation
Targets an external runtime (such as Echo) for external-target execution, returning witness via a portable witness envelope that may later support Xyph settlement. The execution semantics remain strictly target-owned, not Xyph-owned.

## Proposed Components

### 1. Xyph Planning Lawpack Discovery
Xyph should publish discoverable planning lawpacks describing planning-domain semantics, obstruction vocabulary, budgets, optic contracts, and capability classes. This mirrors the Edict architecture in which lawpacks are digest-locked semantic authorities rather than implicit host behavior.

### 2. Read-Only Capability Host Profile
Xyph should define a narrow read-only capability host profile before any mutating capability profile exists. This profile should make clear:
- accepted source profiles,
- accepted Core ABI,
- allowed read intrinsics,
- footprint algebra for bounded planning reads,
- verifier behavior,
- generated registration artifacts,
- revocation/update posture.

### 3. Digest-Locked Optic Bundle Registration
Xyph should accept authored read optics only as sealed bundles, not as arbitrary host extensions. The registration flow is:

1. discover accepted profiles and lawpacks,
2. author read optic,
3. compile to Core IR,
4. lower against the Xyph read-only capability host profile,
5. infer footprint and cost,
6. validate lowerability and profile compatibility,
7. produce SHA-locked contract bundle,
8. optionally attach assurance artifacts,
9. preflight and admit or reject,
10. emit registration receipt for the capability.

### 4. Portable Witness Envelope
Cross-runtime witness should be represented by a concrete portable witness envelope, not only by poetic terminology.

Suggested shape:

```ts
type WitnessEnvelope = {
  schemaVersion: string;

  participant: {
    id: string;
    publicKeyRef: string;
    capabilityCatalogDigest?: string;
  };

  operation: {
    contractBundleDigest: string;
    sourceProfileDigest?: string;
    lawpackDigests: string[];
    targetProfileDigest: string;
    targetProfileId: string;
  };

  admission: {
    admissionReceiptDigest: string;
    admittedAtTick?: string;
    admissionClass: string;
    obstructions?: Obstruction[];
  };

  execution?: {
    executionReceiptDigest: string;
    executedAtTick?: string;
    targetRunId?: string;
    verifierEvidenceDigests: string[];
    artifactRefs: ArtifactRef[];
  };

  claims: EvidenceClaim[];

  replayGuard: {
    nonce: string;
    observedSuffix?: string;
    expiresAtTick?: string;
  };

  signatures: SignatureBlock[];
};
```

This shape reflects repo-grounded distinctions between bundle identity, target profile identity, external admission evidence, and execution/runtime evidence.

### 5. Xyph Evidence Binding Object
Imported witness must become a Xyph-native evidence object before it can influence settlement.

Suggested shape:

```ts
type XyphEvidenceBinding = {
  evidenceId: string;
  witnessEnvelopeDigest: string;

  bindsTo: Array<{
    questId?: string;
    taskId?: string;
    criterionId?: string;
    requirementId?: string;
    claimPath: string;
    policyId: string;
    policyVersion: string;
  }>;

  admissibility: "admitted" | "rejected" | "obstructed" | "quarantined";

  support: {
    posture: "carried" | "blocked" | "lost" | "degraded";
    reasons: string[];
  };

  settlementUse: "allowed" | "requires_review" | "disallowed";
};
```

This object is the key boundary. Imported witness via a portable witness envelope becomes evidence. Evidence does not become settlement automatically.

### 6. Echo Witness Import
Echo or another external runtime may emit witness via an execution operation (external-target execution), but that witness enters Xyph only through portable witness envelope import, signature and digest verification, admissibility evaluation, and evidence binding. Target-owned execution remains target-owned.

### 7. Settlement Engine
Xyph remains the settlement authority. Settlement logic consumes:
- planning graph context,
- bound evidence objects,
- policy and trust configuration,
- support posture,
- review state,
- criterion semantics.

External runtimes prove execution facts. Xyph decides whether those facts satisfy planning law.

## Invariants

### I-1 Runtime Neutrality
Continuum must not be treated as a universal store, and Edict Core must remain free of graph-native built-ins.

### I-2 No Ambient Authority
No lawful-autonomous authored capability may receive raw host callbacks, raw filesystem or network authority, hidden mutable global state, or scheduler authority.

### I-3 Digest-Locked Identity
All admitted optics and imported witness references must bind to explicit digest-locked identities for source, Core IR, target profile, target IR where relevant, receipts, and evidence artifacts.

### I-4 Participant-Owned Admission
Compiler success, verifier success, or assurance success does not equal runtime admission. Admission remains participant-owned.

### I-5 Target Ownership
External runtimes own their target profiles, target IRs, intrinsics, verifier semantics, and execution categories. Xyph must not reinterpret them locally as if they were native semantics.

### I-6 No Silent Semantic Weakening
Unsupported obligations, footprint underclaims, obstruction mismatches, or unsupported lowerings must reject rather than degrade into ambient host execution.

### I-7 Single-Target v1 Execution
One authored intent may lower to at most one runtime target profile unless and until a composite target profile explicitly owns coordination semantics.

### I-8 Evidence is First-Class
Cross-runtime execution facts must enter Xyph as explicit evidence objects with provenance and admissibility state.

### I-9 Receipt is Not Settlement
External execution receipts may support settlement, but they do not themselves settle Xyph planning truth.

### I-10 Witness Cannot Mutate Planning State Directly
Imported witness creates evidence objects. It does not silently update quest, task, criterion, or requirement status.

### I-11 Admissibility is Policy-Versioned
Any admitted witness must remain traceable to the exact policy identifier and policy version under which admission occurred.

### I-12 Replay Resistance
Portable witness envelopes must carry replay guards such as nonce, suffix, tick, expiry, or equivalent anti-replay material.

### I-13 Revocation is Explicit
Participant keys, target profiles, lawpacks, verifier authorities, and assurance authorities must support explicit revocation or trust withdrawal semantics.

### I-14 Redaction Does Not Break Identity
If Xyph stores full, redacted, encrypted, or digest-only witness forms, the identity and recoverability rules must be explicit and verifiable.

## Operational Flows

### Flow A: Read-Only Xyph Optic
1. Xyph advertises accepted source profiles, planning lawpacks, and the read-only capability host profile.
2. Agent authors a read optic.
3. Compiler resolves imports and context facts.
4. Compiler emits Edict Core IR.
5. Lowerer validates read-only compatibility and bounded footprint.
6. SHA-locked contract bundle is produced.
7. Xyph preflights and either rejects or admits.
8. On success, Xyph emits a registration receipt and exposes the optic as a typed read capability.

### Flow B: Manual Witness Import
1. External runtime produces a portable witness envelope.
2. Xyph verifies digest linkage, participant identity, and signatures.
3. Witness is marked admitted, rejected, obstructed, or quarantined.
4. Xyph creates immutable evidence binding objects.
5. Human or policy-guided review decides whether settlement use is allowed.

### Flow C: Policy-Driven Witnessed Settlement
1. Criterion references bound evidence objects.
2. Policy checks support posture, participant trust, admissibility state, and review requirements.
3. Settlement engine determines whether planning truth may advance.
4. Any resulting state transition is a Xyph-owned settlement act, not an imported execution side effect.

## Phased Rollout

### Phase 1: Read-Only Xyph Optics
Deliver:
- Xyph planning lawpack discovery,
- accepted source profile list,
- read-only optic compile/check path,
- contract bundle registry,
- registration receipt,
- CLI or TUI display of registered capabilities,
- zero ambient host callback authority.

### Phase 2: Xyph Evidence Object Model
Deliver:
- immutable evidence object,
- criterion binding,
- admissibility state,
- support posture,
- settlement eligibility check.

### Phase 3: Manual External Witness Import
Deliver:
- portable witness envelope import,
- digest and signature verification,
- manual criterion binding,
- operator-required settlement.

### Phase 4: Echo-Generated Witness
Deliver:
- Echo bundle digest linkage,
- Echo target profile digest linkage,
- execution receipt ingestion,
- verifier evidence linkage,
- artifact reference ingestion.

### Phase 5: Policy-Driven Settlement
Deliver:
- settlement rules that consume bound evidence objects,
- review-aware settlement paths,
- participant trust and revocation policy integration.

### Phase 6: Composite Profiles
Maybe later. Only after single-target witness loops are routine and boring, and only if a composite profile is needed to own coordination semantics lawfully.

## Open Questions

- Should Xyph eventually define a mutating planning-operation profile distinct from the read-only host profile?
- What witness claim taxonomy should be canonical for criterion binding?
- Which support-posture states should be first-class in the planning graph?
- What is the trust and revocation model for witness-producing participants?
- Which evidence forms may be redacted while preserving settlement integrity?
- What minimum envelope fields are mandatory for settlement-eligible evidence?
- When, if ever, is a composite Xyph↔Echo profile worth the extra risk?

## Candidate Quests

- XY-OPTICS-001: Publish Xyph Planning Lawpack Discovery
- XY-OPTICS-002: Define Read-Only Capability Host Profile
- XY-OPTICS-003: Register Digest-Locked Optic Bundles
- XY-WITNESS-001: Define Portable Witness Envelope
- XY-EVIDENCE-001: Add Immutable Evidence Binding Objects
- XY-EVIDENCE-002: Bind Evidence to Criteria
- XY-SETTLE-001: Settlement Reads Bound Evidence, Not Logs
- XY-ECHO-001: Import Echo Receipt as Quarantined Witness
- XY-ECHO-002: Verify Echo Target Profile and Bundle Digests
- XY-POLICY-001: Add Participant Trust and Revocation Policy

## Summary

Xyph should become the place where lawful work is planned, external execution is witnessed, evidence is bound, and settlement is decided, without pretending that one runtime must own all stores, all actions, or all truth surfaces. The architecture succeeds only if authored capabilities remain lawful artifacts rather than plugins, imported witness via a portable witness envelope remains evidence rather than automatic settlement, and Xyph remains sovereign over the governed conclusion.
