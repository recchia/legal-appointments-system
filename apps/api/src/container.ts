import { PrismaClient } from '@prisma/client';
import { AppointmentRepository } from './repositories/appointment.repository';
import { LawyerRepository } from './repositories/lawyer.repository';
import { ClientRepository } from './repositories/client.repository';
import { TimezoneService } from './services/timezone.service';
import { ConflictDetectorService } from './services/conflict-detector.service';
import { LawyerService } from './services/lawyer.service';
import { AppointmentService } from './services/appointment.service';
import { SystemClock } from './clock';

/**
 * Composition root — wires all dependencies together.
 *
 * Manual DI: explicit, readable, zero magic. Each dependency is
 * constructed once and shared via this module. If we needed request-scoped dependencies, we'd use a DI container (Inversify, Awilix).
 * For this codebase, module-level singletons are enough.
 *
 * The Prisma client is a singleton — one connection pool for the
 * entire process lifetime.
 */
export const prisma = new PrismaClient();

// Repositories
export const appointmentRepo = new AppointmentRepository(prisma);
export const lawyerRepo = new LawyerRepository(prisma);
export const clientRepo = new ClientRepository(prisma);

// Domain services
export const timezoneService = new TimezoneService();
export const clock = new SystemClock();
export const conflictDetector = new ConflictDetectorService(appointmentRepo);

// Application services
export const lawyerService = new LawyerService(lawyerRepo, timezoneService);
export const appointmentService = new AppointmentService(
  appointmentRepo,
  lawyerRepo,
  clientRepo,
  conflictDetector,
  timezoneService,
  clock,
);
