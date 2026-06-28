# CLI Actuator Legacy Imperative Mutation Leak

## Overview
The Xyph CLI actuator write commands (`story`, `requirement`, `note`, `link`, `move`, `authorize`) rely entirely on a legacy imperative mutation builder (`graph.patch((p) => p.addNode(...).setProperty(...))`) that directly alters graph nodes, properties, and edges.

## Severity & Impact
**Severity: High**
**Impact:** Under the modern Optic & Intent architecture established in `git-warp` and Xyph's core domain, mutations must be modeled as pure, unmaterialized intent payloads (`admitIntent(writer, intentDescriptor)`) verified against an optic lens (`WorldlineOptic`) before being committed to a patchset. By directly invoking `p.addNode()` and `p.setProperty()`, the CLI acts as a direct storage mutator rather than a domain participant, breaking domain encapsulation. If the underlying Digital Guild vocabulary or schema definitions evolve within `git-warp`, the CLI will silently write stale or non-compliant CBOR properties directly into the Git CAS storage, bypassing optic validation.

## Concrete Refactoring Path
1. Deprecate the direct `graph.patch((p) => ...)` imperative builder within `src/cli/commands/*.ts`.
2. Inject `OpticDomainActionService` into `CliContext`.
3. Refactor CLI command actions to construct pure `IntentDescriptor` objects (e.g., `CreateRequirementIntent`, `CreateStoryIntent`) and route them through `OpticDomainActionService.executeAction(optic, intent)`.
