import { describe, it, expect } from 'vitest';
import { SystemClock, FixedClock, AdvanceableClock } from '../../src/clock';

describe('Clock', () => {
  describe('SystemClock', () => {
    it('returns the current time within a small window', () => {
      const clock = new SystemClock();
      const before = Date.now();
      const now = clock.now();
      const after = Date.now();

      expect(now).toBeInstanceOf(Date);
      expect(now.getTime()).toBeGreaterThanOrEqual(before);
      expect(now.getTime()).toBeLessThanOrEqual(after);
    });

    it('returns distinct Date instances per call', () => {
      const clock = new SystemClock();
      const first = clock.now();
      const second = clock.now();
      expect(first).not.toBe(second);
    });
  });

  describe('FixedClock', () => {
    it('returns the configured instant on every call', () => {
      const instant = new Date('2026-04-22T10:00:00Z');
      const clock = new FixedClock(instant);

      expect(clock.now().toISOString()).toBe('2026-04-22T10:00:00.000Z');
      expect(clock.now().toISOString()).toBe('2026-04-22T10:00:00.000Z');
    });

    it('accepts an ISO string', () => {
      const clock = new FixedClock('2026-04-22T10:00:00Z');
      expect(clock.now().toISOString()).toBe('2026-04-22T10:00:00.000Z');
    });

    it('returns distinct Date instances — mutation does not leak', () => {
      const clock = new FixedClock('2026-04-22T10:00:00Z');
      const first = clock.now();
      first.setFullYear(2099);
      const second = clock.now();
      expect(second.toISOString()).toBe('2026-04-22T10:00:00.000Z');
    });

    it('throws on invalid instant', () => {
      expect(() => new FixedClock('not a date')).toThrow(/invalid instant/i);
    });
  });

  describe('AdvanceableClock', () => {
    it('returns the initial instant until advanced', () => {
      const clock = new AdvanceableClock('2026-04-22T10:00:00Z');
      expect(clock.now().toISOString()).toBe('2026-04-22T10:00:00.000Z');
    });

    it('advances by milliseconds', () => {
      const clock = new AdvanceableClock('2026-04-22T10:00:00Z');
      clock.advanceBy(60 * 60 * 1000); // 1 hour
      expect(clock.now().toISOString()).toBe('2026-04-22T11:00:00.000Z');
    });

    it('advances to a specific instant', () => {
      const clock = new AdvanceableClock('2026-04-22T10:00:00Z');
      clock.advanceTo('2026-04-25T18:30:00Z');
      expect(clock.now().toISOString()).toBe('2026-04-25T18:30:00.000Z');
    });

    it('throws on invalid advanceTo input', () => {
      const clock = new AdvanceableClock('2026-04-22T10:00:00Z');
      expect(() => clock.advanceTo('not a date')).toThrow(/invalid instant/i);
    });

    it('throws on invalid initial instant', () => {
      expect(() => new AdvanceableClock('not a date')).toThrow(/invalid instant/i);
    });
  });
});
