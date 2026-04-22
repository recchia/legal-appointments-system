import { z } from 'zod';

// IANA timezone validator - basic check, we'll refine in TimezoneService
const IANA_TIMEZONE_REGEX = /^[A-Z][A-Za-z_]+(?:\/[A-Z][A-Za-z_]+)+$/;

const isoDateTime = z
  .string()
  .datetime({ offset: true, message: 'must be ISO 8601 with timezone offset' });

export const createAppointmentSchema = z
  .object({
    lawyerId: z.string().uuid({ message: 'lawyerId must be a valid UUID' }),
    clientId: z.string().uuid({ message: 'clientId must be a valid UUID' }),
    type: z.enum(['IN_PERSON', 'VIDEO', 'PHONE'], {
      errorMap: () => ({ message: 'type must be IN_PERSON, VIDEO, or PHONE' }),
    }),
    startsAtUtc: isoDateTime,
    endsAtUtc: isoDateTime,
    notes: z.string().max(1000).optional(),
  })
  .refine(
    (data) => new Date(data.endsAtUtc) > new Date(data.startsAtUtc),
    { message: 'endsAtUtc must be after startsAtUtc', path: ['endsAtUtc'] },
  );

export type CreateAppointmentInput = z.infer<typeof createAppointmentSchema>;

export const updateAppointmentSchema = z
  .object({
    startsAtUtc: isoDateTime.optional(),
    endsAtUtc: isoDateTime.optional(),
    status: z.enum(['SCHEDULED', 'COMPLETED', 'CANCELLED', 'NO_SHOW']).optional(),
    notes: z.string().max(1000).optional(),
  })
  .refine(
    (data) => {
      if (data.startsAtUtc && data.endsAtUtc) {
        return new Date(data.endsAtUtc) > new Date(data.startsAtUtc);
      }
      return true;
    },
    { message: 'endsAtUtc must be after startsAtUtc', path: ['endsAtUtc'] },
  );

export type UpdateAppointmentInput = z.infer<typeof updateAppointmentSchema>;

export const calendarQuerySchema = z.object({
  from: isoDateTime,
  to: isoDateTime,
});

export type CalendarQueryInput = z.infer<typeof calendarQuerySchema>;
