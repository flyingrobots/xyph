/**
 * ClockPort — port for reading the current epoch timestamp.
 * Permits injecting mocked or fixed clocks for deterministic testing.
 */
export interface ClockPort {
  now(): number;
}
