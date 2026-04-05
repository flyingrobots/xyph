/**
 * Execute MERGE and RETHINK triage decisions.
 *
 * MERGE: Graveyard the individual stubs, create one consolidated quest per group.
 * RETHINK: Either graveyard (superseded), reset status, or reframe.
 *
 * Usage: npx tsx scripts/execute-merge-rethink.ts [--dry-run]
 */

import { WarpCore as WarpGraph, GitGraphAdapter } from '@git-stunts/git-warp';
import Plumbing from '@git-stunts/plumbing';

const DRY_RUN = process.argv.includes('--dry-run');
const WRITER_ID = 'agent.prime';

// MERGE: graveyard stubs, create consolidated quests
interface MergeGroup {
  name: string;
  legend: string;
  newId: string;
  newTitle: string;
  newDescription: string;
  oldIds: string[];
  graveyardReason: string;
}

const MERGES: MergeGroup[] = [
  {
    name: 'Dashboard Redesign',
    legend: 'SURF',
    newId: 'task:dashboard-redesign',
    newTitle: 'Dashboard redesign: overview page with progress, alerts, actions, and campaign focus',
    newDescription: 'Consolidation of OVR-001 through OVR-011. Redesign the dashboard landing page with: project header and overall progress bar, in-progress and pending review sections, campaign progress bars with active-first sorting, My Issues panel, alert bar (sovereignty violations, stale claims), inbox pressure indicator, dependency blockers summary, writer activity panel, quick actions (claim frontier, promote inbox), and campaign focus mode. Should also address whether the default view switches from roadmap to the new dashboard.',
    oldIds: ['task:OVR-001', 'task:OVR-002', 'task:OVR-003', 'task:OVR-004', 'task:OVR-005', 'task:OVR-006', 'task:OVR-007', 'task:OVR-008', 'task:OVR-009', 'task:OVR-010', 'task:OVR-011'],
    graveyardReason: 'Triage 2026-04-04: Merged into task:dashboard-redesign. 11 chained stubs with no descriptions consolidated into one cycle-worthy backlog item.',
  },
  {
    name: 'Graveyard View',
    legend: 'SURF',
    newId: 'task:graveyard-view',
    newTitle: 'Graveyard TUI view: browse rejected quests, reopen to inbox, rejection patterns',
    newDescription: 'Consolidation of GRV-001 through GRV-003. A TUI view for browsing graveyarded quests with: rationale and rejection timeline per quest, r key to reopen (sends back to INBOX with history preserved), and a patterns section showing rejection stats, top rejectors/suggesters, and common rejection reasons.',
    oldIds: ['task:GRV-001', 'task:GRV-002', 'task:GRV-003'],
    graveyardReason: 'Triage 2026-04-04: Merged into task:graveyard-view. Three chained stubs consolidated.',
  },
  {
    name: 'Lineage View Enhancement',
    legend: 'SURF',
    newId: 'task:lineage-view-enhancement',
    newTitle: 'Lineage view: intent cards with description, progress, and orphan sovereignty warnings',
    newDescription: 'Consolidation of LIN-001 through LIN-003. Enhance the lineage view with: intent descriptions surfaced in IntentNode snapshot, intent cards showing description + progress bar + derived stats, and orphan sovereignty warnings promoted to a top-level health indicator.',
    oldIds: ['task:LIN-001', 'task:LIN-002', 'task:LIN-003'],
    graveyardReason: 'Triage 2026-04-04: Merged into task:lineage-view-enhancement. Three chained stubs consolidated.',
  },
  {
    name: 'Theme Refactoring',
    legend: 'SURF',
    newId: 'task:theme-refactor',
    newTitle: 'Theme refactoring: shared module, destructured tokens, preview command',
    newDescription: 'Consolidation of theme-shared-module, actuator-theme-destructure, and theme-preview-command. Extract chalk theme utilities to src/shared/theme/ for neutral import path, destructure theme tokens at top of action handlers to reduce styled() verbosity, and add a theme --preview command to render all tokens side-by-side.',
    oldIds: ['task:theme-shared-module', 'task:actuator-theme-destructure', 'task:theme-preview-command'],
    graveyardReason: 'Triage 2026-04-04: Merged into task:theme-refactor. Three related theme tasks consolidated.',
  },
  {
    name: 'Diagram CI Hardening',
    legend: 'FLOW',
    newId: 'task:diagram-ci-hardening',
    newTitle: 'Diagram CI: rot detection against QuestStatus enum + pinned mmdc version',
    newDescription: 'Consolidation of DIAG-002 and DIAG-003. Add a CI check that state machine diagrams match the QuestStatus enum values (flag drift when enum changes but diagrams don\'t), and pin the mmdc (mermaid CLI) version in render-diagrams.sh for reproducible SVG output across environments.',
    oldIds: ['task:DIAG-002', 'task:DIAG-003'],
    graveyardReason: 'Triage 2026-04-04: Merged into task:diagram-ci-hardening. Two diagram CI tasks consolidated.',
  },
  {
    name: 'Dep Hygiene',
    legend: 'FLOW',
    newId: 'task:dep-hygiene',
    newTitle: 'Dependency hygiene: lockfile consistency guard + PR checklist for dep changes',
    newDescription: 'Consolidation of lockfile-consistency-guard and pr-dependency-checklist. Add a guard (CI + pre-push) that detects lockfile drift when package.json dependency metadata changes, and add a PR checklist reminder for dependency and lockfile synchronization on version changes.',
    oldIds: ['task:lockfile-consistency-guard', 'task:pr-dependency-checklist'],
    graveyardReason: 'Triage 2026-04-04: Merged into task:dep-hygiene. Two dep hygiene tasks consolidated.',
  },
];

// RETHINK: various dispositions
interface RethinkItem {
  id: string;
  action: 'graveyard' | 'reset-backlog' | 'reframe';
  rationale: string;
  // For reframe: new properties to set
  newTitle?: string;
  newDescription?: string;
}

const RETHINKS: RethinkItem[] = [
  // Forge pipeline → graveyard (METHOD cycles replace it)
  { id: 'task:FRG-001', action: 'graveyard', rationale: 'Triage 2026-04-04. WHAT IT WAS: The REVIEW phase of the Forge planning compiler — generate human-readable diffs of proposed graph changes and resolve approver assignments. RETHINK: METHOD cycles (design→red→green→playback→retro) replace the Forge pipeline. The submission/review workflow already handles code review; Forge was about automating plan-to-graph compilation which is now the programmable workflow\'s job.' },
  { id: 'task:FRG-002', action: 'graveyard', rationale: 'Triage 2026-04-04. WHAT IT WAS: The EMIT phase of Forge — generate signed PlanPatchArtifact documents representing proposed graph mutations, ready for approval. RETHINK: superseded by programmable workflow pipeline (invariant:policy-is-plastic). Plan artifacts would be design docs in the graph, not compiled PlanPatchArtifacts.' },
  { id: 'task:FRG-003', action: 'graveyard', rationale: 'Triage 2026-04-04. WHAT IT WAS: The APPLY phase of Forge — validate proposed mutations against domain rules, emit graph.patch() calls, and write audit records. RETHINK: domain validation before graph.patch() already exists in actuator commands. Forge APPLY was an abstraction layer that isn\'t needed with direct graph operations.' },
  { id: 'task:FRG-004', action: 'graveyard', rationale: 'Triage 2026-04-04. WHAT IT WAS: End-to-end integration test for the full Forge pipeline (INGEST→CLASSIFY→VALIDATE→REVIEW→EMIT→APPLY). RETHINK: Forge pipeline is graveyarded, so no integration test needed. Future programmable pipeline will have its own test strategy.' },

  // Triage pipeline → graveyard (METHOD backlog lanes replace it)
  { id: 'task:TRG-001', action: 'graveyard', rationale: 'Triage 2026-04-04. WHAT IT WAS: A formal promotion review workflow with PROPOSED status — propose an item for promotion, other participants review the proposal, then accept/reject. Adds a governance layer to backlog triage. RETHINK: METHOD uses direct pull-from-backlog with lane-based priority (inbox→asap→up-next). The governed proposal step may return as a policy option but isn\'t the default workflow.' },
  { id: 'task:TRG-002', action: 'graveyard', rationale: 'Triage 2026-04-04. WHAT IT WAS: Store triage policy configuration in the WARP graph — approval counts required, whether human review is mandatory, agent permissions for triage actions. RETHINK: triage policy becomes part of the programmable workflow pipeline (invariant:policy-is-plastic). Not a standalone triage engine config.' },
  { id: 'task:TRG-003', action: 'graveyard', rationale: 'Triage 2026-04-04. WHAT IT WAS: A TUI view for the triage workflow — showing pending promotion proposals, the inbox queue with item details, and recommendation cards. RETHINK: METHOD\'s triage is simpler (look at lanes, pull what\'s next). The TUI backlog view will need to show lanes, but not a full proposal/review workflow.' },
  { id: 'task:TRG-004', action: 'graveyard', rationale: 'Triage 2026-04-04. WHAT IT WAS: An AI recommendation engine for triage — suggest which campaign/intent to assign, infer priority signals, detect duplicate proposals. RETHINK: ML-powered triage recommendations are far-future. The suggestion engine (already built) partially covers this.' },
  { id: 'task:TRG-005', action: 'graveyard', rationale: 'Triage 2026-04-04. WHAT IT WAS: A CLI command to generate a structured triage report — inbox analysis with recommendations in JSON/text/markdown format. RETHINK: `xyph briefing` and `xyph next` already provide agent-consumable work recommendations. Triage report is a subset of briefing.' },

  // VOC-003 → graveyard (campaigns becoming legends)
  { id: 'task:VOC-003', action: 'graveyard', rationale: 'Triage 2026-04-04. WHAT IT WAS: Require campaign, intent, dependencies, and hours at promote time — making promotion a DAG insertion that fully wires the quest into the graph. RETHINK: campaigns are becoming legends. The promote workflow needs redesign around cycles and legends, not campaign-centric DAG insertion.' },

  // bijou-v4-uplift → graveyard (premature)
  { id: 'task:bijou-v4-uplift', action: 'graveyard', rationale: 'Triage 2026-04-04. WHAT IT WAS: Upgrade the TUI runtime from bijou v3 to v4\'s Surface/LayoutNode contract — a new rendering abstraction that separates layout from rendering. RETHINK: bijou is at v3.1.0. v4 isn\'t released. Premature. Resurrect when bijou v4 ships.' },

  // doc-agent-charter → graveyard (superseded by principal-general-authority)
  { id: 'task:doc-agent-charter', action: 'graveyard', rationale: 'Triage 2026-04-04. WHAT IT WAS: Decide whether to implement or retire AGENT_CHARTER.md, which describes a 6-agent role architecture (Parser, Planner, Graph, QA, Coordinator, Worker). Currently a DRAFT. RETHINK: invariant:principal-general-authority supersedes the fixed-role model. Authority flows from grants, not predefined roles. Retire the DRAFT as part of DOCS-AUDIT.' },

  // TRC-010 → reset to BACKLOG (stale IN_PROGRESS claim)
  { id: 'task:TRC-010', action: 'reset-backlog', rationale: 'Triage 2026-04-04: IN_PROGRESS but blocker TRC-009 is still PLANNED. Stale claim from a previous session. Reset to BACKLOG. The concept (computed DONE from criterion verdicts) is still valid but needs rethinking in light of invariant:witness-before-done.' },

  // DSH-002 → reframe (campaigns → legends)
  { id: 'task:DSH-002', action: 'reframe', rationale: 'Triage 2026-04-04: Campaigns are being retired in favor of legends. Reframed from "campaign command" to "legend command."',
    newTitle: 'Add xyph legend command to create and manage legend nodes',
    newDescription: 'Add a legend creation/management command to the actuator. Legends are eternal domains that span the project lifetime and protect invariants. The command should create legend:* nodes with title, code, and content attachment, and wire protects edges to invariant:* nodes. Replaces the never-built campaign creation command.' },

  // principal-capability-model → keep as PLANNED but reframe
  { id: 'task:principal-capability-model', action: 'reframe', rationale: 'Triage 2026-04-04: invariant:principal-general-authority defines the principle. This quest implements it. Reframed to reference the invariant.',
    newTitle: 'Implement principal-general capability model with explicit grants and delegation',
    newDescription: 'Implement the capability model declared by invariant:principal-general-authority. Define capability grant types, delegation contracts, and the resolution logic that determines what a principal can do. Authority flows from explicit grants and policy, not species (human vs agent). Separate principal identity from capability scope.' },

  // AGT-006 → reframe (partially done)
  { id: 'task:AGT-006', action: 'reframe', rationale: 'Triage 2026-04-04: AgentBriefingService and AgentActionService already exist. Reframed to focus on what\'s missing.',
    newTitle: 'Complete agent domain services: recommender and action validation',
    newDescription: 'AgentBriefingService and AgentActionService exist. What\'s missing: (1) AgentRecommender — given current graph state, recommend the highest-value next action for an agent principal. (2) AgentActionValidator — pre-validate proposed actions against policy and capability grants before execution. These close the gap between "agent can see work" and "agent can autonomously pick the right work."' },

  // BX-006 → reframe (not species-gated, policy-configurable)
  { id: 'task:BX-006', action: 'reframe', rationale: 'Triage 2026-04-04: Per James, this should be configurable policy, not hardcoded species gate. Reframed.',
    newTitle: 'Configurable confirmation gates for sensitive commands (policy-driven, not species-gated)',
    newDescription: 'Add configurable confirmation gates (TTY prompt, /dev/tty, etc.) for sensitive commands like intent, promote, reject, reopen. Per invariant:principal-general-authority, gates must be policy-driven, not species-gated — a project may choose to require TTY confirmation for certain operations regardless of whether the principal is human or agent. XYPH itself probably won\'t use this internally (except tests), but downstream projects may want to lock capabilities behind confirmation gates.' },

  // method-alignment-profile → reframe (partially addressed)
  { id: 'task:method-alignment-profile', action: 'reframe', rationale: 'Triage 2026-04-04: Invariants, legends, and bearing are done. Remaining scope is the programmable pipeline itself.',
    newTitle: 'Programmable workflow pipeline with METHOD as the default profile',
    newDescription: 'Invariants, legends, and bearing are committed to the graph. Remaining scope: make the workflow pipeline itself programmable. cycle:* as a first-class entity with design→red→green→playback→retro→close loop. Backlog lanes as graph-native properties. Pipeline steps as policy nodes that authorized principals can edit, add, delete, merge, resequence. METHOD discipline is the default profile but not the only one (invariant:policy-is-plastic).' },
];

async function main(): Promise<void> {
  const { resolveGraphRuntime } = await import('/Users/james/git/xyph/src/cli/runtimeGraph.js');
  const runtime = resolveGraphRuntime({ cwd: '/Users/james/git/xyph' });
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

  // === MERGES ===
  console.log(`=== MERGES (${MERGES.length} groups) ===`);
  for (const group of MERGES) {
    console.log(`\n  ${group.name}:`);

    // Graveyard old stubs
    for (const oldId of group.oldIds) {
      const exists = await graph.hasNode(oldId);
      if (!exists) { console.log(`    SKIP ${oldId} — not in graph`); continue; }
      const props = await graph.getNodeProps(oldId);
      const status = props?.['status'] as string | undefined;
      if (status === 'DONE' || status === 'GRAVEYARD') { console.log(`    SKIP ${oldId} — already ${status}`); continue; }

      if (DRY_RUN) {
        console.log(`    WOULD GRAVEYARD ${oldId}`);
      } else {
        const patch = await graph.createPatch();
        patch.setProperty(oldId, 'status', 'GRAVEYARD');
        patch.setProperty(oldId, 'rejected_at', Date.now());
        patch.setProperty(oldId, 'rejected_by', WRITER_ID);
        patch.setProperty(oldId, 'reject_rationale', group.graveyardReason);
        await patch.commit();
        console.log(`    GRAVEYARDED ${oldId}`);
      }
    }

    // Create consolidated quest
    const newExists = await graph.hasNode(group.newId);
    if (newExists) {
      console.log(`    SKIP ${group.newId} — already exists`);
    } else if (DRY_RUN) {
      console.log(`    WOULD CREATE ${group.newId}: ${group.newTitle.slice(0, 60)}...`);
    } else {
      const patch = await graph.createPatch();
      patch.addNode(group.newId);
      patch.setProperty(group.newId, 'title', group.newTitle);
      patch.setProperty(group.newId, 'description', group.newDescription);
      patch.setProperty(group.newId, 'status', 'BACKLOG');
      patch.setProperty(group.newId, 'type', 'quest');
      patch.setProperty(group.newId, 'taskKind', 'delivery');
      patch.setProperty(group.newId, 'legend', group.legend);
      patch.setProperty(group.newId, 'created_at', Date.now());
      patch.setProperty(group.newId, 'created_by', WRITER_ID);
      patch.setProperty(group.newId, 'merge_source', group.oldIds.join(', '));
      const sha = await patch.commit();
      console.log(`    CREATED ${group.newId} (${sha.slice(0, 8)})`);
    }
  }

  // === RETHINKS ===
  console.log(`\n=== RETHINKS (${RETHINKS.length}) ===`);
  for (const item of RETHINKS) {
    const exists = await graph.hasNode(item.id);
    if (!exists) { console.log(`  SKIP ${item.id} — not in graph`); continue; }
    const props = await graph.getNodeProps(item.id);
    const status = props?.['status'] as string | undefined;
    if (status === 'DONE' || status === 'GRAVEYARD') { console.log(`  SKIP ${item.id} — already ${status}`); continue; }

    if (item.action === 'graveyard') {
      if (DRY_RUN) {
        console.log(`  WOULD GRAVEYARD ${item.id}`);
      } else {
        const patch = await graph.createPatch();
        patch.setProperty(item.id, 'status', 'GRAVEYARD');
        patch.setProperty(item.id, 'rejected_at', Date.now());
        patch.setProperty(item.id, 'rejected_by', WRITER_ID);
        patch.setProperty(item.id, 'reject_rationale', item.rationale);
        await patch.commit();
        console.log(`  GRAVEYARDED ${item.id}`);
      }
    } else if (item.action === 'reset-backlog') {
      if (DRY_RUN) {
        console.log(`  WOULD RESET ${item.id} → BACKLOG`);
      } else {
        const patch = await graph.createPatch();
        patch.setProperty(item.id, 'status', 'BACKLOG');
        patch.setProperty(item.id, 'triage_note', item.rationale);
        await patch.commit();
        console.log(`  RESET ${item.id} → BACKLOG`);
      }
    } else if (item.action === 'reframe') {
      if (DRY_RUN) {
        console.log(`  WOULD REFRAME ${item.id}: ${item.newTitle?.slice(0, 60)}...`);
      } else {
        const patch = await graph.createPatch();
        if (item.newTitle) patch.setProperty(item.id, 'title', item.newTitle);
        if (item.newDescription) patch.setProperty(item.id, 'description', item.newDescription);
        patch.setProperty(item.id, 'triage_note', item.rationale);
        await patch.commit();
        console.log(`  REFRAMED ${item.id}`);
      }
    }
  }

  console.log('\nDone.');
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
