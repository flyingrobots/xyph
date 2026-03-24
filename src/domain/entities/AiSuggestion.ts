export type AiSuggestionKind =
  | 'ask-ai'
  | 'quest'
  | 'dependency'
  | 'promotion'
  | 'campaign'
  | 'intent'
  | 'governance'
  | 'reopen'
  | 'general';

export const VALID_AI_SUGGESTION_KINDS: ReadonlySet<string> = new Set<AiSuggestionKind>([
  'ask-ai',
  'quest',
  'dependency',
  'promotion',
  'campaign',
  'intent',
  'governance',
  'reopen',
  'general',
]);

export type AiSuggestionStatus =
  | 'suggested'
  | 'queued'
  | 'accepted'
  | 'rejected'
  | 'implemented';

export const VALID_AI_SUGGESTION_STATUSES: ReadonlySet<string> = new Set<AiSuggestionStatus>([
  'suggested',
  'queued',
  'accepted',
  'rejected',
  'implemented',
]);

export type AiSuggestionAudience = 'human' | 'agent' | 'either';

export const VALID_AI_SUGGESTION_AUDIENCES: ReadonlySet<string> = new Set<AiSuggestionAudience>([
  'human',
  'agent',
  'either',
]);

export type AiSuggestionOrigin = 'spontaneous' | 'request';

export const VALID_AI_SUGGESTION_ORIGINS: ReadonlySet<string> = new Set<AiSuggestionOrigin>([
  'spontaneous',
  'request',
]);

export type AiSuggestionResolutionKind = 'adopted' | 'dismissed' | 'superseded';

export const VALID_AI_SUGGESTION_RESOLUTION_KINDS: ReadonlySet<string> = new Set<AiSuggestionResolutionKind>([
  'adopted',
  'dismissed',
  'superseded',
]);

export type AiSuggestionAdoptionKind = 'proposal' | 'quest';

export const VALID_AI_SUGGESTION_ADOPTION_KINDS: ReadonlySet<string> = new Set<AiSuggestionAdoptionKind>([
  'proposal',
  'quest',
]);

export function defaultAiSuggestionAdoptionKind(kind: AiSuggestionKind): AiSuggestionAdoptionKind {
  switch (kind) {
    case 'quest':
    case 'reopen':
      return 'quest';
    default:
      return 'proposal';
  }
}
