import type { BoundedRead } from './ReadTypes.js';
import type { Quest } from '../domain/entities/Quest.js';
import type { Policy } from '../domain/entities/Policy.js';
import type { Requirement } from '../domain/entities/Requirement.js';
import type { Criterion } from '../domain/entities/Criterion.js';
import type { Evidence } from '../domain/entities/Evidence.js';

export interface QuestCone {
  readonly quest: Quest;
  readonly requirements: {
    readonly requirement: Requirement;
    readonly criteria: {
      readonly criterion: Criterion;
      readonly evidence: Evidence[];
    }[];
  }[];
  readonly policies: Policy[];
}

export interface QuestReadPort {
  getQuestCone(questId: string): Promise<BoundedRead<QuestCone> | null>;
}
