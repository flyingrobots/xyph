import type { ClockPort } from '../../ports/ClockPort.js';

/**
 * SystemClockAdapter — adapter implementing ClockPort using the host's system clock.
 */
export class SystemClockAdapter implements ClockPort {
  public now(): number {
    return Date.now();
  }
}
