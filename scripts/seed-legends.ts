/**
 * Seed the 5 XYPH legends into the WARP graph with content attachments.
 * Re-running is safe — existing nodes are updated, not duplicated.
 *
 * Usage: npx tsx scripts/seed-legends.ts
 */

import { WarpCore as WarpGraph, GitGraphAdapter } from '@git-stunts/git-warp';
import Plumbing from '@git-stunts/plumbing';
import { resolveGraphRuntime } from '../src/cli/runtimeGraph.js';

const WRITER_ID = 'human.james';

interface Legend {
  readonly id: string;
  readonly title: string;
  readonly code: string;
  readonly protects: readonly string[];
  readonly body: string;
}

const LEGENDS: readonly Legend[] = [
  {
    id: 'legend:warp',
    title: 'WARP — Substrate Boundary',
    code: 'WARP',
    protects: [
      'invariant:substrate-boundary',
      'invariant:deterministic-convergence',
      'invariant:immutable-provenance',
    ],
    body: `# WARP — Substrate Boundary

**Legend code:** WARP

## What it covers

The git-warp integration layer. Graph operations, CRDT mechanics,
patch lifecycle, materialization, sync, traversal, query, content
storage. Everything that touches git-warp's API surface.

## Invariants guarded

- [substrate-boundary](invariant:substrate-boundary) — XYPH never
  reimplements substrate mechanics owned by git-warp.
- [deterministic-convergence](invariant:deterministic-convergence) —
  admissible mutations converge independent of arrival order.
- [immutable-provenance](invariant:immutable-provenance) — every
  mutation is an attributed, immutable patch with durable provenance.

## Sponsored human

The maintainer integrating or upgrading git-warp. They care about API
stability, clean version boundaries, and confidence that XYPH delegates
graph mechanics instead of reimplementing them. When git-warp ships a
new traversal primitive, this person needs to know XYPH will adopt it
rather than grow a parallel implementation.

## Sponsored agent

The coding agent consuming graph APIs during implementation. It cares
about predictable, documented traversal and query surfaces. When the
agent needs to compute a frontier or check reachability, the answer
should always be \`graph.traverse.*\` — never "write a BFS."

## What success looks like

XYPH has zero userland graph algorithms. Every graph traversal,
query, and mutation flows through git-warp's API. Version upgrades
are clean — the boundary is explicit enough that upgrading git-warp
is a dependency bump, not a rewrite.

## How you know

- \`scripts/check-graph-algorithms.sh\` returns zero hits on every CI run.
- \`grep -r 'queue.shift\\|stack.pop\\|visited.add\\|inDegree' src/\` finds
  nothing.
- git-warp version in package.json tracks latest stable within one minor.
- No XYPH code imports graph-walking utilities from outside git-warp.
`,
  },
  {
    id: 'legend:gov',
    title: 'GOV — Governance and Authority',
    code: 'GOV',
    protects: [
      'invariant:authorized-intent',
      'invariant:policy-is-plastic',
      'invariant:principal-general-authority',
    ],
    body: `# GOV — Governance and Authority

**Legend code:** GOV

## What it covers

The authority model, policy engine, and intent lineage system.
Capability grants, principal resolution, approval gates, Guild Seals,
sovereignty audits, policy nodes, and the distinction between policy
(plastic) and invariants (permanent).

## Invariants guarded

- [authorized-intent](invariant:authorized-intent) — governed work
  requires intent lineage traceable to an authorized principal.
- [policy-is-plastic](invariant:policy-is-plastic) — policy is
  programmable, but policy changes are themselves governed.
- [principal-general-authority](invariant:principal-general-authority) —
  authority flows from policy and explicit grants, not species.

## Sponsored human

The project lead defining authority structure and policy. They care
that governance is explicit — no silent constitution edits, no
species-based authority shortcuts, no orphan work that bypasses intent
lineage. When policy needs to change, this person needs a governed,
attributable, versioned process to make that change.

## Sponsored agent

The autonomous agent requesting capability grants and exercising
authority. It cares that its permissions are real, not decorative. When
an agent principal has been granted review authority, it should be able
to review — not hit a hidden \`human.*\` gate. When it lacks a grant, the
refusal should be explicit and inspectable, not a cryptic error.

## What success looks like

Every governed quest traces to an authorized principal. Policy changes
produce patches with attribution. No authority check inspects species
(\`human.*\` vs \`agent.*\`). The capability model is principal-general:
what you can do depends on who you are and what you have been granted.

## How you know

- \`xyph audit-sovereignty\` reports zero violations.
- \`grep -rn 'human\\.' src/ | grep -v test | grep -v fixture\` shows
  zero species-based authority checks in production code.
- Policy nodes exist in the graph with patch-level provenance.
- Guild Seals verify patch integrity for any principal type.
`,
  },
  {
    id: 'legend:surf',
    title: 'SURF — Surfaces',
    code: 'SURF',
    protects: [
      'invariant:principal-general-authority',
      'invariant:graph-is-truth',
    ],
    body: `# SURF — Surfaces

**Legend code:** SURF

## What it covers

Agent CLI and human TUI as co-equal interfaces to the graph.
Agent-facing: briefing, next, context, act, handoff, \`--json\` output.
Human-facing: TUI dashboard, interactive wizards, styled terminal
output. Shared: \`xyph show\`, \`xyph status\`, entity detail projections.

## Invariants guarded

- [principal-general-authority](invariant:principal-general-authority) —
  interfaces are capability-complete for each principal type.
- [graph-is-truth](invariant:graph-is-truth) — surfaces render
  authoritative graph state, not cached or stale projections.

## Sponsored human

The operator using the TUI for status, triage, and oversight. They care
about honest, legible rendering of graph state. When they open the
dashboard, the data must reflect current truth — not a stale snapshot
from three cycles ago. When they press a key, the action must be
governed and attributable, same as any CLI command.

## Sponsored agent

The coding agent consuming structured CLI and API output. It cares
about \`--json\` contracts, inspectable command surfaces, and
capability-complete operations. When the agent calls \`xyph briefing\`,
it needs a structured packet it can reason over — not styled terminal
prose. Every operation available in the TUI must be reachable through
the agent surface.

## What success looks like

Both agent and human can see the same graph truth through interfaces
designed for their respective strengths. Agents get structured JSON.
Humans get rendered, navigable TUI views. Neither is a second-class
afterthought. New features land with both surfaces, not one-then-maybe.

## How you know

- Every actuator command supports \`--json\` with a structured envelope.
- Every TUI action maps to a CLI command (no TUI-only mutations).
- Agent commands (briefing, next, context, act, handoff) return
  structured data, not styled strings.
- Dashboard views use observer-backed read models, not stale snapshots.
`,
  },
  {
    id: 'legend:prov',
    title: 'PROV — Provenance and Traceability',
    code: 'PROV',
    protects: [
      'invariant:witness-before-done',
      'invariant:graph-is-truth',
    ],
    body: `# PROV — Provenance and Traceability

**Legend code:** PROV

## What it covers

Stories, requirements, criteria, evidence, witnesses, design docs,
retros, and the full chain from intent to proof. Traceability scans,
coverage analysis, playback questions, and the structural guarantee
that done-claims are backed by reproducible artifacts.

## Invariants guarded

- [witness-before-done](invariant:witness-before-done) — done-claims
  require reproducible witness across human and agent lenses.
- [graph-is-truth](invariant:graph-is-truth) — traceability artifacts
  live in the graph as content-attached nodes, not branch-local files.

## Sponsored human

The reviewer validating that done means done. They care about
reproducible witnesses, coverage gaps, and the difference between
"someone said it's done" and "here is the proof." When a cycle closes,
this person needs to see playback answers backed by real artifacts —
test output, transcripts, verification commands — not a summary that
asserts success without evidence.

## Sponsored agent

The agent producing structured evidence artifacts. It cares about
clear evidence contracts and rerunnable verification. When the agent
writes a witness, the format must be deterministic and the content
must be reproducible. When coverage analysis runs, the agent needs
structured output it can reason over to identify gaps.

## What success looks like

No meaningful workflow claim is complete without a witness. Every
sealed quest has evidence. Both sponsor perspectives are represented
in every playback. Design docs and retros live in the graph where they
are visible from any branch, not buried in a feature branch that might
never merge.

## How you know

- Sealed quests have at least one \`evidence:*\` node with content.
- \`xyph status --view trace\` shows coverage stats with zero
  unwitnessed done-claims.
- Design docs are \`design:*\` graph nodes, not filesystem files.
- Retros are \`retro:*\` graph nodes with content attachments.
`,
  },
  {
    id: 'legend:flow',
    title: 'FLOW — Workflow Pipeline',
    code: 'FLOW',
    protects: [
      'invariant:policy-is-plastic',
      'invariant:frontier-not-assignment',
    ],
    body: `# FLOW — Workflow Pipeline

**Legend code:** FLOW

## What it covers

The programmable cycle pipeline: intake, triage, backlog lanes, cycle
pull, design, red/green, playback, retro, close, settlement. Frontier
computation, dependency DAG, bearings, and the full
pull\u2192design\u2192red\u2192green\u2192playback\u2192close loop.

## Invariants guarded

- [policy-is-plastic](invariant:policy-is-plastic) — the workflow
  pipeline is programmable by authorized principals.
- [frontier-not-assignment](invariant:frontier-not-assignment) — the
  frontier exposes lawful next work; assignment must be explicit.

## Sponsored human

The practitioner choosing what to work on next. They care about calm
process — no busywork, no prescribed order, no meetings-as-governance.
The frontier should be a menu of available tasks derived from the
dependency DAG. The cycle should be a natural rhythm of
design\u2192build\u2192prove\u2192reflect, not a bureaucratic gate.

## Sponsored agent

The agent navigating the cycle pipeline autonomously. It cares about
inspectable state and programmatic pipeline steps. When the agent calls
\`xyph next\`, it needs a clear frontier. When a cycle closes, the retro
structure must be machine-writable. The pipeline steps themselves should
be queryable graph state, not hardcoded sequences buried in source.

## What success looks like

Work flows through a calm, legible pipeline. The frontier tells you
what is available. Cycles give work a natural shape: design it, test it,
build it, prove it, reflect on it. The pipeline itself is graph state
that authorized principals can reshape — add steps, remove steps,
resequence — without touching source code.

## How you know

- \`xyph next\` returns frontier tasks derived from dependency DAG.
- Active cycles are discoverable via \`xyph status\`.
- Cycle close requires a retro. No silent completion.
- Workflow steps are expressed as policy nodes, not hardcoded logic.
- Bearings are updated at cycle boundaries, capturing direction and
  felt tensions.
`,
  },
];

async function main(): Promise<void> {
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

  for (const legend of LEGENDS) {
    const exists = await graph.hasNode(legend.id);

    if (exists) {
      const patch = await graph.createPatch();
      await patch.attachContent(legend.id, legend.body);
      patch.setProperty(legend.id, 'title', legend.title);
      patch.setProperty(legend.id, 'code', legend.code);
      patch.setProperty(legend.id, 'updated_at', Date.now());
      const sha = await patch.commit();
      console.log(`UPDATED ${legend.id} (${sha.slice(0, 8)})`);
    } else {
      const patch = await graph.createPatch();
      patch.addNode(legend.id);
      patch.setProperty(legend.id, 'title', legend.title);
      patch.setProperty(legend.id, 'type', 'legend');
      patch.setProperty(legend.id, 'code', legend.code);
      patch.setProperty(legend.id, 'created_at', Date.now());
      patch.setProperty(legend.id, 'created_by', WRITER_ID);
      await patch.attachContent(legend.id, legend.body);
      const sha = await patch.commit();
      console.log(`ADDED   ${legend.id} (${sha.slice(0, 8)})`);
    }

    // Wire protects edges
    for (const inv of legend.protects) {
      const hasInv = await graph.hasNode(inv);
      if (!hasInv) {
        console.log(`  WARN  ${inv} not found — skipping edge`);
        continue;
      }
      // Check if edge already exists via neighbors
      const neighbors = await graph.neighbors(legend.id, 'outgoing');
      const entries = neighbors as { label: string; nodeId: string }[];
      const alreadyLinked = entries.some(
        (e) => e.label === 'protects' && e.nodeId === inv,
      );
      if (alreadyLinked) {
        console.log(`  SKIP  ${legend.id} --protects--> ${inv} (exists)`);
      } else {
        const edgePatch = await graph.createPatch();
        edgePatch.addEdge(legend.id, inv, 'protects');
        const edgeSha = await edgePatch.commit();
        console.log(`  EDGE  ${legend.id} --protects--> ${inv} (${edgeSha.slice(0, 8)})`);
      }
    }
  }

  console.log('\nDone. 5 legends committed to graph with protects edges.');
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
