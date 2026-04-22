import type { Request, Response, NextFunction } from 'express';
import {
  createAppointmentSchema,
  updateAppointmentSchema,
  calendarQuerySchema,
} from '../schemas/appointment.schema';
import type { AppointmentService } from '../services/appointment.service';
import type { TimezoneService } from '../services/timezone.service';

export class AppointmentController {
  constructor(
    private readonly appointmentService: AppointmentService,
    private readonly timezoneService: TimezoneService,
  ) {}

  /**
   * GET /api/lawyers/:id/calendar?from=ISO&to=ISO
   * Returns appointments for a lawyer within a window,
   * each enriched with local time representations.
   */
  getCalendar = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const query = calendarQuerySchema.parse(req.query);
      const appointments = await this.appointmentService.getCalendar(
        req.params.id,
        query,
      );

      // Enrich each appointment with local time strings for display
      const enriched = appointments.map((apt) => ({
        ...apt,
        startsAtLocal: {
          lawyer: this.timezoneService.toIsoInZone(
            apt.startsAtUtc,
            apt.lawyerTimezoneSnapshot,
          ),
          client: this.timezoneService.toIsoInZone(
            apt.startsAtUtc,
            apt.clientTimezoneSnapshot,
          ),
        },
        endsAtLocal: {
          lawyer: this.timezoneService.toIsoInZone(
            apt.endsAtUtc,
            apt.lawyerTimezoneSnapshot,
          ),
          client: this.timezoneService.toIsoInZone(
            apt.endsAtUtc,
            apt.clientTimezoneSnapshot,
          ),
        },
      }));

      res.json(enriched);
    } catch (err) {
      next(err);
    }
  };

  getById = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const appointment = await this.appointmentService.getById(req.params.id);
      res.json(appointment);
    } catch (err) {
      next(err);
    }
  };

  create = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const data = createAppointmentSchema.parse(req.body);
      const appointment = await this.appointmentService.create(data);
      res.status(201).json(appointment);
    } catch (err) {
      next(err);
    }
  };

  update = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const data = updateAppointmentSchema.parse(req.body);
      const appointment = await this.appointmentService.update(req.params.id, data);
      res.json(appointment);
    } catch (err) {
      next(err);
    }
  };
}
