import type { Appointment } from '@prisma/client';
import type { AppointmentRepository } from '../repositories/appointment.repository';

export interface ConflictCheckRequest {
  lawyerId: string;
  startsAtUtc: Date;
  endsAtUtc: Date;
  /** Set during reschedule to exclude the appointment being modified. */
  excludeAppointmentId?: string;
}

export interface ConflictCheckResult {
  hasConflict: boolean;
  conflicting: Appointment[];
}

/**
 * Determines whether a proposed appointment time window conflicts
 * with existing appointments for the same lawyer.
 *
 * Overlap semantics: half-open intervals [start, end).
 *   - Back-to-back appointments (A ends 10:00, B starts 10:00) are legal
 *   - Strict overlap (A: 10-11, B: 10:30-11:30) is a conflict
 *
 * Status filter: only SCHEDULED and COMPLETED appointments count.
 * CANCELLED and NO_SHOW appointments free their time slots.
 */
export class ConflictDetectorService {
  constructor(
    private readonly appointmentRepo: AppointmentRepository,
  ) {}

  async check(request: ConflictCheckRequest): Promise<ConflictCheckResult> {
    this.validateWindow(request.startsAtUtc, request.endsAtUtc);

    const candidates = await this.appointmentRepo.findOverlappingForLawyer({
      lawyerId: request.lawyerId,
      windowStartUtc: request.startsAtUtc,
      windowEndUtc: request.endsAtUtc,
      excludeAppointmentId: request.excludeAppointmentId,
    });

    // The repository query uses < / > (strict), which implements
    // half-open overlap semantics. No further filtering needed —
    // returned candidates are exactly the real conflicts.
    return {
      hasConflict: candidates.length > 0,
      conflicting: candidates,
    };
  }

  private validateWindow(startsAtUtc: Date, endsAtUtc: Date): void {
    if (Number.isNaN(startsAtUtc.getTime()) || Number.isNaN(endsAtUtc.getTime())) {
      throw new InvalidTimeWindowError('start and end must be valid dates');
    }
    if (endsAtUtc.getTime() <= startsAtUtc.getTime()) {
      throw new InvalidTimeWindowError('endsAtUtc must be strictly after startsAtUtc');
    }
  }
}

export class InvalidTimeWindowError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidTimeWindowError';
  }
}
