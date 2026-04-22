import { describe, it, expect } from 'vitest';
import { TimezoneService, InvalidTimezoneError } from '../../src/services/timezone.service';

describe('TimezoneService', () => {
  const service = new TimezoneService();

  describe('isValid', () => {
    it('accepts canonical IANA zone names', () => {
      expect(service.isValid('UTC')).toBe(true);
      expect(service.isValid('America/Argentina/Buenos_Aires')).toBe(true);
      expect(service.isValid('Europe/Madrid')).toBe(true);
      expect(service.isValid('America/Mexico_City')).toBe(true);
      expect(service.isValid('Asia/Tokyo')).toBe(true);
    });

    it('rejects invalid or malformed zones', () => {
      expect(service.isValid('America/Fakeville')).toBe(false);
      expect(service.isValid('not a timezone')).toBe(false);
      expect(service.isValid('')).toBe(false);
      // Note: offsets like "+03:00" may be accepted by some Node runtimes
      // via Intl. We don't over-restrict here; an IANA-only regex check
      // could be added if strict enforcement becomes a requirement.
    });

    it('rejects non-string inputs', () => {
      expect(service.isValid(null as unknown as string)).toBe(false);
      expect(service.isValid(undefined as unknown as string)).toBe(false);
      expect(service.isValid(123 as unknown as string)).toBe(false);
    });
  });

  describe('utcToLocal', () => {
    it('converts UTC to Buenos Aires (UTC-3)', () => {
      const utc = new Date('2026-04-22T15:00:00Z');
      const local = service.utcToLocal(utc, 'America/Argentina/Buenos_Aires');
      expect(local.getHours()).toBe(12);
    });

    it('converts UTC to Tokyo (UTC+9)', () => {
      const utc = new Date('2026-04-22T00:00:00Z');
      const local = service.utcToLocal(utc, 'Asia/Tokyo');
      expect(local.getHours()).toBe(9);
    });

    it('throws for invalid timezone', () => {
      const utc = new Date('2026-04-22T15:00:00Z');
      expect(() => service.utcToLocal(utc, 'America/Fakeville')).toThrow(
        InvalidTimezoneError,
      );
    });
  });

  describe('localToUtc', () => {
    // CRITICAL: We pass naive ISO strings (no Z, no offset) to avoid
    // machine-timezone dependency. date-fns-tz treats these as
    // "wall-clock time in the target zone" unambiguously.

    it('converts Buenos Aires local time to UTC', () => {
      // "2026-04-22 12:00 in Buenos Aires (UTC-3)" → 15:00 UTC
      const utc = service.localToUtc(
        '2026-04-22T12:00:00',
        'America/Argentina/Buenos_Aires',
      );
      expect(utc.toISOString()).toBe('2026-04-22T15:00:00.000Z');
    });

    it('converts Madrid local time to UTC in winter (CET, UTC+1)', () => {
      const utc = service.localToUtc('2026-01-15T10:00:00', 'Europe/Madrid');
      expect(utc.toISOString()).toBe('2026-01-15T09:00:00.000Z');
    });

    it('converts Madrid local time to UTC in summer (CEST, UTC+2)', () => {
      const utc = service.localToUtc('2026-07-15T10:00:00', 'Europe/Madrid');
      expect(utc.toISOString()).toBe('2026-07-15T08:00:00.000Z');
    });
  });

  describe('DST handling', () => {
    it('handles spring-forward gap without crashing (US/Eastern, March 2026)', () => {
      // 02:30 on March 8, 2026 doesn't exist in US/Eastern — clocks jump 02:00→03:00
      const utc = service.localToUtc('2026-03-08T02:30:00', 'America/New_York');
      expect(utc).toBeInstanceOf(Date);
      expect(Number.isNaN(utc.getTime())).toBe(false);
    });

    it('handles fall-back ambiguity without crashing (US/Eastern, November 2026)', () => {
      // 01:30 on November 1, 2026 happens twice — clocks roll back 02:00→01:00
      const utc = service.localToUtc('2026-11-01T01:30:00', 'America/New_York');
      expect(utc).toBeInstanceOf(Date);
      expect(Number.isNaN(utc.getTime())).toBe(false);
    });

    it('observes DST offset differences between winter and summer', () => {
      // Same wall-clock hour, different UTC hour in a DST zone
      const januaryUtc = service.localToUtc('2026-01-15T10:00:00', 'Europe/Madrid');
      const julyUtc = service.localToUtc('2026-07-15T10:00:00', 'Europe/Madrid');

      expect(januaryUtc.toISOString()).toBe('2026-01-15T09:00:00.000Z');
      expect(julyUtc.toISOString()).toBe('2026-07-15T08:00:00.000Z');
    });
  });

  describe('round-trip conversion', () => {
    it('utc → local → utc is identity across zones', () => {
      const utc = new Date('2026-06-15T17:45:00Z');
      const zones = [
        'America/Argentina/Buenos_Aires',
        'Europe/Madrid',
        'Asia/Tokyo',
        'America/Mexico_City',
      ];

      for (const zone of zones) {
        const local = service.utcToLocal(utc, zone);
        const backToUtc = service.localToUtc(local, zone);
        expect(backToUtc.toISOString()).toBe(utc.toISOString());
      }
    });
  });

  describe('formatInZone', () => {
    it('formats a UTC date in the target zone with default pattern', () => {
      const utc = new Date('2026-04-22T15:00:00Z');
      const formatted = service.formatInZone(utc, 'America/Argentina/Buenos_Aires');
      expect(formatted).toContain('12');
    });

    it('accepts a custom pattern', () => {
      const utc = new Date('2026-04-22T15:00:00Z');
      const formatted = service.formatInZone(
        utc,
        'America/Argentina/Buenos_Aires',
        'yyyy-MM-dd HH:mm',
      );
      expect(formatted).toBe('2026-04-22 12:00');
    });
  });

  describe('toIsoInZone', () => {
    it('returns ISO 8601 string with the local offset', () => {
      const utc = new Date('2026-04-22T15:00:00Z');
      expect(service.toIsoInZone(utc, 'America/Argentina/Buenos_Aires'))
        .toBe('2026-04-22T12:00:00-03:00');
    });

    it('reflects DST offset differences', () => {
      const winterUtc = new Date('2026-01-15T12:00:00Z');
      const summerUtc = new Date('2026-07-15T12:00:00Z');
      expect(service.toIsoInZone(winterUtc, 'Europe/Madrid')).toContain('+01:00');
      expect(service.toIsoInZone(summerUtc, 'Europe/Madrid')).toContain('+02:00');
    });
  });

  describe('combineToUtc', () => {
    it('combines date and time in a timezone to UTC', () => {
      // "2026-04-22 15:30 in Buenos Aires (UTC-3)" → 18:30 UTC
      const utc = service.combineToUtc(
        '2026-04-22',
        '15:30',
        'America/Argentina/Buenos_Aires',
      );
      expect(utc.toISOString()).toBe('2026-04-22T18:30:00.000Z');
    });
  });
});
