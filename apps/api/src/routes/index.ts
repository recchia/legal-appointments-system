import { Router } from 'express';
import { LawyerController } from '../controllers/lawyer.controller';
import { AppointmentController } from '../controllers/appointment.controller';
import { lawyerService, appointmentService, timezoneService } from '../container';

const router = Router();

const lawyerController = new LawyerController(lawyerService);
const appointmentController = new AppointmentController(appointmentService, timezoneService);

// ── Lawyer routes ─────────────────────────────────────────────────────────────
router.get('/lawyers', lawyerController.list);
router.get('/lawyers/:id', lawyerController.getById);
router.post('/lawyers', lawyerController.create);
router.patch('/lawyers/:id', lawyerController.update);
router.delete('/lawyers/:id', lawyerController.delete);

// ── Lawyer calendar (nested under lawyer) ────────────────────────────────────
router.get('/lawyers/:id/calendar', appointmentController.getCalendar);

// ── Appointment routes ────────────────────────────────────────────────────────
router.get('/appointments/:id', appointmentController.getById);
router.post('/appointments', appointmentController.create);
router.patch('/appointments/:id', appointmentController.update);

export { router };
