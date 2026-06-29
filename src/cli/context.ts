import { createStylePort } from '../infrastructure/adapters/BijouStyleAdapter.js';
import { createPlainStylePort } from '../infrastructure/adapters/PlainStyleAdapter.js';
import type { StylePort } from '../ports/StylePort.js';
import { WarpGraphAdapter } from '../infrastructure/adapters/WarpGraphAdapter.js';
import { WarpObservationAdapter } from '../infrastructure/adapters/WarpObservationAdapter.js';
import { WarpOperationalReadAdapter } from '../infrastructure/adapters/WarpOperationalReadAdapter.js';
import { WarpSubstrateInspectionAdapter } from '../infrastructure/adapters/WarpSubstrateInspectionAdapter.js';
import { WarpQuestReadAdapter } from '../infrastructure/warp/optics/WarpQuestReadAdapter.js';
import type { QuestReadPort } from '../ports/QuestReadPort.js';
import { resolveIdentity, type ResolvedIdentity } from './identity.js';
import type { Diagnostic } from '../domain/models/diagnostics.js';
import type { DiagnosticLogPort } from '../ports/DiagnosticLogPort.js';
import type { ObservationPort } from '../ports/ObservationPort.js';
import type { OperationalReadPort } from '../ports/OperationalReadPort.js';
import type { SubstrateInspectionPort } from '../ports/SubstrateInspectionPort.js';
import type { WarpRoadmapAdapter } from '../infrastructure/adapters/WarpRoadmapAdapter.js';
import type { DoctorService } from '../domain/services/DoctorService.js';
import type { AgentActionService } from '../domain/services/AgentActionService.js';
import type { AgentContextService } from '../domain/services/AgentContextService.js';
import type { AgentBriefingService } from '../domain/services/AgentBriefingService.js';
import type { AgentSubmissionService } from '../domain/services/AgentSubmissionService.js';
import type { ConfigPort } from '../ports/ConfigPort.js';
import { OpticDomainActionService } from '../domain/services/OpticDomainActionService.js';
import { EdictWasmTargetLowererAdapter } from '../infrastructure/adapters/EdictWasmTargetLowererAdapter.js';

export { DEFAULT_AGENT_ID } from './identity.js';

export interface JsonEnvelope {
  success: true;
  command: string;
  data: Record<string, unknown>;
  diagnostics?: Diagnostic[];
}

export interface JsonStreamEvent {
  /** Non-terminal JSONL record emitted before the final success/error record. */
  event: 'start' | 'progress';
  command: string;
  at: number;
  message?: string;
  data?: Record<string, unknown>;
}

export interface JsonErrorEnvelope {
  success: false;
  error: string;
  data?: Record<string, unknown>;
  diagnostics?: Diagnostic[];
}

export type JsonOutput = JsonStreamEvent | JsonEnvelope | JsonErrorEnvelope;

const noopLogger: DiagnosticLogPort = {
  debug(_message: string, _context?: Record<string, unknown>): void {
    return undefined;
  },
  info(_message: string, _context?: Record<string, unknown>): void {
    return undefined;
  },
  warn(_message: string, _context?: Record<string, unknown>): void {
    return undefined;
  },
  error(_message: string, _context?: Record<string, unknown>): void {
    return undefined;
  },
  child(_context: Record<string, unknown>): DiagnosticLogPort {
    return noopLogger;
  },
};

export interface CliContext {
  readonly agentId: string;
  readonly cwd: string;
  readonly repoPath: string;
  readonly graphName: string;
  readonly identity: ResolvedIdentity;
  readonly json: boolean;
  readonly graphPort: WarpGraphAdapter;
  readonly observation: ObservationPort;
  readonly operationalRead: OperationalReadPort;
  readonly questReadPort: QuestReadPort;
  readonly inspection: SubstrateInspectionPort;
  readonly logger: DiagnosticLogPort;
  readonly style: StylePort;
  readonly roadmap?: WarpRoadmapAdapter;
  readonly doctorService?: DoctorService;
  readonly agentActionService?: AgentActionService;
  readonly agentContextService?: AgentContextService;
  readonly agentBriefingService?: AgentBriefingService;
  readonly agentSubmissionService?: AgentSubmissionService;
  readonly configService?: ConfigPort;
  readonly sovereigntyService?: import('../domain/services/SovereigntyService.js').SovereigntyService;
  readonly readinessService?: import('../domain/services/ReadinessService.js').ReadinessService;
  readonly intakeAdapter?: import('../infrastructure/adapters/WarpIntakeAdapter.js').WarpIntakeAdapter;
  readonly recordService?: import('../domain/services/RecordService.js').RecordService;
  readonly guildSealService?: import('../domain/services/GuildSealService.js').GuildSealService;
  readonly submissionAdapter?: import('../infrastructure/adapters/WarpSubmissionAdapter.js').WarpSubmissionAdapter;
  readonly submissionService?: import('../domain/services/SubmissionService.js').SubmissionService;
  readonly gitWorkspace?: import('../infrastructure/adapters/GitWorkspaceAdapter.js').GitWorkspaceAdapter;
  readonly keyring?: import('../infrastructure/adapters/FsKeyringAdapter.js').FsKeyringAdapter;
  readonly mutations?: import('../domain/services/MutationKernelService.js').MutationKernelService;
  readonly createPatchSession?: typeof import('../infrastructure/helpers/createPatchSession.js').createPatchSession;
  readonly bijou?: {
    filter?: typeof import('@flyingrobots/bijou').filter;
    select?: typeof import('@flyingrobots/bijou').select;
    textarea?: typeof import('@flyingrobots/bijou').textarea;
    confirm?: typeof import('@flyingrobots/bijou').confirm;
    input?: typeof import('@flyingrobots/bijou').input;
  };
  readonly globSync?: typeof import('node:fs').globSync;
  readonly readFile?: typeof import('node:fs/promises').readFile;
  readonly parseTestFile?: typeof import('../infrastructure/adapters/TsCompilerTestParserAdapter.js').parseTestFile;
  readonly analyzeTestTargetPairs?: typeof import('../domain/services/analysis/AnalysisOrchestrator.js').analyzeTestTargetPairs;
  readonly scoreFileName?: typeof import('../domain/services/analysis/layers/FileNameLayer.js').scoreFileName;
  readonly scoreImportDescribe?: typeof import('../domain/services/analysis/layers/ImportDescribeLayer.js').scoreImportDescribe;
  readonly scoreAst?: typeof import('../domain/services/analysis/layers/AstLayer.js').scoreAst;
  readonly scoreSemantic?: typeof import('../domain/services/analysis/layers/SemanticLayer.js').scoreSemantic;
  readonly opticDomainActionService?: OpticDomainActionService;
  ok(msg: string): void;
  warn(msg: string): void;
  muted(msg: string): void;
  print(msg: string): void;
  fail(msg: string): never;
  /**
   * Fail with structured data. In JSON mode this emits the terminal JSONL
   * error record; in non-JSON mode only `msg` is printed to stderr.
   */
  failWithData(msg: string, data: Record<string, unknown>, diagnostics?: Diagnostic[]): never;
  jsonEvent(event: JsonStreamEvent): void;
  jsonStart(command: string, data?: Record<string, unknown>): void;
  jsonProgress(command: string, message: string, data?: Record<string, unknown>): void;
  jsonOut(envelope: JsonEnvelope): void;
}

export function createCliContext(
  cwd: string,
  repoPath: string,
  graphName: string,
  opts?: {
    json?: boolean;
    as?: string;
    env?: NodeJS.ProcessEnv;
    homeDir?: string;
    identity?: ResolvedIdentity;
    logger?: DiagnosticLogPort;
    opticDomainActionService?: OpticDomainActionService;
  },
): CliContext {
  const identity = opts?.identity ?? resolveIdentity({
    cwd,
    cliOverride: opts?.as,
    env: opts?.env,
    homeDir: opts?.homeDir,
  });
  const agentId = identity.agentId;
  const graphPort = new WarpGraphAdapter(repoPath, graphName, agentId, opts?.logger);
  const observation = new WarpObservationAdapter(graphPort);
  const operationalRead = new WarpOperationalReadAdapter(graphPort);
  const questReadPort = new WarpQuestReadAdapter(graphPort, {
    accessorId: agentId,
    role: agentId.startsWith('human.') ? 'human' : 'agent',
  });
  const inspection = new WarpSubstrateInspectionAdapter(graphPort);
  const jsonMode = opts?.json ?? false;
  const style = jsonMode ? createPlainStylePort() : createStylePort();

  interface WarpPatchBuilder {
    addNode(id: string): WarpPatchBuilder;
    setProperty(id: string, key: string, value: unknown): WarpPatchBuilder;
    addEdge(from: string, to: string, rel: string): WarpPatchBuilder;
    removeEdge(from: string, to: string, rel: string): WarpPatchBuilder;
  }

  interface WasmIntentDescriptor {
    intentId: string;
    suffixTransform?: {
      op?: string;
      payload?: Record<string, unknown>;
    };
  }

  interface WasmVerifierReport {
    verified?: boolean;
  }

  const opticDomainActionService = opts?.opticDomainActionService ?? new OpticDomainActionService(
    new EdictWasmTargetLowererAdapter(),
    {
      async admitWasmIntent(descriptor: unknown, report: unknown): Promise<import('../domain/services/OpticDomainActionService.js').OpticActionOutcome> {
        const desc = descriptor as WasmIntentDescriptor;
        const rep = report as WasmVerifierReport;
        if (!rep.verified) {
          return {
            admitted: false,
            obstruction: { tag: 'UntrustedWasmVerifierReport', actual: 'invalid' },
            intentId: desc.intentId,
          };
        }
        const graph = await graphPort.getGraph();
        let sha = '';
        const op = desc.suffixTransform?.op;
        const payload = desc.suffixTransform?.payload ?? {};
        if (op === 'move' || op === 'authorize' || op === 'link') {
          const quest = payload['quest'] as string;
          const campaignId = payload['campaignId'] as string | undefined;
          const intentId = payload['intentId'] as string | undefined;
          const existingCampaignEdges = payload['existingCampaignEdges'] as { nodeId: string }[] | undefined;
          const existingIntentEdges = payload['existingIntentEdges'] as { nodeId: string }[] | undefined;
          sha = await graph.patch((p: WarpPatchBuilder) => {
            if (campaignId !== undefined) {
              for (const old of existingCampaignEdges ?? []) {
                p.removeEdge(quest, old.nodeId, 'belongs-to');
              }
              p.addEdge(quest, campaignId, 'belongs-to');
            }
            if (intentId !== undefined) {
              for (const old of existingIntentEdges ?? []) {
                p.removeEdge(quest, old.nodeId, 'authorized-by');
              }
              p.addEdge(quest, intentId, 'authorized-by');
            }
          });
        } else if (op === 'claimQuest') {
          const questId = payload['questId'] as string;
          const agent = payload['agentId'] as string;
          sha = await graph.patch((p: WarpPatchBuilder) => {
            p.setProperty(questId, 'assigned_to', agent)
              .setProperty(questId, 'status', 'IN_PROGRESS')
              .setProperty(questId, 'claimed_at', Date.now());
          });
        } else if (op === 'story') {
          const id = payload['id'] as string;
          const title = payload['title'] as string;
          const persona = payload['persona'] as string;
          const goal = payload['goal'] as string;
          const benefit = payload['benefit'] as string;
          const authorId = payload['agentId'] as string;
          const now = payload['now'] as number;
          const intent = payload['intent'] as string | undefined;
          sha = await graph.patch((p: WarpPatchBuilder) => {
            p.addNode(id)
              .setProperty(id, 'title', title)
              .setProperty(id, 'persona', persona)
              .setProperty(id, 'goal', goal)
              .setProperty(id, 'benefit', benefit)
              .setProperty(id, 'created_by', authorId)
              .setProperty(id, 'created_at', now)
              .setProperty(id, 'type', 'story');

            if (intent) {
              p.addEdge(intent, id, 'decomposes-to');
            }
          });
        } else if (op === 'requirement') {
          const id = payload['id'] as string;
          const description = payload['description'] as string;
          const kind = payload['kind'] as string;
          const priority = payload['priority'] as string;
          const story = payload['story'] as string | undefined;
          sha = await graph.patch((p: WarpPatchBuilder) => {
            p.addNode(id)
              .setProperty(id, 'description', description)
              .setProperty(id, 'kind', kind)
              .setProperty(id, 'priority', priority)
              .setProperty(id, 'type', 'requirement');

            if (story) {
              p.addEdge(story, id, 'decomposes-to');
            }
          });
        } else if (op === 'note' || op === 'spec' || op === 'adr') {
          const id = payload['id'] as string;
          const kind = payload['kind'] as string;
          const title = payload['title'] as string;
          const authorId = payload['agentId'] as string;
          const now = payload['now'] as number;
          const on = payload['on'] as string;
          const supersedes = payload['supersedes'] as string | undefined;
          const body = payload['body'] as string;
          const createPatchSession = (await import('../infrastructure/helpers/createPatchSession.js')).createPatchSession;
          const patch = await createPatchSession(graph);
          patch
            .addNode(id)
            .setProperty(id, 'type', kind)
            .setProperty(id, 'title', title)
            .setProperty(id, 'authored_by', authorId)
            .setProperty(id, 'authored_at', now)
            .addEdge(id, on, 'documents');
          if (supersedes) {
            patch.addEdge(id, supersedes, 'supersedes');
          }
          await patch.attachContent(id, body);
          sha = await patch.commit();
        }
        return {
          admitted: true,
          sha,
          intentId: desc.intentId,
        };
      },
    },
  );

  const emitJsonError = (
    error: string,
    data?: Record<string, unknown>,
    diagnostics?: Diagnostic[],
  ): void => {
    const envelope: JsonErrorEnvelope = {
      success: false,
      error,
      ...(data === undefined ? {} : { data }),
      ...(diagnostics === undefined || diagnostics.length === 0
        ? {}
        : { diagnostics }),
    };
    console.log(JSON.stringify(envelope));
  };

  const emitJson = (payload: JsonOutput): void => {
    console.log(JSON.stringify(payload));
  };

  return {
    agentId,
    cwd,
    repoPath,
    graphName,
    identity,
    json: jsonMode,
    graphPort,
    opticDomainActionService,
    observation,
    operationalRead,
    questReadPort,
    inspection,
    logger: opts?.logger ?? noopLogger,
    style,
    ok(msg: string): void {
      if (jsonMode) return;
      console.log(style.styled(style.theme.semantic.success, msg));
    },
    warn(msg: string): void {
      if (jsonMode) return;
      console.log(style.styled(style.theme.semantic.warning, msg));
    },
    muted(msg: string): void {
      if (jsonMode) return;
      console.log(style.styled(style.theme.semantic.muted, msg));
    },
    print(msg: string): void {
      if (jsonMode) return;
      console.log(msg);
    },
    fail(msg: string): never {
      if (jsonMode) {
        emitJsonError(msg);
      } else {
        console.error(style.styled(style.theme.semantic.error, msg));
      }
      process.exit(1);
    },
    failWithData(msg: string, data: Record<string, unknown>, diagnostics?: Diagnostic[]): never {
      if (jsonMode) {
        emitJsonError(msg, data, diagnostics);
      } else {
        console.error(style.styled(style.theme.semantic.error, msg));
      }
      process.exit(1);
    },
    jsonEvent(event: JsonStreamEvent): void {
      if (!jsonMode) return;
      emitJson(event);
    },
    jsonStart(command: string, data?: Record<string, unknown>): void {
      if (!jsonMode) return;
      emitJson({
        event: 'start',
        command,
        at: Date.now(),
        ...(data === undefined ? {} : { data }),
      });
    },
    jsonProgress(command: string, message: string, data?: Record<string, unknown>): void {
      if (!jsonMode) return;
      emitJson({
        event: 'progress',
        command,
        at: Date.now(),
        message,
        ...(data === undefined ? {} : { data }),
      });
    },
    jsonOut(envelope: JsonEnvelope): void {
      emitJson(envelope);
    },
  };
}
