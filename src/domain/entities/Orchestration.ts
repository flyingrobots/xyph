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
  runId: string;
  fromState: OrchestrationState;
  toState: OrchestrationState;
  actor: {
    type: 'human' | 'agent' | 'service';
    id: string;
  };
  timestamp: string;
  inputDigest: string;
  outputDigest: string;
  decisionSummary: string;
  durationMs: number;
  status: 'OK' | 'WARN' | 'ERROR';
}

export interface OrchestrationArtifact {
  schemaVersion: string;
  runId: string;
  state: OrchestrationState;
  createdAt: string;
  inputDigest: string;
  outputDigest: string;
}
