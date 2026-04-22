import type { PrismaClient, Client } from '@prisma/client';

export interface CreateClientData {
  fullName: string;
  email: string;
  phone?: string;
  timezone: string;
}

export class ClientRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findById(id: string): Promise<Client | null> {
    return this.prisma.client.findUnique({ where: { id } });
  }

  async findAll(): Promise<Client[]> {
    return this.prisma.client.findMany({ orderBy: { fullName: 'asc' } });
  }

  async create(data: CreateClientData): Promise<Client> {
    return this.prisma.client.create({ data });
  }
}
