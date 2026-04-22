import { describe, it, expect, beforeEach } from 'vitest';
import type { Appointment, Client } from '@prisma/client';
import { AppointmentType, AppointmentStatus } from '@legal-appointments/shared';
import {
  AppointmentService,
  AppointmentNotFoundError,
  AppointmentInPastError,
  AppointmentConflictError,
  AppointmentPartyNotFoundError,
} from '../../src/services/appointment.service';
import type { AppointmentRepository, AppointmentWithRelations, CreateAppointmentData, UpdateAppointmentData } from '../../src/repositories/appointment.repository';
import type { LawyerRepository, LawyerWithCountry } from '../../src/repositories/lawyer.repository';
import type { ClientRepository } from '../../src/repositories/client.repository';
import type { ConflictDetectorService, ConflictCheckResult } from '../../src/services/conflict-detector.service';
import { TimezoneService } from '../../src/services/timezone.service';
import { FixedClock } from '../../src/clock';

// ─── Fakes ────────────────────────────────────────────────────────────────────

class FakeAppointmentRepo implements Pick<AppointmentRepository,
  'findById' | 'findForLawyerInWindow' | 'findOverlappingForLawyer' | 'create' | 'update'
> {
  private store: AppointmentWithRelations[] = [];
  private idCounter = 1;

  seed(appointments: AppointmentWithRelations[]): void {
    this.store = [...appointments];
  }

  async findById(id: string): Promise<AppointmentWithRelations | null> {
    return this.store.find((a) => a.id === id) ?? null;
  }

  async findForLawyerInWindow(args: {
    lawyerId: string;
    windowStartUtc: Date;
    windowEndUtc: Date;
  }): Promise<AppointmentWithRelations[]> {
    return this.store.filter(
      (a) =>
        a.lawyerId === args.lawyerId &&
        a.startsAtUtc < args.windowEndUtc &&
        a.endsAtUtc > args.windowStartUtc,
    );
  }

  async findOverlappingForLawyer(): Promise<Appointment[]> {
    return [];
  }

  async create(data: CreateAppointmentData): Promise<AppointmentWithRelations> {
    const created: AppointmentWithRelations = {
      ...data,
      id: `apt-${this.idCounter++}`,
      notes: data.notes ?? null,
      createdAt: new Date(),
      updatedAt: new Date(),
      lawyer: { id: data.lawyerId, fullName: 'Test Lawyer', timezone: 'America/Argentina/Buenos_Aires' },
      client: { id: data.clientId, fullName: 'Test Client', timezone: 'America/Los_Angeles' },
    };
    this.store.push(created);
    return created;
  }

  async update(id: string, data: UpdateAppointmentData): Promise<AppointmentWithRelations> {
    const apt = this.store.find((a) => a.id === id);
    if (!apt) throw new Error('Not found in fake');
    Object.assign(apt, data, { updatedAt: new Date() });
    return apt;
  }
}

class FakeLawyerRepo implements Pick<LawyerRepository, 'findById'> {
  private lawyers: LawyerWithCountry[] = [];

  seed(lawyers: LawyerWithCountry[]): void {
    this.lawyers = [...lawyers];
  }

  async findById(id: string): Promise<LawyerWithCountry | null> {
    return this.lawyers.find((l) => l.id === id) ?? null;
  }
}

class FakeClientRepo implements Pick<ClientRepository, 'findById'> {
  private clients: Client[] = [];

  seed(clients: Client[]): void {
    this.clients = [...clients];
  }

  async findById(id: string): Promise<Client | null> {
    return this.clients.find((c) => c.id === id) ?? null;
  }
}

/** Fake conflict detector — configurable per test. */
class FakeConflictDetector implements Pick<ConflictDetectorService, 'check'> {
  private result: ConflictCheckResult = { hasConflict: false, conflicting: [] };

  willReturn(result: ConflictCheckResult): void {
    this.result = result;
  }

  async check(): Promise<ConflictCheckResult> {
    return this.result;
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const FROZEN_NOW = '2026-04-22T10:00:00Z';

function makeLawyer(id = 'lawyer-1'): LawyerWithCountry {
  return {
    id,
    fullName: 'Test Lawyer',
    email: `${id}@test.com`,
    timezone: 'America/Argentina/Buenos_Aires',
    specialties: [],
    countryId: 1,
    createdAt: new Date('2026-01-01Z'),
    updatedAt: new Date('2026-01-01Z'),
    country: { id: 1, code: 'AR', name: 'Argentina', defaultTimezone: 'America/Argentina/Buenos_Aires' },
  };
}

function makeClient(id = 'client-1'): Client {
  return {
    id,
    fullName: 'Test Client',
    email: `${id}@test.com`,
    phone: null,
    timezone: 'America/Los_Angeles',
    createdAt: new Date('2026-01-01Z'),
  };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('AppointmentService', () => {
  let aptRepo: FakeAppointmentRepo;
  let lawyerRepo: FakeLawyerRepo;
  let clientRepo: FakeClientRepo;
  let conflictDetector: FakeConflictDetector;
  let clock: FixedClock;
  let service: AppointmentService;

  beforeEach(() => {
    aptRepo = new FakeAppointmentRepo();
    lawyerRepo = new FakeLawyerRepo();
    clientRepo = new FakeClientRepo();
    conflictDetector = new FakeConflictDetector();
    clock = new FixedClock(FROZEN_NOW);

    lawyerRepo.seed([makeLawyer()]);
    clientRepo.seed([makeClient()]);

    service = new AppointmentService(
      aptRepo as unknown as AppointmentRepository,
      lawyerRepo as unknown as LawyerRepository,
      clientRepo as unknown as ClientRepository,
      conflictDetector as unknown as ConflictDetectorService,
      new TimezoneService(),
      clock,
    );
  });

  describe('create', () => {
    const futureInput = {
      lawyerId: 'lawyer-1',
      clientId: 'client-1',
      type: AppointmentType.VIDEO,
      // 24 hours in the future relative to FROZEN_NOW
      startsAtUtc: '2026-04-23T10:00:00Z',
      endsAtUtc: '2026-04-23T11:00:00Z',
    };

    it('creates an appointment with all valid inputs', async () => {
      const result = await service.create(futureInput);
      expect(result.lawyerId).toBe('lawyer-1');
      expect(result.clientId).toBe('client-1');
      expect(result.status).toBe('SCHEDULED');
    });

    it('captures timezone snapshots at booking time', async () => {
      const result = await service.create(futureInput);
      // Lawyer timezone comes from the entity at booking time
      expect(result.lawyerTimezoneSnapshot).toBe('America/Argentina/Buenos_Aires');
      // Client timezone comes from the client entity
      expect(result.clientTimezoneSnapshot).toBe('America/Los_Angeles');
    });

    it('rejects appointment starting in the past', async () => {
      await expect(
        service.create({
          ...futureInput,
          startsAtUtc: '2026-04-21T10:00:00Z', // before FROZEN_NOW
          endsAtUtc: '2026-04-21T11:00:00Z',
        }),
      ).rejects.toThrow(AppointmentInPastError);
    });

    it('rejects when lawyer does not exist', async () => {
      await expect(
        service.create({ ...futureInput, lawyerId: 'nonexistent' }),
      ).rejects.toThrow(AppointmentPartyNotFoundError);
    });

    it('rejects when client does not exist', async () => {
      await expect(
        service.create({ ...futureInput, clientId: 'nonexistent' }),
      ).rejects.toThrow(AppointmentPartyNotFoundError);
    });

    it('rejects when conflict detector reports a conflict', async () => {
      conflictDetector.willReturn({
        hasConflict: true,
        conflicting: [{ id: 'apt-existing' } as Appointment],
      });

      await expect(service.create(futureInput)).rejects.toThrow(AppointmentConflictError);
    });

    it('the conflict error carries conflicting appointment IDs', async () => {
      conflictDetector.willReturn({
        hasConflict: true,
        conflicting: [{ id: 'apt-x' } as Appointment, { id: 'apt-y' } as Appointment],
      });

      try {
        await service.create(futureInput);
        expect.fail('should have thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(AppointmentConflictError);
        expect((err as AppointmentConflictError).conflictingIds).toEqual(['apt-x', 'apt-y']);
      }
    });
  });

  describe('update', () => {
    beforeEach(() => {
      aptRepo.seed([{
        id: 'apt-1',
        lawyerId: 'lawyer-1',
        clientId: 'client-1',
        type: AppointmentType.VIDEO,
        status: AppointmentStatus.SCHEDULED,
        startsAtUtc: new Date('2026-04-23T10:00:00Z'),
        endsAtUtc: new Date('2026-04-23T11:00:00Z'),
        lawyerTimezoneSnapshot: 'America/Argentina/Buenos_Aires',
        clientTimezoneSnapshot: 'America/Los_Angeles',
        notes: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        lawyer: { id: 'lawyer-1', fullName: 'Test Lawyer', timezone: 'America/Argentina/Buenos_Aires' },
        client: { id: 'client-1', fullName: 'Test Client', timezone: 'America/Los_Angeles' },
      }]);
    });

    it('updates status without conflict check', async () => {
      const result = await service.update('apt-1', { status: AppointmentStatus.COMPLETED });
      expect(result.status).toBe(AppointmentStatus.COMPLETED);
    });

    it('throws AppointmentNotFoundError for missing appointment', async () => {
      await expect(service.update('nonexistent', { status: AppointmentStatus.CANCELLED }))
        .rejects.toThrow(AppointmentNotFoundError);
    });

    it('rejects reschedule to a past time', async () => {
      await expect(
        service.update('apt-1', { startsAtUtc: '2026-04-20T10:00:00Z', endsAtUtc: '2026-04-20T11:00:00Z' }),
      ).rejects.toThrow(AppointmentInPastError);
    });

    it('rejects reschedule when conflict detected', async () => {
      conflictDetector.willReturn({
        hasConflict: true,
        conflicting: [{ id: 'apt-2' } as Appointment],
      });

      await expect(
        service.update('apt-1', {
          startsAtUtc: '2026-04-23T14:00:00Z',
          endsAtUtc: '2026-04-23T15:00:00Z',
        }),
      ).rejects.toThrow(AppointmentConflictError);
    });
  });

  describe('getById', () => {
    it('returns the appointment when found', async () => {
      aptRepo.seed([{
        id: 'apt-1',
        lawyerId: 'lawyer-1',
        clientId: 'client-1',
        type: AppointmentType.VIDEO,
        status: AppointmentStatus.SCHEDULED,
        startsAtUtc: new Date('2026-04-23T10:00:00Z'),
        endsAtUtc: new Date('2026-04-23T11:00:00Z'),
        lawyerTimezoneSnapshot: 'America/Argentina/Buenos_Aires',
        clientTimezoneSnapshot: 'America/Los_Angeles',
        notes: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        lawyer: { id: 'lawyer-1', fullName: 'Test Lawyer', timezone: 'America/Argentina/Buenos_Aires' },
        client: { id: 'client-1', fullName: 'Test Client', timezone: 'America/Los_Angeles' },
      }]);

      const result = await service.getById('apt-1');
      expect(result.id).toBe('apt-1');
    });

    it('throws AppointmentNotFoundError when missing', async () => {
      await expect(service.getById('nonexistent'))
        .rejects.toThrow(AppointmentNotFoundError);
    });
  });

  describe('Clock integration', () => {
    it('uses the injected clock — different clock = different behavior', async () => {
      // Past clock: now = far future, so any future appointment is "in the past"
      const farFutureClock = new FixedClock('2030-01-01T00:00:00Z');
      const strictService = new AppointmentService(
        aptRepo as unknown as AppointmentRepository,
        lawyerRepo as unknown as LawyerRepository,
        clientRepo as unknown as ClientRepository,
        conflictDetector as unknown as ConflictDetectorService,
        new TimezoneService(),
        farFutureClock,
      );

      await expect(
        strictService.create({
          lawyerId: 'lawyer-1',
          clientId: 'client-1',
          type: AppointmentType.VIDEO,
          startsAtUtc: '2026-04-23T10:00:00Z',  // in the past from clock's perspective
          endsAtUtc: '2026-04-23T11:00:00Z',
        }),
      ).rejects.toThrow(AppointmentInPastError);
    });
  });
});
