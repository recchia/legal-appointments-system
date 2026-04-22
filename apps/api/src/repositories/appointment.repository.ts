import type { PrismaClient, Appointment, AppointmentType, AppointmentStatus } from '@prisma/client';

export interface AppointmentWithRelations extends Appointment {
  lawyer: { id: string; fullName: string; timezone: string };
  client: { id: string; fullName: string; timezone: string };
}

export interface CreateAppointmentData {
  lawyerId: string;
  clientId: string;
  type: AppointmentType;
  status: AppointmentStatus;
  startsAtUtc: Date;
  endsAtUtc: Date;
  lawyerTimezoneSnapshot: string;
  clientTimezoneSnapshot: string;
  notes?: string;
}

export interface UpdateAppointmentData {
  status?: AppointmentStatus;
  startsAtUtc?: Date;
  endsAtUtc?: Date;
  notes?: string;
}

export class AppointmentRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findById(id: string): Promise<AppointmentWithRelations | null> {
    return this.prisma.appointment.findUnique({
      where: { id },
      include: {
        lawyer: { select: { id: true, fullName: true, timezone: true } },
        client: { select: { id: true, fullName: true, timezone: true } },
      },
    });
  }

  /**
   * Calendar view: appointments for a lawyer within a UTC window.
   * Returns them ordered chronologically.
   */
  async findForLawyerInWindow(args: {
    lawyerId: string;
    windowStartUtc: Date;
    windowEndUtc: Date;
  }): Promise<AppointmentWithRelations[]> {
    return this.prisma.appointment.findMany({
      where: {
        lawyerId: args.lawyerId,
        startsAtUtc: { lt: args.windowEndUtc },
        endsAtUtc: { gt: args.windowStartUtc },
      },
      include: {
        lawyer: { select: { id: true, fullName: true, timezone: true } },
        client: { select: { id: true, fullName: true, timezone: true } },
      },
      orderBy: { startsAtUtc: 'asc' },
    });
  }

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

  async create(data: CreateAppointmentData): Promise<AppointmentWithRelations> {
    return this.prisma.appointment.create({
      data,
      include: {
        lawyer: { select: { id: true, fullName: true, timezone: true } },
        client: { select: { id: true, fullName: true, timezone: true } },
      },
    });
  }

  async update(
    id: string,
    data: UpdateAppointmentData,
  ): Promise<AppointmentWithRelations> {
    return this.prisma.appointment.update({
      where: { id },
      data,
      include: {
        lawyer: { select: { id: true, fullName: true, timezone: true } },
        client: { select: { id: true, fullName: true, timezone: true } },
      },
    });
  }
}
