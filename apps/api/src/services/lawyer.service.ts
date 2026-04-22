import type {
  LawyerRepository,
  LawyerWithCountry,
  CreateLawyerData,
  UpdateLawyerData,
} from '../repositories/lawyer.repository';
import type { TimezoneService } from './timezone.service';

/**
 * Business logic for lawyer management.
 *
 * Responsibilities:
 *  - Validate IANA timezone via TimezoneService
 *  - Enforce email uniqueness (the DB enforces it too, via unique
 *    constraint — we check in the service for a clean error code)
 *  - Map "not found" and conflict cases to typed domain errors
 */
export class LawyerService {
  constructor(
    private readonly lawyerRepo: LawyerRepository,
    private readonly timezones: TimezoneService,
  ) {}

  async list(): Promise<LawyerWithCountry[]> {
    return this.lawyerRepo.findAll();
  }

  async getById(id: string): Promise<LawyerWithCountry> {
    const lawyer = await this.lawyerRepo.findById(id);
    if (!lawyer) throw new LawyerNotFoundError(id);
    return lawyer;
  }

  async create(data: CreateLawyerData): Promise<LawyerWithCountry> {
    if (!this.timezones.isValid(data.timezone)) {
      throw new InvalidLawyerDataError(`Invalid IANA timezone: "${data.timezone}"`);
    }

    const existing = await this.lawyerRepo.findByEmail(data.email);
    if (existing) {
      throw new LawyerEmailAlreadyInUseError(data.email);
    }

    return this.lawyerRepo.create(data);
  }

  async update(id: string, data: UpdateLawyerData): Promise<LawyerWithCountry> {
    // Verify the lawyer exists — cleaner error than Prisma's P2025
    const current = await this.lawyerRepo.findById(id);
    if (!current) throw new LawyerNotFoundError(id);

    if (data.timezone !== undefined && !this.timezones.isValid(data.timezone)) {
      throw new InvalidLawyerDataError(`Invalid IANA timezone: "${data.timezone}"`);
    }

    if (data.email && data.email !== current.email) {
      const collision = await this.lawyerRepo.findByEmail(data.email);
      if (collision) throw new LawyerEmailAlreadyInUseError(data.email);
    }

    return this.lawyerRepo.update(id, data);
  }

  async delete(id: string): Promise<void> {
    const existing = await this.lawyerRepo.findById(id);
    if (!existing) throw new LawyerNotFoundError(id);
    await this.lawyerRepo.delete(id);
  }
}

export class LawyerNotFoundError extends Error {
  constructor(public readonly lawyerId: string) {
    super(`Lawyer not found: ${lawyerId}`);
    this.name = 'LawyerNotFoundError';
  }
}

export class LawyerEmailAlreadyInUseError extends Error {
  constructor(public readonly email: string) {
    super(`Email already in use: ${email}`);
    this.name = 'LawyerEmailAlreadyInUseError';
  }
}

export class InvalidLawyerDataError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidLawyerDataError';
  }
}
