import { fromZonedTime, toZonedTime, format as formatTz } from 'date-fns-tz';

/**
 * Service responsible for timezone-aware conversions and validation.
 *
 * Design principles:
 * - All business timestamps are UTC at the persistence layer
 * - IANA zone names (e.g. "America/Argentina/Buenos_Aires") are stored
 *   on entities, never offsets (offsets don't handle DST)
 * - Conversions happen at the edges: parse input at controllers,
 *   format output at serializers, domain layer stays UTC-native
 */
export class TimezoneService {
  /**
   * Validates an IANA timezone identifier using the runtime's
   * Intl.DateTimeFormat constructor. Returns false for offset strings,
   * malformed names, or non-existent zones.
   */
  isValid(timezone: string): boolean {
    if (!timezone || typeof timezone !== 'string') return false;
    try {
      new Intl.DateTimeFormat('en-US', { timeZone: timezone });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Converts a UTC date to the same instant expressed in the given
   * timezone. Returns a plain Date object whose .toString() and
   * field accessors (hours, minutes) reflect the target zone.
   *
   * Example: utcToLocal(2026-04-22T15:00:00Z, "America/Argentina/Buenos_Aires")
   *          returns a Date where .getHours() === 12 (UTC-3)
   */
  utcToLocal(utc: Date, timezone: string): Date {
    this.assertValid(timezone);
    return toZonedTime(utc, timezone);
  }

  /**
   * Converts a local wall-clock time in the given timezone to the
   * corresponding UTC instant.
   *
   * Example: localToUtc(2026-04-22T12:00:00, "America/Argentina/Buenos_Aires")
   *          returns Date representing 2026-04-22T15:00:00Z
   *
   * For a user picking "April 22 at 12pm in Buenos Aires", pass the
   * wall-clock time and the target zone to get the canonical UTC.
   */
  localToUtc(localWallClock: Date | string, timezone: string): Date {
    this.assertValid(timezone);
    return fromZonedTime(localWallClock, timezone);
  }

  /**
   * Formats a UTC date for display in a specific timezone.
   *
   * Example: formatInZone(utc, "America/Argentina/Buenos_Aires")
   *          returns "April 22, 2026 at 12:00 PM GMT-3"
   *
   * Implementation note: date-fns-tz@3 requires a pre-zoned Date for
   * format() to render local fields correctly. We normalize with
   * toZonedTime first, then format.
   */
  formatInZone(
    utc: Date,
    timezone: string,
    pattern = "MMMM d, yyyy 'at' h:mm a zzz",
  ): string {
    this.assertValid(timezone);
    const zoned = toZonedTime(utc, timezone);
    return formatTz(zoned, pattern, { timeZone: timezone });
  }

  /**
   * Returns ISO 8601 string with the given zone's offset.
   *
   * Example: utc=2026-04-22T15:00:00Z, zone="America/Argentina/Buenos_Aires"
   *          returns "2026-04-22T12:00:00-03:00"
   */
  toIsoInZone(utc: Date, timezone: string): string {
    this.assertValid(timezone);
    const zoned = toZonedTime(utc, timezone);
    return formatTz(zoned, "yyyy-MM-dd'T'HH:mm:ssXXX", { timeZone: timezone });
  }

  /**
   * Combines a calendar date (YYYY-MM-DD) and a time (HH:mm) in a
   * specific timezone into the corresponding UTC instant.
   *
   * Example: combineToUtc("2026-04-22", "15:30", "America/Argentina/Buenos_Aires")
   *          returns Date representing 2026-04-22T18:30:00Z
   *
   * Primarily for inputs where users pick a date and time separately.
   */
  combineToUtc(dateYyyyMmDd: string, timeHhMm: string, timezone: string): Date {
    this.assertValid(timezone);
    const [h, m] = timeHhMm.split(':').map(Number);
    const [y, mo, d] = dateYyyyMmDd.split('-').map(Number);
    // Build a naive Date in "local" and convert via fromZonedTime
    const naive = new Date(Date.UTC(y, mo - 1, d, h, m, 0));
    return fromZonedTime(naive, timezone);
  }

  private assertValid(timezone: string): void {
    if (!this.isValid(timezone)) {
      throw new InvalidTimezoneError(timezone);
    }
  }
}

export class InvalidTimezoneError extends Error {
  constructor(public readonly timezone: string) {
    super(`Invalid IANA timezone: "${timezone}"`);
    this.name = 'InvalidTimezoneError';
  }
}
