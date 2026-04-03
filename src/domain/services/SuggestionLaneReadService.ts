import type { DashboardSuggestionLaneData } from '../models/dashboard.js';
import type { ObservationSession } from '../../ports/ObservationPort.js';
import { readAiSuggestions } from './AiSuggestionReadService.js';

export async function readSuggestionLaneData(
  session: ObservationSession,
): Promise<DashboardSuggestionLaneData> {
  return {
    aiSuggestions: await readAiSuggestions(session),
  };
}
