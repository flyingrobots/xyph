# AGENTS

This guide is for AI agents and human operators recovering context in the Xyph repository.

## Git Rules

- **NEVER** amend commits.
- **NEVER** rebase or force-push.
- **NEVER** push to `main` without explicit permission.
- Always use standard commits and regular pushes.

## Pull Request And Merge Policy

- Treat the live GitHub ruleset as the authority for mechanical merge gates. Check
  branch rules and required checks before deciding a PR is blocked.
- The solo-maintainer default is intentionally light: protect the default branch
  from deletion and non-fast-forward updates, but do not invent a hard-coded
  two-approval requirement when GitHub does not require one.
- For owner-maintained PRs, an explicit owner approval or merge request is enough
  to proceed once CI is green, the worktree is clean, and unresolved blocking
  review threads have been addressed or intentionally waived.
- `gh pr merge --admin --merge` is acceptable only when the owner explicitly asks
  for the admin override and the live ruleset permits bypass. Never use it as a
  substitute for unresolved code quality, test, or review work.
- For contributor PRs, follow the live branch protection or ruleset requirements.
  If GitHub requires approvals, do not bypass them unless the owner explicitly
  changes the policy for that PR.

## Architectural Bedrock Boundary (The #1 Priority)

- **XYPH MUST NOT DO GIT-WARP'S JOB.**
- **Pure Domain Boundary**: Xyph should only know about Optics and Intents.
- **Worldline Evolution**: Worldline forking/braiding is permissible, but Xyph must **NEVER** imperatively manage nodes, graphs, traversals, or materialization state machines.

## Documentation & Planning Map

Do not audit the repository by recursively walking the filesystem. Follow the authoritative manifests:

### 1. The Entrance
- **`README.md`**: Public front door, core value prop, and quick start.
- **`GUIDE.md`**: Orientation, fast path, and system orchestration.

### 2. The Bedrock
- **`ARCHITECTURE.md`**: The authoritative structural reference (Hexagonal, Ports, WARP).
- **[docs/TS_STANDARDS.md](file:///Users/james/git/xyph/docs/TS_STANDARDS.md)**: Bounded context, deterministic, and LLM-agent-aware TypeScript coding guidelines.
- **`docs/VISION.md`**: Core tenets and the stigmergic mission.
- **`METHOD.md`**: Repo work doctrine (Backlog lanes, Cycle loop).

### 3. The Direction
- **`docs/BEARING.md`**: Current execution gravity and active tensions.
- **`design/README.md`**: Design corpus, Sponsor Actors, and Hills.
- **`design/cycles/`**: Active and landed cycle design documents.

### 4. The Proof
- **`CHANGELOG.md`**: Historical truth of merged behavior.
- **`docs/audit/`**: Structural health and due diligence reports.

## Context Recovery Protocol

When starting a new session or recovering from context loss:

1. **Read `docs/BEARING.md`** to find the current execution gravity.
2. **Read `METHOD.md`** to understand the work doctrine.
3. **Check `design/cycles/`** for the active cycle design.
4. **Check `git log -n 5` and `git status`** to verify the current branch state.

## End of Turn Checklist

After altering files:

1. **Verify Truth**: Ensure documentation is updated if behavior or structure changed.
2. **Log Debt**: Add follow-on backlog items to `bad-code/` or `cool-ideas/`.
3. **Dogfood the Graph**: The graph IS the plan. Use the `xyph.ts` CLI actuator to formally record, move, authorize, and link your completed work as native graph nodes.
4. **Commit**: Use focused, conventional commit messages. Propose a draft before executing.
5. **Validate**: Run `npm run lint` and `npm run test:local`.

---
**The goal is inevitably. Every feature is defined by its tests.**
