import type { RecordCommentIntentPort } from '../../ports/RecordCommentIntentPort.js';
import type {
  WritingReceipt,
  XYPHWriter,
  XYPHWriting,
  XYPHWritingValue,
} from '../../ports/XYPHWriter.js';
import {
  isRecordCommentWriting,
  type RecordedComment,
} from '../../writings/RecordComment.js';
import {
  ADOPT_AI_SUGGESTION_WRITING,
  DECIDE_CASE_WRITING,
  DISMISS_AI_SUGGESTION_WRITING,
  RECORD_AI_SUGGESTION_WRITING,
  SUPERSEDE_AI_SUGGESTION_WRITING,
  isAiSuggestionWriting,
  type AdoptedAiSuggestion,
  type DecidedCase,
  type DismissedAiSuggestion,
  type RecordedAiSuggestion,
  type SupersededAiSuggestion,
} from '../../writings/AiSuggestionWritings.js';

interface RecordWritingPort {
  createAiSuggestion(input: {
    kind: 'ask-ai';
    title: string;
    summary: string;
    suggestedBy: string;
    requestedBy: string;
    audience: 'agent';
    origin: 'request';
    status: 'queued';
    targetId?: string;
    relatedIds: string[];
    nextAction: string;
  }): Promise<{
    id: string;
    patch: string;
    suggestedAt: number;
    contentOid: string | null;
  }>;
  createCaseDecision(input: {
    caseId: string;
    decision: DecidedCase['decision'];
    decidedBy: string;
    rationale: string;
    followOnKind?: 'quest' | 'proposal' | 'none';
  }): Promise<{
    decisionId: string;
    caseId: string;
    decision: DecidedCase['decision'];
    followOnArtifactId?: string;
    followOnArtifactKind?: Exclude<NonNullable<DecidedCase['followOnArtifactKind']>, undefined>;
    patch: string;
    decidedAt: number;
  }>;
  adoptAiSuggestion(input: {
    suggestionId: string;
    resolvedBy: string;
    adoptedArtifactKind: AdoptedAiSuggestion['adoptedArtifactKind'];
    rationale: string;
  }): Promise<{
    suggestionId: string;
    adoptedArtifactId: string;
    adoptedArtifactKind: AdoptedAiSuggestion['adoptedArtifactKind'];
    patch: string;
    resolvedAt: number;
  }>;
  dismissAiSuggestion(input: {
    suggestionId: string;
    resolvedBy: string;
    rationale: string;
  }): Promise<{
    suggestionId: string;
    patch: string;
    resolvedAt: number;
  }>;
  supersedeAiSuggestion(input: {
    suggestionId: string;
    supersededById: string;
    resolvedBy: string;
    rationale?: string;
  }): Promise<{
    suggestionId: string;
    supersededById: string;
    patch: string;
    resolvedAt: number;
  }>;
}

export class WarpXYPHWriterAdapter implements XYPHWriter {
  constructor(
    private readonly recordCommentIntent: RecordCommentIntentPort,
    private readonly records?: RecordWritingPort,
  ) {}

  public async write<W extends XYPHWriting<string, unknown, unknown>>(
    writing: W,
  ): Promise<WritingReceipt<XYPHWritingValue<W>>> {
    if (isRecordCommentWriting(writing)) {
      const result = await this.recordCommentIntent.recordComment(writing.input);
      const receipt: WritingReceipt<RecordedComment> = {
        value: {
          id: result.id,
          targetId: result.targetId,
          ...(result.replyTo === undefined ? {} : { replyTo: result.replyTo }),
          authoredAt: result.authoredAt,
          contentOid: result.contentOid,
        },
        writing: writing.kind,
        recordedBy: writing.input.authoredBy,
        recordedAt: result.authoredAt,
        witness: {
          id: result.id,
          patch: result.patch,
        },
      };
      return receipt as WritingReceipt<XYPHWritingValue<W>>;
    }

    if (isAiSuggestionWriting(writing)) {
      if (!this.records) {
        throw new Error('[UNSUPPORTED_WRITING] record writer is not configured');
      }
      if (writing.kind === RECORD_AI_SUGGESTION_WRITING) {
        const result = await this.records.createAiSuggestion({
          kind: 'ask-ai',
          title: writing.input.title,
          summary: writing.input.summary,
          suggestedBy: writing.input.suggestedBy,
          requestedBy: writing.input.requestedBy,
          audience: 'agent',
          origin: 'request',
          status: 'queued',
          targetId: writing.input.targetId,
          relatedIds: writing.input.relatedIds ?? [],
          nextAction: 'An agent should inspect this ask-AI job and publish one or more visible advisory suggestions in response.',
        });
        const receipt: WritingReceipt<RecordedAiSuggestion> = {
          value: {
            id: result.id,
            suggestedAt: result.suggestedAt,
            contentOid: result.contentOid,
          },
          writing: writing.kind,
          recordedBy: writing.input.suggestedBy,
          recordedAt: result.suggestedAt,
          witness: {
            id: result.id,
            patch: result.patch,
          },
        };
        return receipt as WritingReceipt<XYPHWritingValue<W>>;
      }

      if (writing.kind === DECIDE_CASE_WRITING) {
        const result = await this.records.createCaseDecision({
          caseId: writing.input.caseId,
          decision: writing.input.decision,
          decidedBy: writing.input.decidedBy,
          rationale: writing.input.rationale,
          followOnKind: writing.input.followOnKind,
        });
        const receipt: WritingReceipt<DecidedCase> = {
          value: {
            decisionId: result.decisionId,
            caseId: result.caseId,
            decision: result.decision,
            ...(result.followOnArtifactId ? { followOnArtifactId: result.followOnArtifactId } : {}),
            ...(result.followOnArtifactKind ? { followOnArtifactKind: result.followOnArtifactKind } : {}),
          },
          writing: writing.kind,
          recordedBy: writing.input.decidedBy,
          recordedAt: result.decidedAt,
          witness: {
            id: result.decisionId,
            patch: result.patch,
          },
        };
        return receipt as WritingReceipt<XYPHWritingValue<W>>;
      }

      if (writing.kind === ADOPT_AI_SUGGESTION_WRITING) {
        const result = await this.records.adoptAiSuggestion(writing.input);
        const receipt: WritingReceipt<AdoptedAiSuggestion> = {
          value: {
            suggestionId: result.suggestionId,
            adoptedArtifactId: result.adoptedArtifactId,
            adoptedArtifactKind: result.adoptedArtifactKind,
          },
          writing: writing.kind,
          recordedBy: writing.input.resolvedBy,
          recordedAt: result.resolvedAt,
          witness: {
            id: result.suggestionId,
            patch: result.patch,
          },
        };
        return receipt as WritingReceipt<XYPHWritingValue<W>>;
      }

      if (writing.kind === DISMISS_AI_SUGGESTION_WRITING) {
        const result = await this.records.dismissAiSuggestion(writing.input);
        const receipt: WritingReceipt<DismissedAiSuggestion> = {
          value: {
            suggestionId: result.suggestionId,
          },
          writing: writing.kind,
          recordedBy: writing.input.resolvedBy,
          recordedAt: result.resolvedAt,
          witness: {
            id: result.suggestionId,
            patch: result.patch,
          },
        };
        return receipt as WritingReceipt<XYPHWritingValue<W>>;
      }

      if (writing.kind === SUPERSEDE_AI_SUGGESTION_WRITING) {
        const result = await this.records.supersedeAiSuggestion(writing.input);
        const receipt: WritingReceipt<SupersededAiSuggestion> = {
          value: {
            suggestionId: result.suggestionId,
            supersededById: result.supersededById,
          },
          writing: writing.kind,
          recordedBy: writing.input.resolvedBy,
          recordedAt: result.resolvedAt,
          witness: {
            id: result.suggestionId,
            patch: result.patch,
          },
        };
        return receipt as WritingReceipt<XYPHWritingValue<W>>;
      }
    }

    throw new Error(`[UNSUPPORTED_WRITING] ${writing.kind}`);
  }
}
