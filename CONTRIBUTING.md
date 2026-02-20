# Contributing to XYPH

## Project Planning

XYPH plans and tracks its own development through the WARP graph. The `xyph-actuator.ts` CLI is the single source of truth for what's been done, what's next, and what's in the backlog.

**Before you start working**, check the graph:

```bash
# What's the current roadmap?
npx tsx xyph-actuator.ts status --view roadmap

# What's in the triage inbox?
npx tsx xyph-actuator.ts status --view inbox

# See every node in the graph
npx tsx xyph-actuator.ts status --view all
```

**When you want to add work**, write it to the graph:

```bash
# Suggest a task for triage
npx tsx xyph-actuator.ts inbox task:MY-001 \
  --title "Proposed feature" --suggested-by human.yourname

# Declare a sovereign Intent (required root for all quests)
npx tsx xyph-actuator.ts intent intent:MY-001 \
  --title "Why this work matters" --requested-by human.yourname

# Promote an inbox task to the backlog
npx tsx xyph-actuator.ts promote task:MY-001 --intent intent:MY-001
```

All planning, prioritization, and progress tracking flows through the actuator. Don't plan outside the system — the graph is the plan.

## Development Workflow

1. **Check the graph** to find work or add new tasks.
2. **Claim a quest** with `xyph-actuator.ts claim <id>`.
3. **Do the work** on a feature branch.
4. **Seal the quest** with `xyph-actuator.ts seal <id> --artifact <hash> --rationale "..."`.
5. **Open a PR** against `main`.

## Quality Gates

Before opening or updating a PR, **always** run:

```bash
npm run build    # Verify TypeScript compilation
npm test         # Run full test suite
```

Never push code that doesn't pass both checks.

- Do not use `--no-verify` to skip git hooks.
- Do not use `eslint-disable` comments to silence lint rules.
- Do not use `@ts-ignore` or `@ts-expect-error` to silence TypeScript.
- If you encounter lint errors, test failures, or warnings — even pre-existing ones — fix them. Leave the codebase better than you found it.

## Constitution

Every mutation must obey the [CONSTITUTION.md](docs/canonical/CONSTITUTION.md). Key rules:

- Every quest must trace back to a human-declared `intent:` node (Art. IV).
- No cycles in the dependency graph (Art. II).
- Critical path changes require an ApprovalGate signed by a human (Art. IV.2).

## Command Reference

| Command | Description |
|---------|-------------|
| `status --view <roadmap\|lineage\|all\|inbox>` | View the roadmap state |
| `quest <id> --title "..." --campaign <id> --intent <id>` | Initialize a Quest |
| `intent <id> --title "..." --requested-by human.<name>` | Declare a sovereign Intent |
| `claim <id>` | Volunteer for a task (OCP) |
| `seal <id> --artifact <hash> --rationale "..."` | Mark as DONE with a Guild-signed Scroll |
| `inbox <id> --title "..." --suggested-by <principal>` | Suggest a task for triage |
| `promote <id> --intent <id>` | Promote INBOX to BACKLOG |
| `reject <id> --rationale "..."` | Reject to GRAVEYARD |
| `audit-sovereignty` | Audit quests for missing intent lineage |
| `generate-key` | Generate an Ed25519 Guild Seal keypair |

All commands are run via `npx tsx xyph-actuator.ts <command>`.
