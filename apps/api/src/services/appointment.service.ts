import type { Appointment } from '@prisma/client';
import type { AppointmentType, AppointmentStatus } from '@legal-appointments/shared';
import type { AppointmentRepository, AppointmentWithRelations, CreateAppointmentData } from '../repositories/appointment.repository';
import type { LawyerRepository } from '../repositories/lawyer.repository';
import type { ClientRepository } from '../repositories/client.repository';
import type { ConflictDetectorService } from './conflict-detector.service';
import type { TimezoneService } from './timezone.service';
import type { Clock } from '../clock';

export interface CreateAppointmentInput {
  lawyerId: string;
  clientId: string;
  type: AppointmentType;
  startsAtUtc: string;  // naive ISO string from HTTP layer
  endsAtUtc: string;
  notes?: string;
}

export interface UpdateAppointmentInput {
  status?: AppointmentStatus;
  startsAtUtc?: string;
  endsAtUtc?: string;
  notes?: string;
}

export interface CalendarQuery {
  from: string;  // ISO string
  to: string;
}

/**
 * Orchestrates appointment lifecycle.
 *
 * Business rules are enforced here:
1. Lawyers *  must exist
 * 2. Client must exist
 * 3. Appointment cannot be in the past (relative to Clock.now())
 * 4. Lawyer has no conflicting appointment in the window
 * 5. Timezone snapshots are captured at booking time from the entity state
 */
export class AppointmentService {
  constructor(
    private readonly appointmentRepo: AppointmentRepository,
    private readonly lawyerRepo: LawyerRepository,
    private readonly clientRepo: ClientRepository,
    private readonly conflictDetector: ConflictDetectorService,
    private readonly timezones: TimezoneService,
    private readonly clock: Clock,
  ) {}

  async create(input: CreateAppointmentInput): Promise<AppointmentWithRelations> {
    const startsAt = new Date(input.startsAtUtc);
    const endsAt = new Date(input.endsAtUtc);

    // Rule 1: times are valid
    if (isNaN(startsAt.getTime()) || isNaN(endsAt.getTime())) {
      throw new InvalidAppointmentError('Invalid start or end time');
    }
    if (endsAt <= startsAt) {
      throw new InvalidAppointmentError('endsAtUtc must be after startsAtUtc');
    }

    // Rule 2: appointment cannot start in the past
    if (startsAt < this.clock.now()) {
      throw new AppointmentInPastError(startsAt);
    }

    // Rule 3: lawyer must exist
    const lawyer = await this.lawyerRepo.findById(input.lawyerId);
    if (!lawyer) throw new AppointmentPartyNotFoundError('lawyer', input.lawyerId);

    // Rule 4: client must exist
    const client = await this.clientRepo.findById(input.clientId);
    if (!client) throw new AppointmentPartyNotFoundError('client', input.clientId);

    // Rule 5: no conflict
    const conflict = await this.conflictDetector.check({
      lawyerId: input.lawyerId,
      startsAtUtc: startsAt,
      endsAtUtc: endsAt,
    });
    if (conflict.hasConflict) {
      throw new AppointmentConflictError(
        conflict.conflicting.map((a: Appointment) => a.id)
      );
    }

    // Snapshot timezones at booking time — preserved even if the lawyer / client
    // changes their timezone later. See ADR-003.
    const data: CreateAppointmentData = {
      lawyerId: input.lawyerId,
      clientId: input.clientId,
      type: input.type,
      status: 'SCHEDULED',
      startsAtUtc: startsAt,
      endsAtUtc: endsAt,
      lawyerTimezoneSnapshot: lawyer.timezone,
      clientTimezoneSnapshot: client.timezone,
      notes: input.notes,
    };

    return this.appointmentRepo.create(data);
  }

  async update(
    id: string,
    input: UpdateAppointmentInput,
  ): Promise<AppointmentWithRelations> {
    const existing = await this.appointmentRepo.findById(id);
    if (!existing) throw new AppointmentNotFoundError(id);

    // If rescheduling, check the new window for conflicts
    if (input.startsAtUtc || input.endsAtUtc) {
      const startsAt = input.startsAtUtc
        ? new Date(input.startsAtUtc)
        : existing.startsAtUtc;
      const endsAt = input.endsAtUtc
        ? new Date(input.endsAtUtc)
        : existing.endsAtUtc;

      if (startsAt < this.clock.now()) {
        throw new AppointmentInPastError(startsAt);
      }

      const conflict = await this.conflictDetector.check({
        lawyerId: existing.lawyerId,
        startsAtUtc: startsAt,
        endsAtUtc: endsAt,
        excludeAppointmentId: id,
      });
      if (conflict.hasConflict) {
        throw new AppointmentConflictError(
          conflict.conflicting.map((a: Appointment) => a.id)
        );
      }
    }

    return this.appointmentRepo.update(id, {
      status: input.status,
      startsAtUtc: input.startsAtUtc ? new Date(input.startsAtUtc) : undefined,
      endsAtUtc: input.endsAtUtc ? new Date(input.endsAtUtc) : undefined,
      notes: input.notes,
    });
  }

  async getCalendar(
    lawyerId: string,
    query: CalendarQuery,
  ): Promise<AppointmentWithRelations[]> {
    const lawyer = await this.lawyerRepo.findById(lawyerId);
    if (!lawyer) throw new AppointmentPartyNotFoundError('lawyer', lawyerId);

    return this.appointmentRepo.findForLawyerInWindow({
      lawyerId,
      windowStartUtc: new Date(query.from),
      windowEndUtc: new Date(query.to),
    });
  }

  async getById(id: string): Promise<AppointmentWithRelations> {
    const appointment = await this.appointmentRepo.findById(id);
    if (!appointment) throw new AppointmentNotFoundError(id);
    return appointment;
  }
}

// Typed domain errors — each maps to a specific HTTP status in the controller
export class AppointmentNotFoundError extends Error {
  constructor(public readonly appointmentId: string) {
    super(`Appointment not found: ${appointmentId}`);
    this.name = 'AppointmentNotFoundError';
  }
}

export class AppointmentInPastError extends Error {
  constructor(public readonly startsAt: Date) {
    super(`Appointment cannot start in the past: ${startsAt.toISOString()}`);
    this.name = 'AppointmentInPastError';
  }
}

export class AppointmentConflictError extends Error {
  constructor(public readonly conflictingIds: string[]) {
    super(`Appointment conflicts with: ${conflictingIds.join(', ')}`);
    this.name = 'AppointmentConflictError';
  }
}

export class AppointmentPartyNotFoundError extends Error {
  constructor(
    public readonly party: 'lawyer' | 'client',
    public readonly id: string,
  ) {
    super(`${party} not found: ${id}`);
    this.name = 'AppointmentPartyNotFoundError';
  }
}

export class InvalidAppointmentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidAppointmentError';
  }
}
