# Xyph as the Settlement Runtime for Lawful Machine Work

## Status

This document describes the north-star direction for Xyph. It does not claim that Xyph already implements full Edict admission, Continuum witness exchange, or cryptographic settlement. It defines the direction in which those mechanisms should be integrated into Xyph’s planning graph and settlement model.

## Thesis

Xyph is actively transitioning toward becoming the sovereign planning-and-settlement runtime for lawful machine work.

That does **not** mean Xyph must own every runtime, every store, or every action surface. It means Xyph is being designed to become the place where work is planned, external execution is witnessed, evidence is bound, and settlement is decided. In this target architecture, external runtimes prove execution facts, while Xyph decides whether those facts satisfy planning law.

This is the intended category shift.

Xyph is not “AI project management.” It is not a status board with agents attached. It is evolving into a planning compiler where intent becomes admissible work and external execution becomes settled truth.

## The Core Principle

Xyph does not need everyone to become Xyph. It needs them to speak lawful operation, sealed evidence, and admitted witness.

That principle keeps the target architecture clean. Continuum does not become one universal graph. Echo remains Echo. `git-warp` remains `git-warp`. Other runtimes keep their own state models, target semantics, and verifier lanes. Xyph remains the planning-and-settlement runtime above them, binding work to evidence and evidence to governed conclusions.

This matters because Continuum and Edict are explicitly being designed to avoid exactly the opposite mistake. Continuum standardizes lawful operation, discovery, bundles, receipts, and admission posture, not storage. Edict Core is runtime-neutral and intentionally does not contain graph-native built-ins. Target profiles own runtime intrinsics, footprint algebra, target IR, and verifier rules.

## The End of Fake Agency (FIDLAR)

Most agent systems still run on ambient authority.

A function claims to do one thing while the process can really do many others. The Edict materials name this failure mode directly as **FIDLAR** (*Footprints Ignored; Developer Lies About Risk*): declared scope diverges from actual authority, and everyone pretends metadata counts as safety. That pattern is unacceptable for lawful autonomous work.

Xyph’s long-range answer is not “better prompts” or “safer plugins.” It is lawful authored capability. In our future target state, a machine operation must declare its aperture, effects, budgets, obstruction semantics, and governing law up front; compile to a sealed artifact; and be admitted under explicit participant policy before it can act.

That is what makes agency real instead of theatrical.

## Three Classes of Optic

The word “optic” should not mean everything. To prevent architectural blur, Xyph strictly defines and enforces three distinct classes:

- **Read Optic:** projects bounded planning state from witnessed history; performs zero mutation; represents the lowest authority surface.
- **Planning Operation:** performs Xyph-local mutation of Xyph-owned planning or governance state under Xyph policy and admission.
- **Execution Operation:** targets an external runtime (such as Echo) for external-target execution, returning witness that may later support settlement.

This distinction is not cosmetic. It is what allows Xyph to evolve safely. Read optics can mature first. Planning operations (Xyph-local mutation) can follow under tighter admission. Execution operations (external-target execution) remain target-owned, externally witnessed, and never collapse into ambient Xyph power.

## What Settlement Means

Settlement is not the same thing as execution.

A runtime like Echo may prove that a lawful operation ran, that a bundle was admitted, that a verifier passed, or that target-specific outputs were produced. Those are execution facts. Xyph still must decide what those facts mean inside planning truth.

An external receipt should never automatically seal a Xyph quest.

Instead, Xyph asks:
- Is this participant trusted for this witness class?
- Does the witness bind to the exact bundle and target profile claimed?
- Does the evidence satisfy the criterion or requirement in question?
- Does policy require human review?
- Is support carried, blocked, degraded, or lost?
- Is settlement lawful now?

That is the difference between importing receipts and governing work.

## Why This is the Moat

The moat is not that Xyph owns more execution.

The moat is that Xyph can turn lawful work into governed truth. It is being architected to plan work in a graph-native form, ingest evidence as first-class objects, keep provenance and admissibility explicit, and make “done” an evidentiary conclusion rather than a narrative status toggle.

That is where real autonomy starts to look different from “agent clicked some buttons and the logs seem fine.”

## The Discipline

This direction only works if Xyph refuses the usual shortcuts.

Programmable must not mean extensible by arbitrary code. Registered capabilities must be authored as lawful artifacts, not host callbacks in ceremonial dress. Witness must not mutate planning state directly. Settlement must not be a side effect of receipt ingestion. And no doctrine should claim that the architecture has already landed before the artifacts, policies, and validation surfaces exist.

The bold claim is not that Xyph already does all of this today.

The bold claim is that this is the right destination: Xyph as the sovereign place where lawful work is planned, external execution is witnessed, evidence is bound, and settlement is decided.
