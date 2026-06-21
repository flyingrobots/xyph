import type { BoundedRead } from './ReadTypes.js';
import type { QuestStatus } from '../domain/entities/Quest.js';
import type { PatchsetRef, ReviewRef, DecisionProps } from '../domain/entities/Submission.js';

export interface SubmissionLaneCone {
  readonly questId: string;
  readonly questStatus: QuestStatus | null;
  readonly openSubmissionIds: string[];
  readonly submissions: {
    readonly id: string;
    readonly submittedBy: string;
    readonly submittedAt: number;
    readonly patchsets: PatchsetRef[];
    readonly decisions: DecisionProps[];
  }[];
  readonly patchsetDetails: Record<string, {
    readonly workspaceRef: string | null;
    readonly mergeRef: string | null;
    readonly reviews: ReviewRef[];
  }>;
}

export interface SubmissionReadPort {
  getSubmissionLaneCone(questId: string): Promise<BoundedRead<SubmissionLaneCone> | null>;
}
