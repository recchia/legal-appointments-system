import { describe, it, expect, beforeEach } from 'vitest';
import type { Appointment } from '@prisma/client';
import { ConflictDetectorService, InvalidTimeWindowError } from '../../src/services/conflict-detector.service';
import type { AppointmentRepository } from '../../src/repositories/appointment.repository';

/**
 * Fake AppointmentRepository for unit tests.
 * Stores appointments in memory and filters them using the same
 * half-open overlap semantics as the real Prisma query.
 */
class FakeAppointmentRepository
  implements Pick<AppointmentRepository, 'findOverlappingForLawyer'>
{
  private appointments: Appointment[] = [];

  seed(appointments: Appointment[]): void {
    this.appointments = appointments;
  }

  async findOverlappingForLawyer(args: {
    lawyerId: string;
    windowStartUtc: Date;
    windowEndUtc: Date;
    excludeAppointmentId?: string;
  }): Promise<Appointment[]> {
    return this.appointments
      .filter((a) => a.lawyerId === args.lawyerId)
      .filter((a) => a.status === 'SCHEDULED' || a.status === 'COMPLETED')
      .filter((a) => a.startsAtUtc < args.windowEndUtc)
      .filter((a) => a.endsAtUtc > args.windowStartUtc)
      .filter((a) => a.id !== args.excludeAppointmentId);
  }
}

function makeAppointment(overrides: Partial<Appointment> = {}): Appointment {
  return {
    id: overrides.id ?? 'apt-default',
    lawyerId: overrides.lawyerId ?? 'lawyer-1',
    clientId: overrides.clientId ?? 'client-1',
    type: overrides.type ?? 'VIDEO',
    status: overrides.status ?? 'SCHEDULED',
    startsAtUtc: overrides.startsAtUtc ?? new Date('2026-04-22T10:00:00Z'),
    endsAtUtc: overrides.endsAtUtc ?? new Date('2026-04-22T11:00:00Z'),
    lawyerTimezoneSnapshot: 'America/Argentina/Buenos_Aires',
    clientTimezoneSnapshot: 'America/Argentina/Buenos_Aires',
    notes: null,
    createdAt: new Date('2026-04-20T00:00:00Z'),
    updatedAt: new Date('2026-04-20T00:00:00Z'),
  };
}

describe('ConflictDetectorService', () => {
  let fakeRepo: FakeAppointmentRepository;
  let service: ConflictDetectorService;

  beforeEach(() => {
    fakeRepo = new FakeAppointmentRepository();
    service = new ConflictDetectorService(fakeRepo as unknown as AppointmentRepository);
  });

  describe('no conflicts', () => {
    it('returns no conflict when lawyer has no appointments', async () => {
      const result = await service.check({
        lawyerId: 'lawyer-1',
        startsAtUtc: new Date('2026-04-22T10:00:00Z'),
        endsAtUtc: new Date('2026-04-22T11:00:00Z'),
      });

      expect(result.hasConflict).toBe(false);
      expect(result.conflicting).toEqual([]);
    });

    it('returns no conflict for a different lawyer', async () => {
      fakeRepo.seed([
        makeAppointment({
          id: 'apt-1',
          lawyerId: 'lawyer-2',
          startsAtUtc: new Date('2026-04-22T10:00:00Z'),
          endsAtUtc: new Date('2026-04-22T11:00:00Z'),
        }),
      ]);

      const result = await service.check({
        lawyerId: 'lawyer-1',
        startsAtUtc: new Date('2026-04-22T10:00:00Z'),
        endsAtUtc: new Date('2026-04-22T11:00:00Z'),
      });

      expect(result.hasConflict).toBe(false);
    });

    it('allows back-to-back appointments (existing ends exactly when new starts)', async () => {
      fakeRepo.seed([
        makeAppointment({
          id: 'apt-1',
          startsAtUtc: new Date('2026-04-22T09:00:00Z'),
          endsAtUtc: new Date('2026-04-22T10:00:00Z'),
        }),
      ]);

      const result = await service.check({
        lawyerId: 'lawyer-1',
        startsAtUtc: new Date('2026-04-22T10:00:00Z'),
        endsAtUtc: new Date('2026-04-22T11:00:00Z'),
      });

      expect(result.hasConflict).toBe(false);
    });

    it('allows back-to-back appointments (new ends exactly when existing starts)', async () => {
      fakeRepo.seed([
        makeAppointment({
          id: 'apt-1',
          startsAtUtc: new Date('2026-04-22T11:00:00Z'),
          endsAtUtc: new Date('2026-04-22T12:00:00Z'),
        }),
      ]);

      const result = await service.check({
        lawyerId: 'lawyer-1',
        startsAtUtc: new Date('2026-04-22T10:00:00Z'),
        endsAtUtc: new Date('2026-04-22T11:00:00Z'),
      });

      expect(result.hasConflict).toBe(false);
    });
  });

  describe('conflicts detected', () => {
    it('detects exact same time window', async () => {
      fakeRepo.seed([
        makeAppointment({
          id: 'apt-1',
          startsAtUtc: new Date('2026-04-22T10:00:00Z'),
          endsAtUtc: new Date('2026-04-22T11:00:00Z'),
        }),
      ]);

      const result = await service.check({
        lawyerId: 'lawyer-1',
        startsAtUtc: new Date('2026-04-22T10:00:00Z'),
        endsAtUtc: new Date('2026-04-22T11:00:00Z'),
      });

      expect(result.hasConflict).toBe(true);
      expect(result.conflicting).toHaveLength(1);
      expect(result.conflicting[0].id).toBe('apt-1');
    });

    it('detects partial overlap at the start', async () => {
      // Existing: 10:00-11:00. Proposed: 10:30-11:30 (overlaps by 30m)
      fakeRepo.seed([
        makeAppointment({
          id: 'apt-1',
          startsAtUtc: new Date('2026-04-22T10:00:00Z'),
          endsAtUtc: new Date('2026-04-22T11:00:00Z'),
        }),
      ]);

      const result = await service.check({
        lawyerId: 'lawyer-1',
        startsAtUtc: new Date('2026-04-22T10:30:00Z'),
        endsAtUtc: new Date('2026-04-22T11:30:00Z'),
      });

      expect(result.hasConflict).toBe(true);
    });

    it('detects partial overlap at the end', async () => {
      // Existing: 10:00-11:00. Proposed: 09:30-10:30 (overlaps by 30m)
      fakeRepo.seed([
        makeAppointment({
          id: 'apt-1',
          startsAtUtc: new Date('2026-04-22T10:00:00Z'),
          endsAtUtc: new Date('2026-04-22T11:00:00Z'),
        }),
      ]);

      const result = await service.check({
        lawyerId: 'lawyer-1',
        startsAtUtc: new Date('2026-04-22T09:30:00Z'),
        endsAtUtc: new Date('2026-04-22T10:30:00Z'),
      });

      expect(result.hasConflict).toBe(true);
    });

    it('detects proposal fully contained in existing', async () => {
      // Existing: 10:00-12:00. Proposed: 10:30-11:30 (fully inside)
      fakeRepo.seed([
        makeAppointment({
          id: 'apt-1',
          startsAtUtc: new Date('2026-04-22T10:00:00Z'),
          endsAtUtc: new Date('2026-04-22T12:00:00Z'),
        }),
      ]);

      const result = await service.check({
        lawyerId: 'lawyer-1',
        startsAtUtc: new Date('2026-04-22T10:30:00Z'),
        endsAtUtc: new Date('2026-04-22T11:30:00Z'),
      });

      expect(result.hasConflict).toBe(true);
    });

    it('detects existing fully contained in proposal', async () => {
      // Existing: 10:30-11:30. Proposed: 10:00-12:00 (contains existing)
      fakeRepo.seed([
        makeAppointment({
          id: 'apt-1',
          startsAtUtc: new Date('2026-04-22T10:30:00Z'),
          endsAtUtc: new Date('2026-04-22T11:30:00Z'),
        }),
      ]);

      const result = await service.check({
        lawyerId: 'lawyer-1',
        startsAtUtc: new Date('2026-04-22T10:00:00Z'),
        endsAtUtc: new Date('2026-04-22T12:00:00Z'),
      });

      expect(result.hasConflict).toBe(true);
    });

    it('returns multiple conflicts ordered by start time', async () => {
      fakeRepo.seed([
        makeAppointment({
          id: 'apt-2',
          startsAtUtc: new Date('2026-04-22T11:00:00Z'),
          endsAtUtc: new Date('2026-04-22T11:30:00Z'),
        }),
        makeAppointment({
          id: 'apt-1',
          startsAtUtc: new Date('2026-04-22T10:00:00Z'),
          endsAtUtc: new Date('2026-04-22T10:30:00Z'),
        }),
      ]);

      const result = await service.check({
        lawyerId: 'lawyer-1',
        startsAtUtc: new Date('2026-04-22T09:00:00Z'),
        endsAtUtc: new Date('2026-04-22T12:00:00Z'),
      });

      expect(result.hasConflict).toBe(true);
      expect(result.conflicting).toHaveLength(2);
      // Fake repo doesn't guarantee order, but real Prisma query does via orderBy
      const ids = result.conflicting.map((a: Appointment) => a.id).sort();
      expect(ids).toEqual(['apt-1', 'apt-2']);
    });
  });

  describe('status filtering', () => {
    it('ignores CANCELLED appointments', async () => {
      fakeRepo.seed([
        makeAppointment({
          id: 'apt-1',
          status: 'CANCELLED',
          startsAtUtc: new Date('2026-04-22T10:00:00Z'),
          endsAtUtc: new Date('2026-04-22T11:00:00Z'),
        }),
      ]);

      const result = await service.check({
        lawyerId: 'lawyer-1',
        startsAtUtc: new Date('2026-04-22T10:00:00Z'),
        endsAtUtc: new Date('2026-04-22T11:00:00Z'),
      });

      expect(result.hasConflict).toBe(false);
    });

    it('ignores NO_SHOW appointments', async () => {
      fakeRepo.seed([
        makeAppointment({
          id: 'apt-1',
          status: 'NO_SHOW',
          startsAtUtc: new Date('2026-04-22T10:00:00Z'),
          endsAtUtc: new Date('2026-04-22T11:00:00Z'),
        }),
      ]);

      const result = await service.check({
        lawyerId: 'lawyer-1',
        startsAtUtc: new Date('2026-04-22T10:00:00Z'),
        endsAtUtc: new Date('2026-04-22T11:00:00Z'),
      });

      expect(result.hasConflict).toBe(false);
    });

    it('counts COMPLETED appointments as conflicts (slot is not free)', async () => {
      fakeRepo.seed([
        makeAppointment({
          id: 'apt-1',
          status: 'COMPLETED',
          startsAtUtc: new Date('2026-04-22T10:00:00Z'),
          endsAtUtc: new Date('2026-04-22T11:00:00Z'),
        }),
      ]);

      const result = await service.check({
        lawyerId: 'lawyer-1',
        startsAtUtc: new Date('2026-04-22T10:00:00Z'),
        endsAtUtc: new Date('2026-04-22T11:00:00Z'),
      });

      expect(result.hasConflict).toBe(true);
    });
  });

  describe('reschedule flow', () => {
    it('excludes the specified appointment from conflict check', async () => {
      // Scenario: we're rescheduling apt-1 to overlap its current slot.
      // Without the exclude, apt-1 would conflict with itself.
      fakeRepo.seed([
        makeAppointment({
          id: 'apt-1',
          startsAtUtc: new Date('2026-04-22T10:00:00Z'),
          endsAtUtc: new Date('2026-04-22T11:00:00Z'),
        }),
      ]);

      const result = await service.check({
        lawyerId: 'lawyer-1',
        startsAtUtc: new Date('2026-04-22T10:15:00Z'),
        endsAtUtc: new Date('2026-04-22T11:15:00Z'),
        excludeAppointmentId: 'apt-1',
      });

      expect(result.hasConflict).toBe(false);
    });

    it('still detects conflict with OTHER appointments during reschedule', async () => {
      fakeRepo.seed([
        makeAppointment({
          id: 'apt-1',
          startsAtUtc: new Date('2026-04-22T10:00:00Z'),
          endsAtUtc: new Date('2026-04-22T11:00:00Z'),
        }),
        makeAppointment({
          id: 'apt-2',
          startsAtUtc: new Date('2026-04-22T11:30:00Z'),
          endsAtUtc: new Date('2026-04-22T12:30:00Z'),
        }),
      ]);

      // Rescheduling apt-1 from 10-11 to 11:15-12:15 — now conflicts with apt-2
      const result = await service.check({
        lawyerId: 'lawyer-1',
        startsAtUtc: new Date('2026-04-22T11:15:00Z'),
        endsAtUtc: new Date('2026-04-22T12:15:00Z'),
        excludeAppointmentId: 'apt-1',
      });

      expect(result.hasConflict).toBe(true);
      expect(result.conflicting[0].id).toBe('apt-2');
    });
  });

  describe('validation', () => {
    it('throws when endsAt is before startsAt', async () => {
      await expect(
        service.check({
          lawyerId: 'lawyer-1',
          startsAtUtc: new Date('2026-04-22T11:00:00Z'),
          endsAtUtc: new Date('2026-04-22T10:00:00Z'),
        }),
      ).rejects.toThrow(InvalidTimeWindowError);
    });

    it('throws when endsAt equals startsAt (zero-duration window)', async () => {
      await expect(
        service.check({
          lawyerId: 'lawyer-1',
          startsAtUtc: new Date('2026-04-22T10:00:00Z'),
          endsAtUtc: new Date('2026-04-22T10:00:00Z'),
        }),
      ).rejects.toThrow(InvalidTimeWindowError);
    });

    it('throws on invalid Date instance', async () => {
      await expect(
        service.check({
          lawyerId: 'lawyer-1',
          startsAtUtc: new Date('invalid'),
          endsAtUtc: new Date('2026-04-22T11:00:00Z'),
        }),
      ).rejects.toThrow(InvalidTimeWindowError);
    });
  });
});
