import { describe, it, expect, beforeEach } from 'vitest';
import type { Lawyer } from '@prisma/client';
import {
  LawyerService,
  LawyerNotFoundError,
  LawyerEmailAlreadyInUseError,
  InvalidLawyerDataError,
} from '../../src/services/lawyer.service';
import type {
  LawyerRepository,
  LawyerWithCountry,
  CreateLawyerData,
  UpdateLawyerData,
} from '../../src/repositories/lawyer.repository';
import { TimezoneService } from '../../src/services/timezone.service';

/** Hand-written fake repository — same pattern as ConflictDetector tests. */
class FakeLawyerRepository
  implements Pick<LawyerRepository, 'findAll' | 'findById' | 'findByEmail' | 'create' | 'update' | 'delete'>
{
  private lawyers: LawyerWithCountry[] = [];
  private idCounter = 1;

  seed(lawyers: LawyerWithCountry[]): void {
    this.lawyers = [...lawyers];
  }

  async findAll(): Promise<LawyerWithCountry[]> {
    return [...this.lawyers].sort((a, b) => a.fullName.localeCompare(b.fullName));
  }

  async findById(id: string): Promise<LawyerWithCountry | null> {
    return this.lawyers.find((l) => l.id === id) ?? null;
  }

  async findByEmail(email: string): Promise<Lawyer | null> {
    return this.lawyers.find((l) => l.email === email) ?? null;
  }

  async create(data: CreateLawyerData): Promise<LawyerWithCountry> {
    const created: LawyerWithCountry = {
      id: `lawyer-${this.idCounter++}`,
      fullName: data.fullName,
      email: data.email,
      timezone: data.timezone,
      specialties: data.specialties,
      countryId: data.countryId,
      createdAt: new Date(),
      updatedAt: new Date(),
      country: {
        id: data.countryId,
        code: 'XX',
        name: 'Test Country',
        defaultTimezone: data.timezone,
      },
    };
    this.lawyers.push(created);
    return created;
  }

  async update(id: string, data: UpdateLawyerData): Promise<LawyerWithCountry> {
    const lawyer = this.lawyers.find((l) => l.id === id);
    if (!lawyer) throw new Error('Lawyer not found in fake repo');
    Object.assign(lawyer, data, { updatedAt: new Date() });
    return lawyer;
  }

  async delete(id: string): Promise<void> {
    this.lawyers = this.lawyers.filter((l) => l.id !== id);
  }
}

function makeLawyer(overrides: Partial<LawyerWithCountry> = {}): LawyerWithCountry {
  return {
    id: overrides.id ?? 'lawyer-1',
    fullName: overrides.fullName ?? 'María González',
    email: overrides.email ?? 'maria@legalfirm.test',
    timezone: overrides.timezone ?? 'America/Argentina/Buenos_Aires',
    specialties: overrides.specialties ?? ['Corporate'],
    countryId: overrides.countryId ?? 1,
    createdAt: overrides.createdAt ?? new Date('2026-01-01T00:00:00Z'),
    updatedAt: overrides.updatedAt ?? new Date('2026-01-01T00:00:00Z'),
    country: overrides.country ?? {
      id: 1,
      code: 'AR',
      name: 'Argentina',
      defaultTimezone: 'America/Argentina/Buenos_Aires',
    },
  };
}

describe('LawyerService', () => {
  let fakeRepo: FakeLawyerRepository;
  let service: LawyerService;

  beforeEach(() => {
    fakeRepo = new FakeLawyerRepository();
    service = new LawyerService(
      fakeRepo as unknown as LawyerRepository,
      new TimezoneService(),
    );
  });

  describe('list', () => {
    it('returns all lawyers sorted by fullName', async () => {
      fakeRepo.seed([
        makeLawyer({ id: 'l2', fullName: 'Zoe Benson' }),
        makeLawyer({ id: 'l1', fullName: 'Alice Adams' }),
      ]);
      const result = await service.list();
      expect(result.map((l: LawyerWithCountry) => l.id)).toEqual(['l1', 'l2']);
    });

    it('returns empty array when no lawyers', async () => {
      const result = await service.list();
      expect(result).toEqual([]);
    });
  });

  describe('getById', () => {
    it('returns the lawyer when found', async () => {
      fakeRepo.seed([makeLawyer({ id: 'lawyer-1' })]);
      const result = await service.getById('lawyer-1');
      expect(result.id).toBe('lawyer-1');
    });

    it('throws LawyerNotFoundError when missing', async () => {
      await expect(service.getById('nonexistent')).rejects.toThrow(LawyerNotFoundError);
    });
  });

  describe('create', () => {
    const validData: CreateLawyerData = {
      fullName: 'María González',
      email: 'maria@legalfirm.test',
      timezone: 'America/Argentina/Buenos_Aires',
      specialties: ['Corporate'],
      countryId: 1,
    };

    it('creates when data is valid', async () => {
      const created = await service.create(validData);
      expect(created.email).toBe(validData.email);
      expect(created.id).toBeTruthy();
    });

    it('rejects invalid IANA timezone', async () => {
      await expect(
        service.create({ ...validData, timezone: 'America/Fakeville' }),
      ).rejects.toThrow(InvalidLawyerDataError);
    });

    it('rejects duplicate email', async () => {
      await service.create(validData);
      await expect(service.create(validData)).rejects.toThrow(LawyerEmailAlreadyInUseError);
    });
  });

  describe('update', () => {
    beforeEach(async () => {
      fakeRepo.seed([makeLawyer({ id: 'lawyer-1', email: 'original@test.com' })]);
    });

    it('updates when lawyer exists', async () => {
      const updated = await service.update('lawyer-1', { fullName: 'Nuevo Nombre' });
      expect(updated.fullName).toBe('Nuevo Nombre');
    });

    it('throws LawyerNotFoundError when missing', async () => {
      await expect(
        service.update('nonexistent', { fullName: 'X' }),
      ).rejects.toThrow(LawyerNotFoundError);
    });

    it('rejects invalid timezone on update', async () => {
      await expect(
        service.update('lawyer-1', { timezone: 'America/Fakeville' }),
      ).rejects.toThrow(InvalidLawyerDataError);
    });

    it('rejects email change that collides with another lawyer', async () => {
      fakeRepo.seed([
        makeLawyer({ id: 'lawyer-1', email: 'one@test.com' }),
        makeLawyer({ id: 'lawyer-2', email: 'two@test.com' }),
      ]);

      await expect(
        service.update('lawyer-1', { email: 'two@test.com' }),
      ).rejects.toThrow(LawyerEmailAlreadyInUseError);
    });

    it('allows updating to the same email (no collision with self)', async () => {
      const updated = await service.update('lawyer-1', {
        email: 'original@test.com',
        fullName: 'Updated Name',
      });
      expect(updated.fullName).toBe('Updated Name');
    });
  });

  describe('delete', () => {
    it('deletes when lawyer exists', async () => {
      fakeRepo.seed([makeLawyer({ id: 'lawyer-1' })]);
      await service.delete('lawyer-1');
      expect(await fakeRepo.findById('lawyer-1')).toBeNull();
    });

    it('throws LawyerNotFoundError when missing', async () => {
      await expect(service.delete('nonexistent')).rejects.toThrow(LawyerNotFoundError);
    });
  });
});
