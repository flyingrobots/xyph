import type { AiSuggestionAdoptionKind } from '../domain/entities/AiSuggestion.js';
import type { XYPHWriting } from '../ports/XYPHWriter.js';

export const RECORD_AI_SUGGESTION_WRITING = 'xyph.write.recordAiSuggestion';
export const DECIDE_CASE_WRITING = 'xyph.write.decideCase';
export const ADOPT_AI_SUGGESTION_WRITING = 'xyph.write.adoptAiSuggestion';
export const DISMISS_AI_SUGGESTION_WRITING = 'xyph.write.dismissAiSuggestion';
export const SUPERSEDE_AI_SUGGESTION_WRITING = 'xyph.write.supersedeAiSuggestion';

export interface RecordedAiSuggestion {
  readonly id: string;
  readonly suggestedAt: number;
  readonly contentOid: string | null;
}

export interface DecidedCase {
  readonly decisionId: string;
  readonly caseId: string;
  readonly decision: CaseDecisionKind;
  readonly followOnArtifactId?: string;
  readonly followOnArtifactKind?: Exclude<CaseFollowOnKind, 'none'>;
}

export interface AdoptedAiSuggestion {
  readonly suggestionId: string;
  readonly adoptedArtifactId: string;
  readonly adoptedArtifactKind: AiSuggestionAdoptionKind;
}

export interface DismissedAiSuggestion {
  readonly suggestionId: string;
}

export interface SupersededAiSuggestion {
  readonly suggestionId: string;
  readonly supersededById: string;
}

export interface RecordAiSuggestionInput {
  readonly title: string;
  readonly summary: string;
  readonly targetId?: string;
  readonly relatedIds?: string[];
  readonly requestedBy: string;
  readonly suggestedBy: string;
}

export type CaseDecisionKind = 'adopt' | 'reject' | 'defer' | 'request-evidence';
export type CaseFollowOnKind = 'quest' | 'proposal' | 'none';

export interface DecideCaseInput {
  readonly caseId: string;
  readonly decision: CaseDecisionKind;
  readonly rationale: string;
  readonly followOnKind?: CaseFollowOnKind;
  readonly decidedBy: string;
}

export interface AdoptAiSuggestionInput {
  readonly suggestionId: string;
  readonly adoptedArtifactKind: AiSuggestionAdoptionKind;
  readonly resolvedBy: string;
  readonly rationale: string;
}

export interface DismissAiSuggestionInput {
  readonly suggestionId: string;
  readonly resolvedBy: string;
  readonly rationale: string;
}

export interface SupersedeAiSuggestionInput {
  readonly suggestionId: string;
  readonly supersededById: string;
  readonly rationale?: string;
  readonly resolvedBy: string;
}

export type RecordAiSuggestionWriting = XYPHWriting<
  typeof RECORD_AI_SUGGESTION_WRITING,
  RecordAiSuggestionInput,
  RecordedAiSuggestion
>;

export type DecideCaseWriting = XYPHWriting<
  typeof DECIDE_CASE_WRITING,
  DecideCaseInput,
  DecidedCase
>;

export type AdoptAiSuggestionWriting = XYPHWriting<
  typeof ADOPT_AI_SUGGESTION_WRITING,
  AdoptAiSuggestionInput,
  AdoptedAiSuggestion
>;

export type DismissAiSuggestionWriting = XYPHWriting<
  typeof DISMISS_AI_SUGGESTION_WRITING,
  DismissAiSuggestionInput,
  DismissedAiSuggestion
>;

export type SupersedeAiSuggestionWriting = XYPHWriting<
  typeof SUPERSEDE_AI_SUGGESTION_WRITING,
  SupersedeAiSuggestionInput,
  SupersededAiSuggestion
>;

export type AiSuggestionWriting =
  | RecordAiSuggestionWriting
  | DecideCaseWriting
  | AdoptAiSuggestionWriting
  | DismissAiSuggestionWriting
  | SupersedeAiSuggestionWriting;

export function RecordAiSuggestion(input: RecordAiSuggestionInput): RecordAiSuggestionWriting {
  return {
    kind: RECORD_AI_SUGGESTION_WRITING,
    input,
  };
}

export function DecideCase(input: DecideCaseInput): DecideCaseWriting {
  return {
    kind: DECIDE_CASE_WRITING,
    input,
  };
}

export function AdoptAiSuggestion(input: AdoptAiSuggestionInput): AdoptAiSuggestionWriting {
  return {
    kind: ADOPT_AI_SUGGESTION_WRITING,
    input,
  };
}

export function DismissAiSuggestion(input: DismissAiSuggestionInput): DismissAiSuggestionWriting {
  return {
    kind: DISMISS_AI_SUGGESTION_WRITING,
    input,
  };
}

export function SupersedeAiSuggestion(input: SupersedeAiSuggestionInput): SupersedeAiSuggestionWriting {
  return {
    kind: SUPERSEDE_AI_SUGGESTION_WRITING,
    input,
  };
}

export function isAiSuggestionWriting(
  writing: XYPHWriting<string, unknown, unknown>,
): writing is AiSuggestionWriting {
  return writing.kind === RECORD_AI_SUGGESTION_WRITING ||
    writing.kind === DECIDE_CASE_WRITING ||
    writing.kind === ADOPT_AI_SUGGESTION_WRITING ||
    writing.kind === DISMISS_AI_SUGGESTION_WRITING ||
    writing.kind === SUPERSEDE_AI_SUGGESTION_WRITING;
}
