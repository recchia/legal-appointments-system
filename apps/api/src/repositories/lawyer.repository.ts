import type { PrismaClient, Lawyer, Prisma } from '@prisma/client';

export interface LawyerWithCountry extends Lawyer {
  country: {
    id: number;
    code: string;
    name: string;
    defaultTimezone: string;
  };
}

export interface CreateLawyerData {
  fullName: string;
  email: string;
  timezone: string;
  specialties: string[];
  countryId: number;
}

export interface UpdateLawyerData {
  fullName?: string;
  email?: string;
  timezone?: string;
  specialties?: string[];
  countryId?: number;
}

/**
 * Data-access boundary for lawyers.
 *
 * Exposes a narrow interface around Prisma queries. The service layer
 * never imports Prisma directly — this keeps business logic ORM-agnostic
 * and simplifies testing via fake repositories.
 */
export class LawyerRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findAll(): Promise<LawyerWithCountry[]> {
    return this.prisma.lawyer.findMany({
      include: { country: true },
      orderBy: { fullName: 'asc' },
    });
  }

  async findById(id: string): Promise<LawyerWithCountry | null> {
    return this.prisma.lawyer.findUnique({
      where: { id },
      include: { country: true },
    });
  }

  async findByEmail(email: string): Promise<Lawyer | null> {
    return this.prisma.lawyer.findUnique({ where: { email } });
  }

  async create(data: CreateLawyerData): Promise<LawyerWithCountry> {
    return this.prisma.lawyer.create({
      data,
      include: { country: true },
    });
  }

  async update(id: string, data: UpdateLawyerData): Promise<LawyerWithCountry> {
    return this.prisma.lawyer.update({
      where: { id },
      data,
      include: { country: true },
    });
  }

  async delete(id: string): Promise<void> {
    await this.prisma.lawyer.delete({ where: { id } });
  }
}
