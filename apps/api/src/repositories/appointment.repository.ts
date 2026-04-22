import type { PrismaClient, Appointment } from '@prisma/client';

/**
 * Data-access boundary for appointments. Wraps Prisma so the service
 * layer never imports the ORM directly — this preserves testability
 * (services can be unit-tested with a fake repository) and lets us
 * swap Prisma without touching business logic.
 *
 * All timestamp parameters and return values are UTC Date instants.
 */
export class AppointmentRepository {
  constructor(private readonly prisma: PrismaClient) {}

  /**
   * Returns appointments for a lawyer that could potentially overlap
   * the given UTC window. "Could potentially" here means:
   *   - The appointment starts before the window ends
   *   - AND the appointment ends after the window starts
   *
   * Cancelled and NO_SHOW appointments are excluded — those time slots
   * are considered free.
   *
   * Optionally excludes a specific appointment ID — used during
   * reschedule, so the appointment being updated doesn't conflict
   * with its own existing database row.
   */
  async findOverlappingForLawyer(args: {
    lawyerId: string;
    windowStartUtc: Date;
    windowEndUtc: Date;
    excludeAppointmentId?: string;
  }): Promise<Appointment[]> {
    return this.prisma.appointment.findMany({
      where: {
        lawyerId: args.lawyerId,
        status: { in: ['SCHEDULED', 'COMPLETED'] },
        startsAtUtc: { lt: args.windowEndUtc },
        endsAtUtc: { gt: args.windowStartUtc },
        ...(args.excludeAppointmentId
          ? { id: { not: args.excludeAppointmentId } }
          : {}),
      },
      orderBy: { startsAtUtc: 'asc' },
    });
  }
}
