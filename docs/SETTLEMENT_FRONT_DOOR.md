# Xyph Settlement Architecture: The Front Door

```text
       ┌─────────────────────────────────────────────────────────┐
       │             Xyph Settlement Runtime Front Door          │
       │    Doctrine for the Why · Spec for the How · Roadmap    │
       └────────────────────────────┬────────────────────────────┘
                                    ▼
       ┌─────────────────────────────────────────────────────────┐
       │   docs/SETTLEMENT_RUNTIME_VISION.md (Doctrine / Why)    │
       │   Category shift: Xyph as sovereign settlement runtime  │
       └────────────────────────────┬────────────────────────────┘
                                    ▼
       ┌─────────────────────────────────────────────────────────┐
       │     design/rfc-programmable-optics.md (Spec / How)      │
       │   14 Invariants, Portable Witness, Immutable Evidence   │
       └────────────────────────────┬────────────────────────────┘
                                    ▼
       ┌─────────────────────────────────────────────────────────┐
       │             The 6-Phase Rollout (Next Scars)            │
       │   Phased delivery spine from Read Optics to Settlement  │
       └─────────────────────────────────────────────────────────┘
```

## Welcome to the Settlement Runtime

This package establishes the canonical architectural true north for Xyph. It defines our fundamental category shift: Xyph is transitioning from local-first planning tooling into the sovereign planning-and-settlement runtime for lawful machine work.

To maintain strict engineering discipline and earn trust, this package separates our long-range thesis from our concrete execution mechanics.

---

## 1. Doctrine for the Why
* **[docs/SETTLEMENT_RUNTIME_VISION.md](./SETTLEMENT_RUNTIME_VISION.md)**: The foundational thesis and public framing.
  * **The Category Shift**: External runtimes prove execution facts; Xyph decides whether those facts satisfy planning law.
  * **The End of Fake Agency (FIDLAR)**: Eliminating ambient process authority in favor of statically verified contract bundles.
  * **The Three Optic Classes**: Enforcing rigid boundaries between Read Optics, Planning Operations (Xyph-local mutation), and Execution Operations (external-target execution).
  * **Receipt is Not Settlement**: Establishing the killer distinction between importing external receipts and governing work.

---

## 2. Spec for the How
* **[design/rfc-programmable-optics.md](../design/rfc-programmable-optics.md)**: The concrete technical specification and legal bedrock.
  * **The 14 Strict Invariants**: Ironclad rules (I-1 through I-14) governing runtime neutrality, zero ambient callbacks, digest-locked identity, and replay resistance.
  * **Portable Witness Envelope**: The definitive TypeScript schema for importing cross-runtime execution facts.
  * **Xyph Evidence Binding Object**: The immutable boundary ensuring that imported witness becomes evidence, while evidence never becomes settlement automatically.

---

## 3. Roadmap for the Next Scars
The phased delivery schedule staging our concrete engineering scars in a believable, disciplined order:

* **Phase 1: Read-Only Xyph Optics**: Delivering planning lawpack discovery, accepted source profiles, and zero ambient host callback authority.
* **Phase 2: Xyph Evidence Object Model**: Delivering immutable evidence objects, criterion binding, and support posture.
* **Phase 3: Manual External Witness Import**: Delivering portable witness envelope import, digest/signature verification, and manual criterion binding.
* **Phase 4: Echo-Generated Witness**: Delivering Echo bundle/profile digest linkage, execution receipt ingestion, and verifier evidence linkage.
* **Phase 5: Policy-Driven Settlement**: Delivering settlement rules that consume bound evidence objects and review-aware settlement paths.
* **Phase 6: Composite Profiles**: Horizon work reserved for when single-target witness loops are routine and boring.

---

**The Goal is Inevitability. Every feature is defined by its evidence.**
