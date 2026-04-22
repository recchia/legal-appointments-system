import type { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { LawyerNotFoundError, LawyerEmailAlreadyInUseError, InvalidLawyerDataError } from '../services/lawyer.service.js';
import {
  AppointmentNotFoundError,
  AppointmentInPastError,
  AppointmentConflictError,
  AppointmentPartyNotFoundError,
  InvalidAppointmentError,
} from '../services/appointment.service.js';
import { InvalidTimeWindowError } from '../services/conflict-detector.service.js';
import { InvalidTimezoneError } from '../services/timezone.service.js';

/**
 * Global Express error handler.
 *
 * Maps domain errors to HTTP status codes. Every known error type
 * gets a specific status and a machine-readable code string.
 * Unknown errors get 500 with no internal detail leaked to the client.
 *
 * Must be registered LAST — after all routes.
 */
export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _next: NextFunction,
): void {
  // Validation errors from Zod
  if (err instanceof ZodError) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of err.issues) {
      const field = issue.path.join('.');
      fieldErrors[field] = issue.message;
    }
    res.status(400).json({
      code: 'VALIDATION_ERROR',
      message: 'Request validation failed',
      fieldErrors,
    });
    return;
  }

  // Lawyer domain errors
  if (err instanceof LawyerNotFoundError) {
    res.status(404).json({ code: 'LAWYER_NOT_FOUND', message: err.message });
    return;
  }
  if (err instanceof LawyerEmailAlreadyInUseError) {
    res.status(409).json({ code: 'EMAIL_ALREADY_IN_USE', message: err.message });
    return;
  }
  if (err instanceof InvalidLawyerDataError) {
    res.status(400).json({ code: 'INVALID_LAWYER_DATA', message: err.message });
    return;
  }

  // Appointment domain errors
  if (err instanceof AppointmentNotFoundError) {
    res.status(404).json({ code: 'APPOINTMENT_NOT_FOUND', message: err.message });
    return;
  }
  if (err instanceof AppointmentInPastError) {
    res.status(422).json({ code: 'APPOINTMENT_IN_PAST', message: err.message });
    return;
  }
  if (err instanceof AppointmentConflictError) {
    res.status(409).json({
      code: 'APPOINTMENT_CONFLICT',
      message: err.message,
      conflictingIds: err.conflictingIds,
    });
    return;
  }
  if (err instanceof AppointmentPartyNotFoundError) {
    res.status(404).json({ code: 'PARTY_NOT_FOUND', message: err.message });
    return;
  }
  if (err instanceof InvalidAppointmentError) {
    res.status(400).json({ code: 'INVALID_APPOINTMENT', message: err.message });
    return;
  }

  // Shared domain errors
  if (err instanceof InvalidTimeWindowError) {
    res.status(400).json({ code: 'INVALID_TIME_WINDOW', message: err.message });
    return;
  }
  if (err instanceof InvalidTimezoneError) {
    res.status(400).json({ code: 'INVALID_TIMEZONE', message: err.message });
    return;
  }

  // Unknown error — log it, return generic 500
  console.error('Unhandled error:', err);
  res.status(500).json({
    code: 'INTERNAL_ERROR',
    message: 'An unexpected error occurred',
  });
}
