/**
 * Execute the triage decisions: SEAL done quests, CUT irrelevant ones.
 * KEEP/MERGE/RETHINK are left alone for now.
 *
 * Usage: npx tsx scripts/execute-triage.ts [--dry-run]
 */

import { WarpCore as WarpGraph, GitGraphAdapter } from '@git-stunts/git-warp';
import Plumbing from '@git-stunts/plumbing';

// Using dynamic import for the xyph module
const DRY_RUN = process.argv.includes('--dry-run');

const WRITER_ID = 'agent.prime';

// SEAL: already completed work
const SEAL: { id: string; rationale: string }[] = [
  { id: 'task:pre-push-enforcing', rationale: 'Commit e347c1a landed set -e in pre-push hook. Tests in GitHooks.test.ts prove fail-closed behavior.' },
  { id: 'task:cli-show', rationale: 'src/cli/commands/show.ts implements xyph show <id> with JSON output. Tests exist in ShowCommands.test.ts.' },
  { id: 'task:cli-move', rationale: 'src/cli/commands/link.ts line 78 implements xyph move <quest> --campaign. Tests in LinkCommands.test.ts.' },
  { id: 'task:cli-api', rationale: 'Global --json flag in xyph-actuator.ts line 58. Used throughout all commands. REST/socket API deferred to separate quest.' },
  { id: 'task:AGT-009', rationale: 'src/cli/commands/show.ts line 292 implements comment <id> with --on, --message. Tests in ShowCommands.test.ts.' },
  { id: 'task:agent-context', rationale: 'src/cli/commands/agent.ts line 785 implements xyph context <id>. JSON output supported.' },
  { id: 'task:agent-handoff', rationale: 'src/cli/commands/agent.ts line 927 implements xyph handoff <targetId>. JSON output supported.' },
  { id: 'task:suggestion-adoption', rationale: 'suggestion accept/reject/accept-all in suggestions.ts. PR #55 landed this. Acceptance tests in SuggestionAdoption.test.ts.' },
  { id: 'task:case-driven-governance', rationale: 'case: prefix active throughout codebase. Agent case flow implemented in AgentCaseFlow.test.ts.' },
  { id: 'task:lint-hook-drift-cleanup', rationale: 'Commit 6c1d4d6 cleaned up all standing ESLint failures. Pre-commit hook now reports honest status.' },
  { id: 'task:OVR-012', rationale: 'No "overview" view exists in codebase. Nothing to rename. Superseded by dashboard view naming.' },
];

// CUT: graveyard with rationale — each includes Claude's best guess at original intent
const CUT: { id: string; rationale: string }[] = [
  // --- Duplicates warp-ttd debugging ---
  { id: 'task:BX-011', rationale: 'Triage 2026-04-04. WHAT IT WAS: A CLI command to inspect which CRDT operations won or lost LWW resolution on a given node — show writer IDs, lamport ticks, and which value prevailed. Useful for debugging convergence disputes between concurrent writers. CUT: substrate-level debugging that belongs in warp-ttd, not XYPH. Per James: "We have warp-ttd to debug the WARP graph."' },
  { id: 'task:BX-012', rationale: 'Triage 2026-04-04. WHAT IT WAS: A time-travel command to materialize the graph at a specific lamport tick via SeekCache, letting you see what the roadmap looked like at any point in causal history without full replay. CUT: substrate debugging (warp-ttd territory). Per James: "Probably not relevant unless counterfactuals."' },
  { id: 'task:BX-013', rationale: 'Triage 2026-04-04. WHAT IT WAS: A TUI mode toggle — LIVE shows current materialized state, PINNED freezes at a specific tick and hard-disables all mutation commands. Visual indicator in top bar shows which mode you\'re in. CUT: graph-state pinning is warp-ttd debugging. Per James: "We have warp-ttd to debug."' },
  { id: 'task:BX-014', rationale: 'Triage 2026-04-04. WHAT IT WAS: A diff command showing what changed in the roadmap graph between two lamport ticks — new quests, status changes, sealed items, property mutations. Like git diff but over WARP causal history. CUT: tick-level diffing is substrate work. Per James: "might have been xyph trying to be git-warp."' },
  { id: 'task:BX-016', rationale: 'Triage 2026-04-04. WHAT IT WAS: A TUI panel showing the full LWW conflict story for each property on a selected node — who set it, at what lamport tick, from which writer, which value won and why. A visual provenance debugger for multi-writer contention. CUT: substrate debugging (warp-ttd territory). Phantom dep on nonexistent BX-017.' },
  { id: 'task:BX-009', rationale: 'Triage 2026-04-04. WHAT IT WAS: A CLI command wrapping graph.patchesFor(nodeId) to show the full list of patches that touched an entity over time — a causal audit trail showing who changed what and when. CUT: patchesFor() is a substrate primitive already exposed via warp-ttd. Phantom dep on nonexistent BX-017.' },
  { id: 'task:BX-010', rationale: 'Triage 2026-04-04. WHAT IT WAS: Pressing h on any entity in any TUI view (Roadmap, Lineage, Inbox, AllNodes) would open a modal showing its full mutation timeline — every patch, status change, and property write over causal history. CUT: Per James: "No idea what this is." Overlaps with warp-ttd debugging.' },
  { id: 'task:benchmark-large-graphs', rationale: 'Triage 2026-04-04. WHAT IT WAS: A performance benchmarking suite to stress-test graph materialization and query at 10k+ nodes, measuring syncCoverage latency and DAG traversal times to find scaling bottlenecks. CUT: Per James: "Written when XYPH was trying to do graph shit instead of leaning on git-warp." Performance benchmarks belong in git-warp itself (invariant:substrate-boundary).' },

  // --- Oracle pipeline — superseded by programmable workflow ---
  { id: 'task:ORC-001', rationale: 'Triage 2026-04-04. WHAT IT WAS: The first phase of the "Oracle" pipeline — automatically classify incoming work by intent type (feature/bug/chore) and infer complexity/risk scores to inform scheduling. CUT: Oracle pipeline superseded by programmable workflow (invariant:policy-is-plastic). Per James: "I don\'t even remember what the Oracle pipeline is. METHOD probably usurps whatever Oracle was all about."' },
  { id: 'task:ORC-002', rationale: 'Triage 2026-04-04. WHAT IT WAS: A policy engine that evaluates classified work against MUST/SHOULD/COULD priority rules during the Oracle VALIDATE phase — deciding whether work meets the bar for execution. CUT: Per James: "Pipeline should be programmable, templates customizable." This becomes a configurable step in the programmable workflow, not a hardcoded phase.' },
  { id: 'task:ORC-003', rationale: 'Triage 2026-04-04. WHAT IT WAS: Collision detection between candidate changes and the current graph snapshot — identifying when two pieces of planned work would conflict if executed simultaneously, then generating merge operations. CUT: Per James: "PROGRAMMABLE." Conflict detection is a substrate concern (git-warp worldlines already handle this).' },
  { id: 'task:ORC-004', rationale: 'Triage 2026-04-04. WHAT IT WAS: Using graph.traverse.levels() to partition the dependency DAG into anti-chains (sets of independent tasks at the same depth level) so a swarm of agents could work on parallel lanes without conflicts. CUT: Per James: "Probably not necessary." Agent swarm scheduling is premature.' },

  // --- Agent-generated stubs with no context ---
  { id: 'task:AGT-002', rationale: 'Triage 2026-04-04. WHAT IT WAS: An agent CLI command for quick state check — show what the agent is currently working on, what\'s claimed, what\'s blocked, with filter options by status/campaign. Think `git status` but for your XYPH work queue. CUT: no description, no reconstructable context. May overlap with existing `xyph briefing` and `xyph next` commands. Refile fresh if needed.' },
  { id: 'task:AGT-004', rationale: 'Triage 2026-04-04. WHAT IT WAS: An agent command to execute validated routine actions (claim, seal, review) with --dry-run support and structured JSON response showing what would change before committing. CUT: Per James: "Not sure, really. You made this one up." Agent-generated stub.' },
  { id: 'task:AGT-005', rationale: 'Triage 2026-04-04. WHAT IT WAS: An agent command to audit its own session activity by reading its writer\'s patch chain — showing what patches it committed, what nodes it touched, and what properties it changed during a session. CUT: no description, no reconstructable context. Session audit from patches is substrate-level (warp-ttd).' },
  { id: 'task:AGT-013', rationale: 'Triage 2026-04-04. WHAT IT WAS: A structured agent submission command that bundles test results, file metadata, and a description into a submission node — the agent equivalent of opening a PR with CI results attached. CUT: real need but this stub has no context to design from. Refile as a proper backlog doc when ready to design agent submission workflow.' },

  // --- Context irrecoverably lost ---
  { id: 'task:KSP-001', rationale: 'Triage 2026-04-04. WHAT IT WAS: Probably a transactional API for the KeyringStoragePort — ensuring that keyring operations (key rotation, migration, multi-key writes) are atomic so a crash mid-write doesn\'t corrupt the keyring.json file. CUT: Per James: "Pretty sure this has to do with cryptographically sealing quests or policy/governance stuff? Not 100% sure." Context too vague to design from.' },
  { id: 'task:SUB-SCHEMA-001', rationale: 'Triage 2026-04-04. WHAT IT WAS: A latent schema collision — the `decision:` prefix was used for both concept/decision nodes (pre-existing) and submission decision nodes (added in M6). Type property discriminates them, but sharing a prefix means queries for one might accidentally match the other. CUT: Per James: "No idea wtf this means." If it bites us, we\'ll notice.' },
  { id: 'task:cli-plan', rationale: 'Triage 2026-04-04. WHAT IT WAS: A command to show an execution plan for a campaign — the frontier of executable tasks, blocked items, critical path via weightedLongestPath(), and progress percentage. Like a campaign-scoped project dashboard in the terminal. CUT: Per James: "No idea." Campaigns are being retired for legends; the concept needs redesign.' },

  // --- Bijou upstream work — track in bijou repo ---
  { id: 'task:bijou-dag-renderer', rationale: 'Triage 2026-04-04. WHAT IT WAS: Upstream a dag() rendering component to bijou — ASCII DAG visualization with auto-layout (dagLayout()) and edge routing for terminal display. Would be used by XYPH\'s dependency graph views. CUT: bijou upstream work belongs in the bijou repo, not XYPH.' },
  { id: 'task:bijou-generic-resolved-theme', rationale: 'Triage 2026-04-04. WHAT IT WAS: Make bijou\'s ResolvedTheme type generic (ResolvedTheme<T>) so XYPH doesn\'t need to double-cast through unknown in bridge.ts when mapping its own theme tokens to bijou\'s rendering. CUT: bijou upstream work. Track in bijou repo.' },

  // --- Too far out / premature ---
  { id: 'task:web-ui', rationale: 'Triage 2026-04-04. WHAT IT WAS: A local, air-gapped SPA for browsing the WARP graph — offline-first with no CDN dependencies, serving as the web equivalent of the TUI dashboard for browsers. CUT: bearing says TUI is the human surface, web follows later. Too far out to track. Resurrect when TUI is mature.' },
  { id: 'task:ide-integration', rationale: 'Triage 2026-04-04. WHAT IT WAS: VSCode extension and Neovim plugin that make the editor quest-aware — show current quest context, link commits to quests, surface graph health in the editor gutter. CUT: no foundation for this yet. Depends on cli-api (REST/socket) which isn\'t built. Way too far out.' },
  { id: 'task:appframe-migration', rationale: 'Triage 2026-04-04. WHAT IT WAS: Migrate the DashboardApp from manual TEA wiring to bijou\'s createFramedApp() when the appFrame API stabilizes — getting tabs, panes, overlays, and command palette for free. CUT: bijou appFrame already exists as createFramedApp() but this migration hasn\'t been prioritized. Refile when doing a TUI overhaul cycle.' },

  // --- Micro-stubs with no context ---
  { id: 'task:DIAG-001', rationale: 'Triage 2026-04-04. WHAT IT WAS: Render SVG diagrams in both light and dark variants (or use CSS-adaptive SVGs) so they look correct in GitHub dark mode and light mode. CUT: cosmetic, no context, low priority.' },
  { id: 'task:dashboard-visibility-constants', rationale: 'Triage 2026-04-04. WHAT IT WAS: Extract the hardcoded dashboard panel visibility caps (8 items in one panel, 6 in another) into a shared config object so they\'re documented and adjustable. CUT: micro-refactoring. Do it during a cycle that touches those files.' },
  { id: 'task:docstring-coverage', rationale: 'Triage 2026-04-04. WHAT IT WAS: Add JSDoc comments to CLI command handlers and domain service methods that lack them. CUT: "improve docstrings" is too vague for a cycle. Do it incrementally as you touch files.' },
  { id: 'task:pr-health-script', rationale: 'Triage 2026-04-04. WHAT IT WAS: A shell script to summarize PR health — CI check status, review count, unresolved comment threads — for quick triage of open PRs. CUT: superseded by the /pr-feedback skill which already does this interactively.' },
  { id: 'task:vi-stub-env-migration', rationale: 'Triage 2026-04-04. WHAT IT WAS: Replace raw process.env mutations in resolve.test.ts with vitest\'s vi.stubEnv() helper, which auto-restores env vars after each test. Prevents env leakage between tests. CUT: micro-refactoring. Do it when touching that test file.' },
  { id: 'task:style-guide-md040', rationale: 'Triage 2026-04-04. WHAT IT WAS: Add language identifiers (```typescript, ```bash, etc.) to fenced code blocks in STYLE_GUIDE.md to satisfy markdownlint MD040 and enable syntax highlighting. CUT: fold into DOCS-AUDIT cycle.' },
  { id: 'task:advisory-doc-versioning', rationale: 'Triage 2026-04-04. WHAT IT WAS: Make advisory docs (docs/advisory/) auto-expire or link to the commit hash they were written against, so readers know whether the advice is still current or stale. CUT: fold into DOCS-AUDIT cycle.' },
  { id: 'task:roadmap-coverage-badge', rationale: 'Triage 2026-04-04. WHAT IT WAS: Show a coverage badge next to each quest in the roadmap view — "3/5 criteria met" — so you can see traceability completeness at a glance without switching to the trace view. CUT: cosmetic, no context. Nice-to-have for a future PROV cycle.' },
  { id: 'task:traceability-heatmap', rationale: 'Triage 2026-04-04. WHAT IT WAS: A TUI view showing traceability coverage as a visual heat map rendered with bijou\'s DAG renderer — hot spots are well-covered quests, cold spots have gaps. CUT: far-future visualization. Depends on bijou DAG renderer (also cut).' },
  { id: 'task:worker-thread-loading', rationale: 'Triage 2026-04-04. WHAT IT WAS: Move fetchSnapshot (graph materialization + projection) to a Node.js worker_thread so the TUI main thread stays responsive during the initial load — no rendering hitches while the graph materializes. CUT: premature optimization. No evidence TUI loading is a bottleneck yet.' },
  { id: 'task:snapshot-render-regression', rationale: 'Triage 2026-04-04. WHAT IT WAS: Snapshot regression tests that capture the exact terminal output of renderRoadmap/renderAll/renderLineage and fail if it changes unexpectedly — like Jest snapshot testing but for styled CLI output. CUT: agent-generated, phantom BJU-002 dep. Snapshot tests for styled output are brittle by nature.' },
  { id: 'task:confirm-overlay-integration-test', rationale: 'Triage 2026-04-04. WHAT IT WAS: An integration test proving that bijou overlays (modals, toasts) render correctly when triggered from the landing page or help view — ensuring the overlay factory actually produces visible output in the view tree. CUT: cosmetic TUI test, agent-generated, no context on what bug prompted it.' },
  { id: 'task:tui-toast-watch', rationale: 'Triage 2026-04-04. WHAT IT WAS: Use graph.watch() to poll for remote WARP changes, and when detected, show a bijou toast() notification in the TUI — "Graph updated by agent.prime" — so the operator knows the dashboard data is stale. CUT: nice-to-have, phantom BJU-009 dep, no context on priority.' },
  { id: 'task:tui-logger-unit-tests', rationale: 'Triage 2026-04-04. WHAT IT WAS: Unit tests for TuiLogger\'s parent-chain delegation — verifying that log messages propagate up through nested logger instances correctly (child→parent→root). CUT: micro-test stub, phantom BJU-002 dep, agent-generated.' },
  { id: 'task:lint-unused-interface-fields', rationale: 'Triage 2026-04-04. WHAT IT WAS: Add an ESLint rule (or custom check) that detects interface fields declared in model types but never read anywhere in the codebase — dead type surface that adds confusion without value. CUT: no context, phantom dep on coverage-threshold. Do it if a concrete unused field causes a bug.' },
  { id: 'task:soft-gate-merge', rationale: 'Triage 2026-04-04. WHAT IT WAS: A soft enforcement gate on merge/seal — warn (but don\'t block) when traceability coverage is below threshold (e.g., quest has no evidence or criteria). Gentler than hard-blocking. CUT: concept folded into invariant:witness-before-done and PROV legend. The invariant makes this a hard requirement, not a soft warning.' },
  { id: 'task:temporal-traceability', rationale: 'Triage 2026-04-04. WHAT IT WAS: Use git-warp\'s CTL* temporal operators (always/eventually) to query evidence history — "was this criterion EVER satisfied?" or "has this requirement ALWAYS been covered since tick N?" CUT: CTL* temporal queries are git-warp substrate primitives. Using them is fine; building a wrapper layer is substrate work (invariant:substrate-boundary).' },
  { id: 'task:suggestion-learning-loop', rationale: 'Triage 2026-04-04. WHAT IT WAS: Track accept/reject decisions on AI suggestions and use them to auto-calibrate the heuristic layer weights in AnalysisOrchestrator — so the suggestion engine gets smarter over time by learning from human judgment. CUT: far-future ML/feedback loop. No context on what the calibration model would look like.' },
  { id: 'task:cross-adapter-test-stability', rationale: 'Triage 2026-04-04. WHAT IT WAS: The CrossAdapterVisibility integration test was flaky — sometimes timed out because two graph instances racing to materialize would miss each other\'s mutations. Fix by increasing timeout or running integration tests sequentially. CUT: if still flaky, we\'d notice in CI. Band-aid fix, not a design improvement.' },
  { id: 'task:cli-batch', rationale: 'Triage 2026-04-04. WHAT IT WAS: A batch command (xyph batch claim/seal) that lets agents claim or seal multiple quests in one invocation, reducing round-trips when processing a work queue. Each item would be validated independently. CUT: real need but this stub has no context. Refile with a proper backlog doc when agent batch workflows are designed.' },
  { id: 'task:cli-diff', rationale: 'Triage 2026-04-04. WHAT IT WAS: A graph-level change detection command — show what changed since a given tick or time duration. New quests, status transitions, sealed items, property changes. Like git log but for WARP graph mutations. CUT: Per James: "might have been xyph trying to be git-warp instead of just using git-warp." Graph diffing is substrate.' },
  { id: 'task:agent-cli-hardening', rationale: 'Triage 2026-04-04. WHAT IT WAS: A meta-quest to bring every agent-facing CLI command (briefing, next, context, act, handoff, submissions) to the same quality bar as the TUI — consistent error handling, --json support, help text, input validation. CUT: this is the SURF legend\'s ongoing mission, not a discrete quest. Every cycle that touches agent commands should improve them.' },
  { id: 'task:BX-007', rationale: 'Triage 2026-04-04. WHAT IT WAS: Record who promoted a quest (promoted_by) and when (promoted_at) as properties on the quest node during the promote command, closing a provenance gap where promotions were visible as status changes but not attributed to a specific principal. CUT: no description. Real provenance need — refile as a proper backlog doc if promote attribution matters.' },
  { id: 'task:pre-push-typecheck', rationale: 'Triage 2026-04-04. WHAT IT WAS: Add tsc --noEmit to the pre-push hook so type errors are caught locally before they hit CI — complementing the existing lint and test checks. CUT: no description. Good idea — refile with a proper backlog doc that considers hook execution time budget (120s limit per CLAUDE.md).' },
  { id: 'task:auto-graph-push-hook', rationale: 'Triage 2026-04-04. WHAT IT WAS: A post-push git hook that automatically pushes WARP writer refs (refs/warp/xyph/writers/*) whenever you push code, so the graph stays in sync with the remote without a separate manual step. Per James: "Add a script to configure local git repo settings to push xyph refs when you do git push." CUT: context recovered but small scope — file fresh when needed.' },
  { id: 'task:ci-graph-cache', rationale: 'Triage 2026-04-04. WHAT IT WAS: Use GitHub Actions cache to persist materialized graph state between CI runs, so the traceability job doesn\'t have to re-materialize the full graph from scratch every time. Would speed up the analyze --dry-run step significantly. CUT: no description. File fresh when CI materialization becomes a bottleneck.' },
  { id: 'task:tui-min-size-guard', rationale: 'Triage 2026-04-04. WHAT IT WAS: Detect when the terminal is too small (below minimum columns/rows) to render the TUI dashboard properly, and show a friendly "please resize your terminal" message instead of garbled output. CUT: no description, phantom BJU-002 dep. File fresh when implementing a TUI polish cycle.' },
  { id: 'task:tui-runscript-tests', rationale: 'Triage 2026-04-04. WHAT IT WAS: Use bijou\'s runScript() test driver to write automated TUI tests — send resize events and key messages, capture rendered frames, assert on output. Would replace manual TUI testing with deterministic script-driven verification. CUT: no description. File fresh as part of a TUI testing cycle with proper design.' },
];

async function main(): Promise<void> {
  const { resolveGraphRuntime } = await import('../src/cli/runtimeGraph.js');
  const runtime = resolveGraphRuntime({ cwd: process.cwd() });
  const plumbing = Plumbing.createDefault({ cwd: runtime.repoPath });
  const persistence = new GitGraphAdapter({ plumbing });

  const graph = await WarpGraph.open({
    persistence,
    graphName: runtime.graphName,
    writerId: WRITER_ID,
    autoMaterialize: true,
  });

  await graph.syncCoverage();
  await graph.materialize();

  console.log(`Mode: ${DRY_RUN ? 'DRY RUN' : 'LIVE'}`);
  console.log('');

  // SEAL
  console.log(`=== SEAL (${SEAL.length}) ===`);
  let sealCount = 0;
  for (const item of SEAL) {
    const exists = await graph.hasNode(item.id);
    if (!exists) {
      console.log(`  SKIP ${item.id} — not in graph`);
      continue;
    }
    const props = await graph.getNodeProps(item.id);
    const status = props?.['status'] as string | undefined;
    if (status === 'DONE') {
      console.log(`  SKIP ${item.id} — already DONE`);
      continue;
    }
    if (DRY_RUN) {
      console.log(`  WOULD SEAL ${item.id} (currently ${status ?? 'unknown'})`);
    } else {
      const patch = await graph.createPatch();
      patch.setProperty(item.id, 'status', 'DONE');
      patch.setProperty(item.id, 'sealed_at', Date.now());
      patch.setProperty(item.id, 'sealed_by', WRITER_ID);
      patch.setProperty(item.id, 'seal_rationale', item.rationale);
      const sha = await patch.commit();
      console.log(`  SEALED ${item.id} (${sha.slice(0, 8)})`);
    }
    sealCount++;
  }
  console.log(`  Total: ${sealCount} sealed`);
  console.log('');

  // CUT
  console.log(`=== CUT → GRAVEYARD (${CUT.length}) ===`);
  let cutCount = 0;
  for (const item of CUT) {
    const exists = await graph.hasNode(item.id);
    if (!exists) {
      console.log(`  SKIP ${item.id} — not in graph`);
      continue;
    }
    const props = await graph.getNodeProps(item.id);
    const status = props?.['status'] as string | undefined;
    if (status === 'DONE' || status === 'GRAVEYARD') {
      console.log(`  SKIP ${item.id} — already ${status}`);
      continue;
    }
    if (DRY_RUN) {
      console.log(`  WOULD CUT ${item.id} (currently ${status ?? 'unknown'})`);
    } else {
      const patch = await graph.createPatch();
      patch.setProperty(item.id, 'status', 'GRAVEYARD');
      patch.setProperty(item.id, 'rejected_at', Date.now());
      patch.setProperty(item.id, 'rejected_by', WRITER_ID);
      patch.setProperty(item.id, 'reject_rationale', item.rationale);
      const sha = await patch.commit();
      console.log(`  CUT    ${item.id} (${sha.slice(0, 8)})`);
    }
    cutCount++;
  }
  console.log(`  Total: ${cutCount} graveyarded`);
  console.log('');

  console.log('Done.');
  console.log(`  Sealed: ${sealCount}`);
  console.log(`  Graveyarded: ${cutCount}`);
  console.log(`  Remaining open: ~${158 - sealCount - cutCount}`);
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
