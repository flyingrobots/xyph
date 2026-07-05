import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

function source(path: string): string {
  return readFileSync(path, 'utf8');
}

function functionBody(contents: string, name: string): string {
  let start = contents.indexOf(`private async ${name}`);
  if (start < 0) start = contents.indexOf(`export function ${name}`);
  if (start < 0) start = contents.indexOf(`function ${name}`);
  if (start < 0) start = contents.indexOf(`${name}(`);
  if (start < 0) throw new Error(`Function ${name} not found`);
  const brace = contents.indexOf('{', start);
  if (brace < 0) throw new Error(`Function ${name} has no body`);

  let depth = 0;
  for (let index = brace; index < contents.length; index += 1) {
    const char = contents[index];
    if (char === '{') depth += 1;
    if (char === '}') depth -= 1;
    if (depth === 0) return contents.slice(brace + 1, index);
  }
  throw new Error(`Function ${name} body is not closed`);
}

describe('substrate boundary', () => {
  it('routes migrated comment writes through the XYPHWriter seam', () => {
    const showCommand = source('src/cli/commands/show.ts');
    const agentActions = source('src/domain/services/AgentActionService.ts');
    const tuiWrites = source('src/tui/bijou/write-cmds.ts');

    const validateComment = functionBody(agentActions, 'validateComment');
    const intentBodies = [
      functionBody(agentActions, 'executeComment'),
      functionBody(tuiWrites, 'commentOnEntity'),
      showCommand.slice(showCommand.indexOf(".command('comment <id>')")),
    ];
    const migratedBodies = [validateComment, ...intentBodies];

    for (const body of migratedBodies) {
      expect(body).not.toContain('new RecordService');
      expect(body).not.toContain('graphPort');
      expect(body).not.toContain('getGraph');
      expect(body).not.toContain('worldline');
      expect(body).not.toContain('getNodeProps');
      expect(body).not.toContain('_content');
      expect(body).not.toContain('graph.patch');
      expect(body).not.toContain('recordCommentIntent');
    }
    for (const body of intentBodies) {
      expect(body).toContain('.write');
      expect(body).toContain('RecordComment');
    }
  });

  it('keeps TUI write commands on XYPH writings instead of graph-shaped substrate APIs', () => {
    const tuiWrites = source('src/tui/bijou/write-cmds.ts');

    expect(tuiWrites).toContain('XYPHWriter');
    expect(tuiWrites).toContain('RecordComment');
    expect(tuiWrites).toContain('RecordAiSuggestion');
    expect(tuiWrites).not.toContain('GraphPort');
    expect(tuiWrites).not.toContain('RecordService');
    expect(tuiWrites).not.toContain('getGraph');
    expect(tuiWrites).not.toContain('worldline');
    expect(tuiWrites).not.toContain('getNodeProps');
  });

  it('keeps TUI command intent execution behind the command executor port', () => {
    const tuiWrites = source('src/tui/bijou/write-cmds.ts');

    expect(tuiWrites).toContain('CommandIntentExecutorPort');
    expect(tuiWrites).not.toContain('OpticDomainActionService');
    expect(tuiWrites).not.toContain('EdictWasmTargetLowererAdapter');
    expect(tuiWrites).not.toContain('sha256:basis123');
    expect(tuiWrites).not.toContain('WasmIntentDescriptor');
    expect(tuiWrites).not.toMatch(/intentId:\s*`[^`]*\$\{Date\.now\(\)\}/);
  });

  it('keeps dashboard reading ports from exposing graph-shaped snapshots', () => {
    const dashboardReadings = source('src/readings/DashboardReadings.ts');
    const dashboardReadPort = source('src/ports/DashboardReadPort.ts');

    expect(dashboardReadings).toContain('DashboardOperationalView');
    expect(dashboardReadPort).toContain('DashboardOperationalView');
    expect(dashboardReadings).not.toContain('GraphSnapshot');
    expect(dashboardReadPort).not.toContain('GraphSnapshot');
    expect(dashboardReadPort).not.toContain('worldline');
    expect(dashboardReadPort).not.toContain('WARP');
  });

  it('does not mutate cached in-memory WARP persistence when wiring runtime blob storage', () => {
    const warpGraphAdapter = source('src/infrastructure/adapters/WarpGraphAdapter.ts');

    expect(warpGraphAdapter).toContain('Object.create(memPersistence)');
    expect(warpGraphAdapter).not.toContain('Object.assign(memPersistence');
    expect(warpGraphAdapter).not.toContain('Object.defineProperty(memPersistence');
  });

  it('keeps the dashboard app on product ports instead of substrate runtime APIs', () => {
    const dashboardApp = source('src/tui/bijou/DashboardApp.ts');

    expect(dashboardApp).toContain('XYPHReader');
    expect(dashboardApp).toContain('ReadDashboardOperationalSnapshot');
    expect(dashboardApp).toContain('ReadDashboardEntityDetail');
    expect(dashboardApp).toContain('DashboardRuntimePort');
    expect(dashboardApp).toContain('XYPHWriter');
    expect(dashboardApp).not.toContain('DashboardReadPort');
    expect(dashboardApp).not.toContain('readPort');
    expect(dashboardApp).not.toContain('GraphSnapshot');
    expect(dashboardApp).not.toContain('fetchOperationalSnapshot');
    expect(dashboardApp).not.toContain('fetchEntityDetail');
    expect(dashboardApp).not.toContain('fetchLandingNowLaneData');
    expect(dashboardApp).not.toContain('fetchLandingReviewLaneData');
    expect(dashboardApp).not.toContain('fetchLandingSuggestionLaneData');
    expect(dashboardApp).not.toContain('fetchReviewPageData');
    expect(dashboardApp).not.toContain('GraphPort');
    expect(dashboardApp).not.toContain('graphPort');
    expect(dashboardApp).not.toContain('getGraph');
    expect(dashboardApp).not.toContain('DoctorService');
    expect(dashboardApp).not.toContain('WarpRoadmapAdapter');
    expect(dashboardApp).not.toContain('syncCoverage');
    expect(dashboardApp).not.toContain('worldline');
    expect(dashboardApp).not.toContain('getNodeProps');
  });

  it('keeps the domain mutation kernel behind a causal mutation port', () => {
    const kernel = source('src/domain/services/MutationKernelService.ts');

    expect(kernel).toContain('CausalMutationPort');
    expect(kernel).not.toContain('GraphPort');
    expect(kernel).not.toContain('getGraph');
    expect(kernel).not.toContain('getMutationGraph');
    expect(kernel).not.toContain('worldline');
    expect(kernel).not.toContain('createPatchSession');
    expect(kernel).not.toContain('projectState');
  });

  it('keeps WARP admission mutation mechanics out of CLI context composition', () => {
    const cliContext = source('src/cli/context.ts');
    const body = functionBody(cliContext, 'createCliContext');

    expect(body).not.toContain('interface WarpPatchBuilder');
    expect(body).not.toContain('admitWasmIntent(descriptor');
    expect(body).not.toContain('graph.patch(');
    expect(body).not.toContain('createPatchSession');
  });
});
