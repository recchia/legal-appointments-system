/**
 * Abstraction over the system clock.
 *
 * Business logic should depend on a Clock rather than calling `new Date()`
 * or `Date.now()` directly. This makes time-sensitive rules testable
 * without fake-timer machinery and keeps the domain layer free of
 * ambient global dependencies.
 *
 * Equivalent patterns in other ecosystems:
 *   - PHP: lcobucci/clock, Carbon::setTestNow(), Symfony/Clock
 *   - Java: java.time.Clock (injected)
 *   - .NET: TimeProvider (built-in since .NET 8)
 *
 * Production code is wired with SystemClock at the composition root.
 * Tests instantiate FixedClock with a known instant.
 */
export interface Clock {
  /** The current moment, as a UTC-anchored Date instant. */
  now(): Date;
}

/**
 * Production implementation — delegates to the real system clock.
 */
export class SystemClock implements Clock {
  now(): Date {
    return new Date();
  }
}

/**
 * Test implementation — returns a fixed instant on every call.
 *
 * The instant is cloned on each call so mutation by the caller
 * cannot leak into subsequent reads.
 */
export class FixedClock implements Clock {
  private readonly instant: Date;

  constructor(instant: Date | string) {
    this.instant = instant instanceof Date ? new Date(instant) : new Date(instant);
    if (Number.isNaN(this.instant.getTime())) {
      throw new Error(`FixedClock received invalid instant: ${String(instant)}`);
    }
  }

  now(): Date {
    return new Date(this.instant);
  }
}

/**
 * Test implementation that allows advancing time between reads.
 *
 * Useful for testing sequential behaviors: "after 10 minutes, state X;
 * after 30 minutes, state Y." Cleaner than fake-timers for most cases
 * because tests remain synchronous and deterministic.
 */
export class AdvanceableClock implements Clock {
  private currentInstant: Date;

  constructor(initial: Date | string) {
    this.currentInstant = initial instanceof Date
      ? new Date(initial)
      : new Date(initial);
    if (Number.isNaN(this.currentInstant.getTime())) {
      throw new Error(`AdvanceableClock received invalid instant: ${String(initial)}`);
    }
  }

  now(): Date {
    return new Date(this.currentInstant);
  }

  advanceBy(milliseconds: number): void {
    this.currentInstant = new Date(this.currentInstant.getTime() + milliseconds);
  }

  advanceTo(instant: Date | string): void {
    const next = instant instanceof Date ? new Date(instant) : new Date(instant);
    if (Number.isNaN(next.getTime())) {
      throw new Error(`advanceTo received invalid instant: ${String(instant)}`);
    }
    this.currentInstant = next;
  }
}
