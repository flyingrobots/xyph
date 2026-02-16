/**
 * XYPH Schema Validators
 * Enforces the grammar of the graph at the runtime boundary.
 */

export const PREFIXES = [
  'milestone', 'feature', 'task', 'spec', 'adr', 
  'crate', 'issue', 'concept', 'decision', 'person', 
  'tool', 'event', 'metric', 'artifact', 'roadmap', 'campaign'
];

export const EDGE_TYPES = [
  'implements', 'augments', 'relates-to', 'blocks', 
  'belongs-to', 'consumed-by', 'depends-on', 'documents', 'fulfills'
];

export function validateNodeId(id) {
  if (typeof id !== 'string') return { valid: false, error: 'Node ID must be a string' };
  
  const parts = id.split(':');
  if (parts.length < 2) return { valid: false, error: 'Node ID must follow prefix:identifier format' };
  
  const prefix = parts[0];
  const identifier = parts.slice(1).join(':');
  
  if (!PREFIXES.includes(prefix)) {
    return { valid: false, error: `Unknown prefix: ${prefix}` };
  }
  
  if (!identifier) {
    return { valid: false, error: 'Identifier cannot be empty' };
  }
  
  return { valid: true, prefix, identifier };
}

export function validateEdgeType(type) {
  if (!EDGE_TYPES.includes(type)) {
    return { valid: false, error: `Unknown edge type: ${type}` };
  }
  return { valid: true };
}

export function validateEdge({ source, target, type, confidence }) {
  const sourceVal = validateNodeId(source);
  if (!sourceVal.valid) return sourceVal;
  
  const targetVal = validateNodeId(target);
  if (!targetVal.valid) return targetVal;
  
  const typeVal = validateEdgeType(type);
  if (!typeVal.valid) return typeVal;
  
  if (confidence !== undefined) {
    const conf = parseFloat(confidence);
    if (isNaN(conf) || conf < 0 || conf > 1) {
      return { valid: false, error: 'Confidence must be a number between 0.0 and 1.0' };
    }
  }
  
  return { valid: true };
}
