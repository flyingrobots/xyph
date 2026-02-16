/**
 * Orchestration Domain Types
 * Based on ORCHESTRATION_SPEC.md v1.0
 */

export type OrchestrationState = 
  | 'INGEST'
  | 'NORMALIZE'
  | 'CLASSIFY'
  | 'VALIDATE'
  | 'MERGE'
  | 'REBALANCE'
  | 'SCHEDULE'
  | 'REVIEW'
  | 'EMIT'
  | 'APPLY'
  | 'DONE'
  | 'FAILED'
  | 'ROLLED_BACK';

export interface AuditRecord {
  schemaVersion: 'v1.0';
  eventId: string;
  runId: string;
  sequence: number;
  timestamp: string;
  fromState: OrchestrationState;
  toState: OrchestrationState;
  actor: {
    type: 'human' | 'agent' | 'service';
    id: string;
  };
  inputDigest: string;
  outputDigest: string;
  durationMs: number;
  decisionSummary: string;
  status: 'OK' | 'WARN' | 'ERROR';
  policyPackRef: string;
  configRef: string;
}

export interface OrchestrationArtifact {
  schemaVersion: 'v1.0';
  runId: string;
  state: OrchestrationState;
  createdAt: string;
  inputDigest: string;
  outputDigest: string;
}
