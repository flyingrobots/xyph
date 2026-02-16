/**
 * XYPH Schema Validators
 * Enforces the grammar of the graph at the runtime boundary.
 */

export const PREFIXES = [
  'milestone', 'feature', 'task', 'spec', 'adr', 
  'crate', 'issue', 'concept', 'decision', 'person', 
  'tool', 'event', 'metric', 'artifact', 'roadmap', 'campaign'
] as const;

export type Prefix = typeof PREFIXES[number];

export const EDGE_TYPES = [
  'implements', 'augments', 'relates-to', 'blocks', 
  'belongs-to', 'consumed-by', 'depends-on', 'documents', 'fulfills'
] as const;

export type EdgeType = typeof EDGE_TYPES[number];

export interface ValidationResult {
  valid: boolean;
  error?: string;
  prefix?: string;
  identifier?: string;
}

export function validateNodeId(id: string): ValidationResult {
  if (typeof id !== 'string') return { valid: false, error: 'Node ID must be a string' };
  
  const parts = id.split(':');
  if (parts.length < 2) return { valid: false, error: 'Node ID must follow prefix:identifier format' };
  
  const prefix = parts[0] as Prefix;
  const identifier = parts.slice(1).join(':');
  
  if (!PREFIXES.includes(prefix)) {
    return { valid: false, error: `Unknown prefix: ${prefix}` };
  }
  
  if (!identifier) {
    return { valid: false, error: 'Identifier cannot be empty' };
  }
  
  return { valid: true, prefix, identifier };
}

export function validateEdgeType(type: string): { valid: boolean; error?: string } {
  if (!EDGE_TYPES.includes(type as EdgeType)) {
    return { valid: false, error: `Unknown edge type: ${type}` };
  }
  return { valid: true };
}

export interface EdgeData {
  source: string;
  target: string;
  type: string;
  confidence?: number;
}

export function validateEdge({ source, target, type, confidence }: EdgeData): { valid: boolean; error?: string } {
  const sourceVal = validateNodeId(source);
  if (!sourceVal.valid) return sourceVal;
  
  const targetVal = validateNodeId(target);
  if (!targetVal.valid) return targetVal;
  
  const typeVal = validateEdgeType(type);
  if (!typeVal.valid) return typeVal;
  
  if (confidence !== undefined) {
    const conf = parseFloat(confidence.toString());
    if (isNaN(conf) || conf < 0 || conf > 1) {
      return { valid: false, error: 'Confidence must be a number between 0.0 and 1.0' };
    }
  }
  
  return { valid: true };
}
