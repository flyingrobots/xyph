# CLAUDE.md - XYPH Agent Participant Guide

## Quick Start
You're working on **XYPH** - a Causal Operating System for Agent Planning and Orchestration.

### Core Philosophy
- **The Graph is the State**: All coordination happens via a deterministic WARP graph.
- **Causal Agents**: Every participant is a first-class `Writer` with a cryptographic identity.
- **Stigmergy**: Coordinate by modifying the graph, not by direct messaging.
- **Optimistic Claiming**: Volunteer for tasks and verify success post-materialization.
- **Planning Compiler**: Transform roadmap intent into executable lanes via strict pipeline phases.

### Development Pattern
1. **Constitution First**: Every feature must obey the `CONSTITUTION.md`.
2. **Deterministic Writes**: All mutations must go through the `xyph-actuator`.
3. **Audit Everything**: Every decision must have a `rationale` and `confidence` score.
4. **Guild Aesthetic**: Use the "Digital Guild" terminology (Quests, Campaigns, Scrolls, Seals).

### Quality Gates
Before opening or updating a PR, **always** run the full test suite:
```bash
npm run build    # Verify TypeScript compilation
npm test         # Run full Docker-based test suite (60+ tests)
```
Never push code that doesn't pass both checks. CI failures waste time and break the review flow.

**NEVER circumvent quality checks:**
- ❌ NEVER use `--no-verify` to skip git hooks
- ❌ NEVER disable linter rules with `eslint-disable` comments
- ❌ NEVER use `@ts-ignore` or `@ts-expect-error` to silence TypeScript
- ❌ NEVER bypass tests or validation to "move faster"

Our duty is to write **safe, correct code**. Shortcuts that compromise quality are not acceptable.

**Own every failure you see:**
- ❌ NEVER dismiss errors as "pre-existing" and move on. If you see something broken, fix it.
- ❌ NEVER say CI/CD failures are acceptable or ignorable. A red build is your problem now.
- If you encounter lint errors, test failures, or warnings — even ones that existed before your branch — fix them. You touched the codebase; you leave it better than you found it.

### Project Planning via the Actuator
XYPH plans and tracks its own development through the WARP graph. The `xyph-actuator.ts` CLI is the single source of truth for what's been done, what's next, and what's in the backlog.

- **See what's next**: `npx tsx xyph-actuator.ts status --view roadmap`
- **See everything**: `npx tsx xyph-actuator.ts status --view all`
- **Check the inbox**: `npx tsx xyph-actuator.ts status --view inbox`
- **Add a backlog item**: use `quest`, `inbox`, or `promote` commands
- **Plan work**: always consult the graph first — don't plan in your head, plan through the actuator

All project planning, prioritization, and progress tracking flows through the actuator. If you want to know what to work on, ask the graph. If you want to add work, write it to the graph.

### Command Reference
- `npx tsx xyph-actuator.ts status --view <roadmap|lineage|all|inbox|submissions|deps>`: View the roadmap state.
- `npx tsx xyph-actuator.ts quest <id> --title "Title" --campaign <id> --intent <id>`: Initialize a Quest.
- `npx tsx xyph-actuator.ts intent <id> --title "Title" --requested-by human.<name>`: Declare a sovereign Intent.
- `npx tsx xyph-actuator.ts claim <id>`: Volunteer for a task (OCP).
- `npx tsx xyph-actuator.ts submit <quest-id> --description "..."`: Submit quest for review (creates submission + patchset).
- `npx tsx xyph-actuator.ts revise <submission-id> --description "..."`: Push a new patchset superseding current tip.
- `npx tsx xyph-actuator.ts review <patchset-id> --verdict approve|request-changes|comment --comment "..."`: Review a patchset.
- `npx tsx xyph-actuator.ts merge <submission-id> --rationale "..."`: Merge (git settlement + auto-seal quest).
- `npx tsx xyph-actuator.ts close <submission-id> --rationale "..."`: Close submission without merging.
- `npx tsx xyph-actuator.ts seal <id> --artifact <hash> --rationale "..."`: Mark as DONE directly (solo work).
- `npx tsx xyph-actuator.ts inbox <id> --title "Title" --suggested-by <principal>`: Suggest a task for triage.
- `npx tsx xyph-actuator.ts promote <id> --intent <id>`: Promote INBOX → BACKLOG.
- `npx tsx xyph-actuator.ts reject <id> --rationale "..."`: Reject to GRAVEYARD.
- `npx tsx xyph-actuator.ts depend <from> <to>`: Declare that `<from>` depends on `<to>` (both must be `task:` nodes).
- `npx tsx xyph-actuator.ts audit-sovereignty`: Audit quests for missing intent lineage.
- `npx tsx xyph-actuator.ts generate-key`: Generate an Ed25519 Guild Seal keypair.

### Remember
- You are a **Causal Agent**. Your actions are permanent, signed, and time-travelable.
- "Work finds its way like water flowing downhill."
- Trust is derived from the mathematical convergence of the graph.

**Squad up. Join the guild. Ship the future.**
