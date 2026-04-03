import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createPlainStylePort, ensurePlainBijouContext } from '../../../../src/infrastructure/adapters/PlainStyleAdapter.js';
import { createObservedGraphProjection } from '../../../../src/infrastructure/ObservedGraphProjection.js';
import { WarpGraphAdapter } from '../../../../src/infrastructure/adapters/WarpGraphAdapter.js';
import { RecordService } from '../../../../src/domain/services/RecordService.js';
import type { DashboardModel, CasePageRoute } from '../../../../src/tui/bijou/DashboardApp.js';
import { buildLaneTable } from '../../../../src/tui/bijou/cockpit.js';
import type { DashboardHealth, EntityDetail, GraphSnapshot } from '../../../../src/domain/models/dashboard.js';
import { emptyObserverSeenItems, emptyObserverWatermarks } from '../../../../src/tui/bijou/observer-watermarks.js';
import { casePageView } from '../../../../src/tui/bijou/views/case-page-view.js';
import { strip } from '../../../helpers/ansi.js';

ensurePlainBijouContext();

const style = createPlainStylePort();
const healthyDashboardHealth: DashboardHealth = {
  status: 'ok',
  blocking: false,
  summary: {
    issueCount: 0,
    blockingIssueCount: 0,
    readinessGaps: 0,
    governedCompletionGaps: 0,
  },
  issues: [],
};

describe('Cycle 0003: Human Case Flow', () => {
  let repoPath: string;
  let graphPort: WarpGraphAdapter;
  let records: RecordService;

  beforeEach(async () => {
    repoPath = path.join(
      os.tmpdir(),
      `xyph-acceptance-human-case-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    );
    fs.mkdirSync(repoPath, { recursive: true });
    execSync('git init', { cwd: repoPath, stdio: 'ignore' });
    execSync('git config user.email "test@xyph.dev"', { cwd: repoPath, stdio: 'ignore' });
    execSync('git config user.name "XYPH Acceptance"', { cwd: repoPath, stdio: 'ignore' });

    graphPort = new WarpGraphAdapter(repoPath, 'xyph', 'human.tester');
    records = new RecordService(graphPort);

    const graph = await graphPort.getGraph();
    await graph.patch((p) => {
      p.addNode('task:TARGET')
        .setProperty('task:TARGET', 'type', 'task')
        .setProperty('task:TARGET', 'title', 'Traceability umbrella quest')
        .setProperty('task:TARGET', 'status', 'BACKLOG')
        .setProperty('task:TARGET', 'hours', 3)
        .addNode('campaign:TRACE')
        .setProperty('campaign:TRACE', 'type', 'campaign')
        .setProperty('campaign:TRACE', 'title', 'Traceability')
        .setProperty('campaign:TRACE', 'status', 'IN_PROGRESS');
    });

    await records.createAiSuggestion({
      id: 'suggestion:AI-TRACE',
      kind: 'quest',
      title: 'Split traceability into its own quest',
      summary: 'The current quest mixes delivery and traceability hardening.',
      suggestedBy: 'agent.oracle',
      audience: 'human',
      origin: 'spontaneous',
      targetId: 'task:TARGET',
      relatedIds: ['campaign:TRACE'],
      why: 'Repeated review fallout suggests this deserves explicit governed attention.',
      evidence: 'Recent review cycles keep surfacing traceability-specific follow-up.',
      nextAction: 'Open a governed case and gather recommendation briefs before changing the frontier.',
    });

    await seedReadyCase(graphPort);
  });

  afterEach(() => {
    fs.rmSync(repoPath, { recursive: true, force: true });
  });

  it('records a human case decision, compiles linked quest work, and renders a receipt-like case page', async () => {
    const result = await records.createCaseDecision({
      caseId: 'case:TRACE-1',
      decision: 'adopt',
      decidedBy: 'human.tester',
      rationale: 'The traceability work needs a dedicated governed quest with explicit evidence links.',
      followOnKind: 'quest',
    });

    expect(result.decisionId).toMatch(/^decision:/);
    expect(result.followOnArtifactKind).toBe('quest');
    expect(result.followOnArtifactId).toMatch(/^task:/);

    const graph = await graphPort.getGraph();
    const decisionProps = await graph.getNodeProps(result.decisionId);
    expect(decisionProps).toMatchObject({
      type: 'decision',
      kind: 'adopt',
      decision_scope: 'case',
      case_id: 'case:TRACE-1',
      decided_by: 'human.tester',
      follow_on_artifact_id: result.followOnArtifactId,
      follow_on_artifact_kind: 'quest',
    });

    const graphCtx = createObservedGraphProjection(graphPort);
    const snapshot = await graphCtx.fetchSnapshot();
    const detail = await graphCtx.fetchEntityDetail('case:TRACE-1');

    expect(detail?.caseDetail).toMatchObject({
      id: 'case:TRACE-1',
      caseNode: {
        id: 'case:TRACE-1',
        status: 'decided',
        question: 'Should traceability become its own governed quest?',
      },
      subjectIds: ['task:TARGET'],
      openedFromIds: ['suggestion:AI-TRACE'],
      briefs: [
        expect.objectContaining({
          id: 'brief:TRACE-ALT',
          title: 'Alternative: keep the work inside the umbrella quest',
        }),
      ],
      decisions: [
        expect.objectContaining({
          id: result.decisionId,
          decision: 'adopt',
          followOnArtifactId: result.followOnArtifactId,
          followOnArtifactKind: 'quest',
          expectedDelta: 'Create backlog quest',
          actualDelta: `Created quest ${result.followOnArtifactId}`,
        }),
      ],
    });

    if (!detail?.caseDetail) {
      throw new Error('Expected case detail');
    }

    const rendered = renderCasePage(snapshot, detail);
    expect(rendered).toContain('TRACE-1');
    expect(rendered).toContain('brief:TRACE-ALT');
    expect(rendered).toContain(result.decisionId);
    expect(rendered).toContain('adopt');
    expect(rendered).toContain(strip(result.followOnArtifactId.replace(/^task:/, '')));
  });
});

function makeModel(snapshot: GraphSnapshot, detail: EntityDetail): DashboardModel {
  const laneState = {
    now: { focusRow: 0, inspectorScrollY: 0, railScrollY: 0 },
    plan: { focusRow: 0, inspectorScrollY: 0, railScrollY: 0 },
    review: { focusRow: 0, inspectorScrollY: 0, railScrollY: 0 },
    settlement: { focusRow: 0, inspectorScrollY: 0, railScrollY: 0 },
    suggestions: { focusRow: 0, inspectorScrollY: 0, railScrollY: 0 },
    campaigns: { focusRow: 0, inspectorScrollY: 0, railScrollY: 0 },
    graveyard: { focusRow: 0, inspectorScrollY: 0, railScrollY: 0 },
  };

  return {
    lane: 'suggestions',
    nowView: 'queue',
    suggestionsView: 'incoming',
    pageStack: [{ kind: 'case', caseId: 'case:TRACE-1', sourceLane: 'suggestions' }],
    laneState,
    scrollbars: {
      worklist: { level: 4, generation: 1 },
      inspector: { level: 4, generation: 1 },
      page: { level: 4, generation: 1 },
    },
    table: buildLaneTable(snapshot, 'suggestions', 20, 0, 'human.tester'),
    inspectorOpen: true,
    snapshot,
    health: healthyDashboardHealth,
    loading: false,
    error: null,
    showLanding: false,
    showHelp: false,
    helpScrollY: 0,
    aiExplainabilityScrollY: 0,
    cols: 120,
    rows: 40,
    logoText: 'XYPH',
    requestId: 1,
    loadingProgress: 100,
    pulsePhase: 0,
    mode: 'normal',
    confirmState: null,
    inputState: null,
    paletteState: null,
    questTreeScrollY: 0,
    drawerScrollY: 0,
    toast: null,
    writePending: false,
    drawerOpen: false,
    drawerWidth: 0,
    watching: false,
    refreshPending: false,
    agentId: 'human.tester',
    observerWatermarks: emptyObserverWatermarks(),
    observerSeenItems: emptyObserverSeenItems(),
    pageScrollY: 0,
    pageDetail: detail,
    pageLoading: false,
    pageError: null,
    pageRequestId: 1,
  };
}

function renderCasePage(snapshot: GraphSnapshot, detail: EntityDetail): string {
  if (!detail.caseDetail) {
    throw new Error('Expected case detail for case page render');
  }
  const page: CasePageRoute = {
    kind: 'case',
    caseId: 'case:TRACE-1',
    sourceLane: 'suggestions',
  };
  return strip(casePageView({
    model: makeModel(snapshot, detail),
    snapshot,
    page,
    caseDetail: detail.caseDetail,
    detail,
    sourceItem: undefined,
    style,
    width: 140,
    height: 60,
  }));
}

async function seedReadyCase(graphPort: WarpGraphAdapter): Promise<void> {
  const graph = await graphPort.getGraph();
  const now = Date.now();

  await graph.patch((p) => {
    p.addNode('case:TRACE-1')
      .setProperty('case:TRACE-1', 'type', 'case')
      .setProperty('case:TRACE-1', 'title', 'Should traceability become its own governed quest?')
      .setProperty('case:TRACE-1', 'question', 'Should traceability become its own governed quest?')
      .setProperty('case:TRACE-1', 'status', 'ready-for-judgment')
      .setProperty('case:TRACE-1', 'impact', 'frontier')
      .setProperty('case:TRACE-1', 'risk', 'reversible-high')
      .setProperty('case:TRACE-1', 'authority', 'human-decide-agent-apply')
      .setProperty('case:TRACE-1', 'opened_by', 'human.james')
      .setProperty('case:TRACE-1', 'opened_at', now)
      .setProperty('case:TRACE-1', 'decision_question', 'Should traceability become its own governed quest?')
      .setProperty('case:TRACE-1', 'reason', 'Shape-changing case awaiting human judgment.')
      .addEdge('case:TRACE-1', 'task:TARGET', 'concerns')
      .addEdge('case:TRACE-1', 'suggestion:AI-TRACE', 'opened-from')
      .addNode('brief:TRACE-ALT')
      .setProperty('brief:TRACE-ALT', 'type', 'brief')
      .setProperty('brief:TRACE-ALT', 'title', 'Alternative: keep the work inside the umbrella quest')
      .setProperty('brief:TRACE-ALT', 'brief_kind', 'alternative')
      .setProperty('brief:TRACE-ALT', 'rationale', 'Keep the work inside task:TARGET until the next review cycle proves the split is necessary.')
      .setProperty('brief:TRACE-ALT', 'authored_by', 'agent.other')
      .setProperty('brief:TRACE-ALT', 'authored_at', now - 1_000)
      .addEdge('brief:TRACE-ALT', 'case:TRACE-1', 'briefs');
    return p.attachContent(
      'brief:TRACE-ALT',
      'Do not split yet; tighten traceability requirements on the current quest instead.',
    );
  });
}
