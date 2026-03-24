import type { AiSuggestionNode } from '../../domain/models/dashboard.js';

function isOpenSuggestionStatus(status: AiSuggestionNode['status']): boolean {
  return status === 'suggested' || status === 'queued';
}

export function suggestionCanAdopt(suggestion: AiSuggestionNode): boolean {
  return suggestion.kind !== 'ask-ai' && isOpenSuggestionStatus(suggestion.status);
}

export function suggestionCanDismiss(suggestion: AiSuggestionNode): boolean {
  return isOpenSuggestionStatus(suggestion.status);
}

export function suggestionCanSupersede(suggestion: AiSuggestionNode): boolean {
  return suggestion.kind !== 'ask-ai' && isOpenSuggestionStatus(suggestion.status);
}
