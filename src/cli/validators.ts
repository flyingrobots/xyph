import { InvalidArgumentError } from 'commander';

/** Asserts that `value` starts with the given prefix, or throws with a descriptive message. */
export function assertPrefix(value: string, prefix: string, label: string): void {
  if (!value.startsWith(prefix)) {
    throw new Error(`${label} must start with '${prefix}', got: '${value}'`);
  }
}

/** Asserts that `value` is at least `min` characters long. */
export function assertMinLength(value: string, min: number, label: string): void {
  if (value.length < min) {
    throw new Error(`${label} must be at least ${min} characters`);
  }
}

/** Asserts that `value` starts with one of the given prefixes. */
export function assertPrefixOneOf(value: string, prefixes: readonly string[], label: string): void {
  if (!prefixes.some((p) => value.startsWith(p))) {
    throw new Error(`${label} must start with one of: ${prefixes.join(', ')}. Got: '${value}'`);
  }
}

/** Commander option parser for non-negative finite hours. */
export function parseHours(val: string): number {
  const parsed = Number(val);
  if (val.trim() === '' || !Number.isFinite(parsed) || parsed < 0) {
    throw new InvalidArgumentError(`Invalid hours value: "${val}". Must be a non-negative number.`);
  }
  return parsed;
}
