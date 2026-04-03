import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Command } from 'commander';
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { CliContext } from '../../../../src/cli/context.js';
import { registerSuggestionCommands } from '../../../../src/cli/commands/suggestions.js';
import { RecordService } from '../../../../src/domain/services/RecordService.js';
import { createObservedGraphProjection } from '../../../../src/infrastructure/ObservedGraphProjection.js';
import { WarpGraphAdapter } from '../../../../src/infrastructure/adapters/WarpGraphAdapter.js';
import { createPlainStylePort, ensurePlainBijouContext } from '../../../../src/infrastructure/adapters/PlainStyleAdapter.js';
import type { DashboardModel, SuggestionPageRoute } from '../../../../src/tui/bijou/DashboardApp.js';
import { buildLaneTable } from '../../../../src/tui/bijou/cockpit.js';
import { emptyObserverSeenItems, emptyObserverWatermarks } from '../../../../src/tui/bijou/observer-watermarks.js';
import { suggestionPageView } from '../../../../src/tui/bijou/views/suggestion-page-view.js';
import type { GraphSnapshot } from '../../../../src/domain/models/dashboard.js';
import { strip } from '../../../helpers/ansi.js';

ensurePlainBijouContext();

describe('Cycle 0001: Suggestion Adoption and Explainability', () => {
  let repoPath: string;
  let graphPort: WarpGraphAdapter;
  let records: RecordService;

  beforeEach(async () => {
    repoPath = path.join(os.tmpdir(), `xyph-acceptance-suggestions-${Date.now()}-${Math.random().toString(16).slice(2)}`);
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
        .setProperty('task:TARGET', 'title', 'Target Quest')
        .setProperty('task:TARGET', 'status', 'BACKLOG')
        .setProperty('task:TARGET', 'hours', 2)
        .addNode('campaign:TRACE')
        .setProperty('campaign:TRACE', 'type', 'campaign')
        .setProperty('campaign:TRACE', 'title', 'Traceability')
        .setProperty('campaign:TRACE', 'status', 'IN_PROGRESS');
    });
  });

  afterEach(() => {
    fs.rmSync(repoPath, { recursive: true, force: true });
  });

  it('adopts a quest suggestion into a backlog quest with visible provenance', async () => {
    await records.createAiSuggestion({
      id: 'suggestion:AI-QUEST',
      kind: 'quest',
      title: 'Create a traceability quest',
      summary: 'Open a dedicated quest to cover missing traceability work.',
      suggestedBy: 'agent.prime',
      audience: 'human',
      origin: 'spontaneous',
      targetId: 'task:TARGET',
      relatedIds: ['campaign:TRACE'],
      why: 'The current quest is too broad to safely absorb this work.',
      evidence: 'Recent review activity keeps uncovering missing traceability links.',
      nextAction: 'Adopt the suggestion into governed work and triage the resulting artifact.',
    });

    const ctx = makeCliContext(graphPort, repoPath);
    const program = new Command();
    registerSuggestionCommands(program, ctx);

    await program.parseAsync([
      'suggestion',
      'accept',
      'suggestion:AI-QUEST',
      '--rationale',
      'Worth triaging as governed work.',
    ], { from: 'user' });

    expect(ctx.jsonOut).toHaveBeenCalledWith(expect.objectContaining({
      success: true,
      command: 'suggestion accept',
      data: expect.objectContaining({
        suggestionId: 'suggestion:AI-QUEST',
        adoptedArtifactKind: 'quest',
        targetId: 'task:TARGET',
        rationale: 'Worth triaging as governed work.',
      }),
    }));

    const graphCtx = createObservedGraphProjection(graphPort);
    const snapshot = await graphCtx.fetchSnapshot();
    const suggestion = snapshot.aiSuggestions.find((entry) => entry.id === 'suggestion:AI-QUEST');
    expect(suggestion).toMatchObject({
      status: 'accepted',
      resolutionKind: 'adopted',
      resolutionRationale: 'Worth triaging as governed work.',
      targetId: 'task:TARGET',
      adoptedArtifactKind: 'quest',
    });
    expect(suggestion?.adoptedArtifactId).toMatch(/^task:/);

    const adoptedQuestId = suggestion?.adoptedArtifactId;
    expect(adoptedQuestId).toBeDefined();
    if (!adoptedQuestId) {
      throw new Error('expected adopted artifact id');
    }

    const graph = await graphPort.getGraph();
    const questProps = await graph.getNodeProps(adoptedQuestId);
    expect(questProps).toMatchObject({
      type: 'task',
      title: 'Create a traceability quest',
      status: 'BACKLOG',
      hours: 0,
      task_kind: 'delivery',
    });
    expect(typeof questProps?.['description']).toBe('string');
    expect(String(questProps?.['description'])).toContain('Open a dedicated quest to cover missing traceability work.');

    const detail = await graphCtx.fetchEntityDetail('suggestion:AI-QUEST');
    expect(detail?.outgoing).toEqual(expect.arrayContaining([
      { nodeId: adoptedQuestId, label: 'suggests' },
    ]));

    const rendered = renderSuggestionPage(snapshot, suggestion, detail, 'adopted');
    expect(rendered).toContain('Suggestions [AI]');
    expect(rendered).toContain('AI Transparency');
    expect(rendered).toContain('Adopted as');
    expect(rendered).toContain('quest');
    expect(rendered).toContain(strip(adoptedQuestId.replace(/^task:/, '')));
  });

  it('adopts a non-quest AI suggestion into a governed proposal artifact when requested explicitly', async () => {
    await records.createAiSuggestion({
      id: 'suggestion:AI-DEP',
      kind: 'dependency',
      title: 'Narrow traceability dependency',
      summary: 'Record a dependency follow-up instead of silently coupling the work.',
      suggestedBy: 'agent.prime',
      audience: 'human',
      origin: 'spontaneous',
      targetId: 'task:TARGET',
      relatedIds: ['campaign:TRACE'],
      why: 'The current quest needs an explicit dependency recommendation.',
      evidence: 'Recent review activity found hidden ordering assumptions.',
      nextAction: 'Adopt as governed work so a human can decide whether the dependency should become plan truth.',
    });

    const ctx = makeCliContext(graphPort, repoPath);
    const program = new Command();
    registerSuggestionCommands(program, ctx);

    await program.parseAsync([
      'suggestion',
      'accept',
      'suggestion:AI-DEP',
      '--as',
      'proposal',
      '--rationale',
      'Needs a governed dependency proposal first.',
    ], { from: 'user' });

    expect(ctx.jsonOut).toHaveBeenCalledWith(expect.objectContaining({
      success: true,
      command: 'suggestion accept',
      data: expect.objectContaining({
        suggestionId: 'suggestion:AI-DEP',
        adoptedArtifactKind: 'proposal',
        targetId: 'task:TARGET',
        rationale: 'Needs a governed dependency proposal first.',
      }),
    }));

    const graphCtx = createObservedGraphProjection(graphPort);
    const snapshot = await graphCtx.fetchSnapshot();
    const suggestion = snapshot.aiSuggestions.find((entry) => entry.id === 'suggestion:AI-DEP');
    expect(suggestion).toMatchObject({
      status: 'accepted',
      resolutionKind: 'adopted',
      resolutionRationale: 'Needs a governed dependency proposal first.',
      targetId: 'task:TARGET',
      adoptedArtifactKind: 'proposal',
    });
    expect(suggestion?.adoptedArtifactId).toMatch(/^proposal:/);

    const proposalId = suggestion?.adoptedArtifactId;
    expect(proposalId).toBeDefined();
    if (!proposalId) {
      throw new Error('expected adopted proposal id');
    }

    const graph = await graphPort.getGraph();
    const proposalProps = await graph.getNodeProps(proposalId);
    expect(proposalProps).toMatchObject({
      type: 'proposal',
      proposal_kind: 'ai-suggestion-adoption',
      subject_id: 'suggestion:AI-DEP',
      target_id: 'task:TARGET',
      proposed_by: 'human.tester',
    });

    const detail = await graphCtx.fetchEntityDetail('suggestion:AI-DEP');
    expect(detail?.incoming).toEqual(expect.arrayContaining([
      { nodeId: proposalId, label: 'proposes' },
    ]));

    const rendered = renderSuggestionPage(snapshot, suggestion, detail, 'adopted');
    expect(rendered).toContain('Adopted as');
    expect(rendered).toContain('proposal');
    expect(rendered).toContain(strip(proposalId.replace(/^proposal:/, '')));
  });

  it('dismisses an AI suggestion with rationale while keeping it explorable as a suggestion artifact', async () => {
    await records.createAiSuggestion({
      id: 'suggestion:AI-DISMISS',
      kind: 'general',
      title: 'Skip this idea',
      summary: 'This idea should not enter the active work graph.',
      suggestedBy: 'agent.prime',
      audience: 'human',
      origin: 'spontaneous',
      targetId: 'task:TARGET',
      relatedIds: [],
      why: 'Testing dismissal.',
    });

    const ctx = makeCliContext(graphPort, repoPath);
    const program = new Command();
    registerSuggestionCommands(program, ctx);

    await program.parseAsync([
      'suggestion',
      'dismiss',
      'suggestion:AI-DISMISS',
      '--rationale',
      'Out of scope for the current cycle.',
    ], { from: 'user' });

    expect(ctx.jsonOut).toHaveBeenCalledWith(expect.objectContaining({
      success: true,
      command: 'suggestion dismiss',
      data: expect.objectContaining({
        suggestionId: 'suggestion:AI-DISMISS',
        status: 'rejected',
        resolutionKind: 'dismissed',
        rationale: 'Out of scope for the current cycle.',
      }),
    }));

    const graphCtx = createObservedGraphProjection(graphPort);
    const snapshot = await graphCtx.fetchSnapshot();
    const suggestion = snapshot.aiSuggestions.find((entry) => entry.id === 'suggestion:AI-DISMISS');
    expect(suggestion).toMatchObject({
      status: 'rejected',
      resolutionKind: 'dismissed',
      resolutionRationale: 'Out of scope for the current cycle.',
    });

    const detail = await graphCtx.fetchEntityDetail('suggestion:AI-DISMISS');
    expect(detail?.type).toBe('ai_suggestion');
    expect(detail?.props['resolution_kind']).toBe('dismissed');
    expect(detail?.props['resolution_rationale']).toBe('Out of scope for the current cycle.');
  });

  it('marks an AI suggestion superseded by a replacement artifact with visible lineage', async () => {
    await records.createAiSuggestion({
      id: 'suggestion:AI-OLD',
      kind: 'dependency',
      title: 'Old dependency recommendation',
      summary: 'Recommend a dependency that is now too broad.',
      suggestedBy: 'agent.prime',
      audience: 'human',
      origin: 'spontaneous',
      targetId: 'task:TARGET',
      relatedIds: ['campaign:TRACE'],
      why: 'Original broad recommendation.',
    });

    const replacement = await records.createProposal({
      id: 'proposal:AI-REPLACEMENT',
      kind: 'dependency-refinement',
      subjectId: 'task:TARGET',
      rationale: 'Narrower follow-up proposal that replaces the old suggestion.',
      proposedBy: 'human.tester',
      observerProfileId: 'observer:default',
      policyPackVersion: 'policy:default',
    });
    expect(replacement.id).toBe('proposal:AI-REPLACEMENT');

    const ctx = makeCliContext(graphPort, repoPath);
    const program = new Command();
    registerSuggestionCommands(program, ctx);

    await program.parseAsync([
      'suggestion',
      'supersede',
      'suggestion:AI-OLD',
      '--by',
      'proposal:AI-REPLACEMENT',
      '--rationale',
      'Superseded by the narrower dependency proposal.',
    ], { from: 'user' });

    expect(ctx.jsonOut).toHaveBeenCalledWith(expect.objectContaining({
      success: true,
      command: 'suggestion supersede',
      data: expect.objectContaining({
        suggestionId: 'suggestion:AI-OLD',
        status: 'rejected',
        resolutionKind: 'superseded',
        supersededById: 'proposal:AI-REPLACEMENT',
      }),
    }));

    const graphCtx = createObservedGraphProjection(graphPort);
    const snapshot = await graphCtx.fetchSnapshot();
    const suggestion = snapshot.aiSuggestions.find((entry) => entry.id === 'suggestion:AI-OLD');
    expect(suggestion).toMatchObject({
      status: 'rejected',
      resolutionKind: 'superseded',
      supersededById: 'proposal:AI-REPLACEMENT',
      resolutionRationale: 'Superseded by the narrower dependency proposal.',
    });

    const detail = await graphCtx.fetchEntityDetail('suggestion:AI-OLD');
    expect(detail?.incoming).toEqual(expect.arrayContaining([
      { nodeId: 'proposal:AI-REPLACEMENT', label: 'supersedes' },
    ]));

    const rendered = renderSuggestionPage(snapshot, suggestion, detail, 'dismissed');
    expect(rendered).toContain('Superseded by');
    expect(rendered).toContain('AI-REPLACEMENT');
    expect(rendered).toContain('Superseded');
  });
});

function makeCliContext(graphPort: WarpGraphAdapter, repoPath: string): CliContext {
  return {
    agentId: 'human.tester',
    cwd: repoPath,
    repoPath,
    graphName: 'xyph',
    identity: { agentId: 'human.tester', source: 'default', origin: null },
    json: true,
    graphPort,
    style: createPlainStylePort(),
    ok: vi.fn(),
    warn: vi.fn(),
    muted: vi.fn(),
    print: vi.fn(),
    fail: vi.fn((msg: string) => {
      throw new Error(msg);
    }),
    failWithData: vi.fn((msg: string) => {
      throw new Error(msg);
    }),
    jsonEvent: vi.fn(),
    jsonStart: vi.fn(),
    jsonProgress: vi.fn(),
    jsonOut: vi.fn(() => undefined) as CliContext['jsonOut'],
  } as CliContext;
}

function renderSuggestionPage(
  snapshot: GraphSnapshot,
  suggestion: NonNullable<GraphSnapshot['aiSuggestions'][number]> | undefined,
  detail: Awaited<ReturnType<ReturnType<typeof createObservedGraphProjection>['fetchEntityDetail']>>,
  suggestionsView: DashboardModel['suggestionsView'],
): string {
  if (!suggestion) {
    throw new Error('expected suggestion to be present in snapshot');
  }

  const model: DashboardModel = {
    lane: 'suggestions',
    nowView: 'queue',
    suggestionsView,
    pageStack: [{ kind: 'landing' }, { kind: 'suggestion', suggestionId: suggestion.id, sourceLane: 'suggestions' }],
    laneState: {
      now: { focusRow: 0, inspectorScrollY: 0, railScrollY: 0 },
      plan: { focusRow: 0, inspectorScrollY: 0, railScrollY: 0 },
      review: { focusRow: 0, inspectorScrollY: 0, railScrollY: 0 },
      settlement: { focusRow: 0, inspectorScrollY: 0, railScrollY: 0 },
      suggestions: { focusRow: 0, inspectorScrollY: 0, railScrollY: 0 },
      campaigns: { focusRow: 0, inspectorScrollY: 0, railScrollY: 0 },
      graveyard: { focusRow: 0, inspectorScrollY: 0, railScrollY: 0 },
    },
    scrollbars: {
      worklist: { level: 0, generation: 0 },
      inspector: { level: 0, generation: 0 },
      page: { level: 0, generation: 0 },
    },
    table: buildLaneTable(snapshot, 'suggestions', 16, 0, 'human.tester'),
    inspectorOpen: true,
    snapshot,
    loading: false,
    error: null,
    showLanding: false,
    showHelp: false,
    helpScrollY: 0,
    cols: 120,
    rows: 60,
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

  const page: SuggestionPageRoute = {
    kind: 'suggestion',
    suggestionId: suggestion.id,
    sourceLane: 'suggestions',
  };

  return strip(suggestionPageView({
    model,
    snapshot,
    page,
    suggestion,
    detail,
    sourceItem: undefined,
    style: createPlainStylePort(),
    width: 120,
    height: 60,
  }));
}
