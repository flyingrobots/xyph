---
title: "TypeScript Code Standards — XYPH Editor's Edition™"
date: 2026-06-21
lastmod: 2026-06-21
author:
  name: "James Ross"
  email: "james@flyingrobots.dev"
status: "normative"
---

# TypeScript Code Standards — XYPH Editor's Edition™

This is the engineering doctrine for the XYPH repository.

The repository is written under one modern assumption: **the codebase will be read, refactored, and written by humans and LLM agents.** Human cleverness is expensive. Agent cleverness is destructive when the system rewards inference, hidden context, or folklore. Therefore, this codebase runs on explicit runtime truth, bounded context, deterministic behavior, auditable provenance, and boring infrastructure.

> **Sensei's Wisdom™**  
> A standard without automation is a campfire story. Nice glow. Zero stopping power.

## Scope

These rules apply to all hand-written TypeScript source under `src/`, unit/integration tests under `test/` and `src/**/__tests__/`, adapters, CLI utilities, and architectural decisions.

Generated files, vendored code, build output in `dist/`, and external lockfiles are exempt, but only by path-level configuration. Do not hide normal source code in an exempt directory.

## Vocabulary

* **Raw data**: Untrusted input (unvalidated git-warp node properties, CLI args, environment variables, JSON files, etc.).
* **Boundary**: The first trusted code that touches raw data (such as adapters parsing graph properties, or CLI validators in [validators.ts](file:///Users/james/git/xyph/src/cli/validators.ts)).
* **Domain core**: Pure domain entities (under `src/domain/entities/` and `src/domain/services/`). It may depend on ports and values, but not host APIs, git-warp libraries directly, clocks, networks, or filesystems.
* **Port**: An explicit interface owned by the core that describes a side-effect capability (defined under `src/ports/`).
* **Adapter**: Infrastructure code implementing a port (defined under `src/infrastructure/` and `src/infrastructure/warp/`).
* **Fake**: A deterministic in-memory implementation of a port used for tests (e.g. `InMemoryGraphAdapter`).
* **Mock**: A test double that verifies call choreography instead of observable behavior. Mocks are banned unless explicitly exempt.
* **Agent**: An automated coding assistant or LLM-driven process.
* **Graft receipt**: The session audit record documenting agentic context, file reads, and provenance.

---

## Rule 0: Runtime Truth Wins

When the program is running, only one question matters: **What is actually true right now, in memory, under execution?**

Types, tests, docs, and agent explanations are secondary. If they disagree with runtime reality, they are lying.

### Non-negotiables

- **No `any` in hand-written code.** Any usage of `as any` or type bypass is a severe lint infraction.
- **`unknown` is mandatory at trust boundaries.** It must be narrowed, parsed, and validated before entering the domain core.
- **Unsafe narrowing assertions are banned.** No `value as User` or `questProps['status'] as QuestStatus`.
- **Safe broadening assertions and `as const` are permitted** only when they do not lie about runtime data.
- **Validation happens at the boundary.** Raw graph properties must be validated and converted into domain value objects or classes (e.g. using `normalizeQuestStatus` or `normalizeQuestPriority` in [Quest.ts](file:///Users/james/git/xyph/src/domain/entities/Quest.ts)) before entering core logic.
- **No TypeScript gymnastics in domain code.** Keep types simple and transparent.

> **Sensei's Wisdom™**  
> Types are promises. Constructors are border control.

### Preferred Shape (XYPH Domain Boundary)

```typescript
// src/domain/entities/EmailAddress.ts
export class EmailAddress {
  public readonly value: string;

  public constructor(value: string) {
    if (!value.includes("@")) {
      throw new Error(`Invalid EmailAddress: ${value}`);
    }
    this.value = value;
    Object.freeze(this);
  }

  public static fromUnknown(value: unknown): EmailAddress {
    if (typeof value !== "string") {
      throw new Error("EmailAddress must be a string");
    }
    return new EmailAddress(value);
  }
}
```

### Banned Shape

```typescript
// BANNED: No runtime validation, dangerous type casting
const email = payload.email as string;
```

---

## Rule 1: Agentic Legibility

Agents fail when behavior is split across hidden configuration, reflection, ambient state, or "everybody knows" conventions. The architecture must act as a context governor.

### Non-negotiables

- **Locality of behavior**: If a behavior is modified, the relevant context must be in the same file or in explicit, immediately adjacent imports.
- **No magical dependency injection**: Dependencies must be passed explicitly through constructors or functions.
- **No global containers or reflection autowiring**: Trace all dependencies explicitly through imports and constructor parameters.
- **Boring names**: Names must describe structural intent. Use `QuestReadPort`, `WarpQuestReadAdapter`, `SubmissionReadPort`, `WarpSubmissionReadAdapter`.
- **One exported domain concept per file**: Keep concepts focused. Split private helpers once they gain independent utility.

> **Sensei's Wisdom™**  
> If an agent must open six files to understand one behavior, the architecture is generating fog.

---

## Rule 2: Deterministic Architecture

The domain core must be isolated from side effects, ambient state, and host environments.

### Non-negotiables

- **Hexagonal architecture is mandatory**: Core logic owns ports in `src/ports/`. Infrastructure implements them in `src/infrastructure/`.
- **The core does not know the filesystem, process environment, or git-warp directly**: It only knows interfaces.
- **Time and Identity are injected**: Pass the `readIdentity` (comprising `accessorId` and `role`) and current timestamps explicitly. Do not reference ambient `Date.now()` inside the core domain.
- **The core must be portable**: It must run identically in Node, test runtimes, or any sandboxed runner.

```typescript
// src/ports/ClockPort.ts
export interface ClockPort {
  now(): number;
}
```

> **Sensei's Wisdom™**  
> Time is global mutable state wearing a watch. Inject it.

---

## Rule 3: The Data Model Is the Domain Model

We reject shape-soup (e.g. interfaces with erased invariants plus TODO comments).

### Non-negotiables

- **Domain concepts with invariants are classes**: They validate themselves at construction.
- **Domain values are immutable**: Use `readonly` and call `Object.freeze()` on constructor completion.
- **Behavior-rich concepts own their behavior**: Use class methods rather than external switch statement jungles.
- **Serialization is an adapter concern**: Domain models do not know how to JSON-serialize, persisted-state format, or parse raw properties from the database.

> **Sensei's Wisdom™**  
> Classes are not "enterprise." Bad classes are enterprise. Good classes are runtime law.

---

## Rule 4: Tests Use Deterministic Worlds

The test suite must assert observable behavior, not implementation text or choreographies.

### Non-negotiables

- **Test-Driven Cycle (Red-Green-Verify-Provenance)**:
  - **RED**: Write the smallest failing integration or unit test.
  - **GREEN**: Implement the smallest architecture-preserving fix.
  - **VERIFY**: Run the regression and test group via `npm run test:local`.
  - **PROVENANCE**: Commit focused, atomic changes.
- **Test Double Policy**:
  - Mocks of domain internals are banned.
  - Use in-memory fakes (e.g., `InMemoryGraphAdapter` from `git-warp`) behind ports.

> **Sensei's Wisdom™**  
> A fake is a small deterministic world. A mock is gossip with syntax.

---

## Rule 5: Provenance-Native Execution

We do not normalize code sludge or hide build risks.

### Commit Policy

All commits must tell a clean, sequential history of the system.
- One behavior change per commit.
- No "misc fixes" or drive-by refactor squashing.
- Stage and commit all changes at the end of every turn (git rules).
- Commit messages must follow conventional formatting:
  ```text
  feat(optics): implement CampaignPolicyReadAdapter for bounded policy reads
  ```

---

## Rule 6: The Agent Context Mandate — Graft

No automated agent, coding assistant, or LLM-driven process may perform raw, unfiltered filesystem reads or scans against this repository. Agents must act as bounded observers.

### Non-negotiables

- **Use Bounded Tools**: Agents must use the `graft` tool suite (`safe_read`, `file_outline`, `read_range`, `code_show`) rather than dumping entire directories.
- **Outline-First Reading**: If a file exceeds 150 lines or 12 KB, the agent must call `file_outline` first, then target specific bodies with `read_range` or `view_file`.
- **No Unbounded Search**: Restrict `grep_search` to target directories and specific files.
- **Audit Session**: Verify all code modifications pass validation checks before ending the turn.

---

## Rule 7: Dojo Enforcement

The repository enforces this doctrine through:

* Strict TS posturing:
  ```json
  {
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "noImplicitOverride": true,
    "noImplicitReturns": true
  }
  ```
* Strict ESLint posturing (bans on floating promises, `as any`, unsafe member calls, etc.).
* Pre-push and turn-end local validations: `npm run lint` and `npm run test:local`.
