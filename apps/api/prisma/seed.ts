import { PrismaClient, AppointmentType, AppointmentStatus } from '@prisma/client';
import { randomUUID } from 'node:crypto';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding database...');

  // Wipe in dependency order
  await prisma.appointment.deleteMany();
  await prisma.client.deleteMany();
  await prisma.lawyer.deleteMany();
  await prisma.country.deleteMany();

  // Countries — three jurisdictions to exercise timezone handling
  const argentina = await prisma.country.create({
    data: { code: 'AR', name: 'Argentina', defaultTimezone: 'America/Argentina/Buenos_Aires' },
  });
  const mexico = await prisma.country.create({
    data: { code: 'MX', name: 'México', defaultTimezone: 'America/Mexico_City' },
  });
  const spain = await prisma.country.create({
    data: { code: 'ES', name: 'España', defaultTimezone: 'Europe/Madrid' },
  });

  // Lawyers — one per country, different specialties
  const lawyerAR = await prisma.lawyer.create({
    data: {
      fullName: 'María González',
      email: 'maria.gonzalez@legalfirm.test',
      timezone: 'America/Argentina/Buenos_Aires',
      specialties: ['Corporate', 'M&A'],
      countryId: argentina.id,
    },
  });

  const lawyerMX = await prisma.lawyer.create({
    data: {
      fullName: 'Carlos Ramírez',
      email: 'carlos.ramirez@legalfirm.test',
      timezone: 'America/Mexico_City',
      specialties: ['Immigration', 'Family'],
      countryId: mexico.id,
    },
  });

  const lawyerES = await prisma.lawyer.create({
    data: {
      fullName: 'Laura Fernández',
      email: 'laura.fernandez@legalfirm.test',
      timezone: 'Europe/Madrid',
      specialties: ['Intellectual Property'],
      countryId: spain.id,
    },
  });

  // Clients — varied timezones
  const clientAR = await prisma.client.create({
    data: {
      fullName: 'Juan Pérez',
      email: 'juan.perez@client.test',
      phone: '+54 9 11 1234-5678',
      timezone: 'America/Argentina/Buenos_Aires',
    },
  });

  const clientUS = await prisma.client.create({
    data: {
      fullName: 'Sarah Johnson',
      email: 'sarah.johnson@client.test',
      phone: '+1 415 555 0100',
      timezone: 'America/Los_Angeles',
    },
  });

  const clientES = await prisma.client.create({
    data: {
      fullName: 'Pedro Martínez',
      email: 'pedro.martinez@client.test',
      timezone: 'Europe/Madrid',
    },
  });

  // Appointments — spread across types, statuses, timezones
  const now = new Date();
  const hoursFromNow = (h: number) => new Date(now.getTime() + h * 3600_000);

  await prisma.appointment.createMany({
    data: [
      {
        id: randomUUID(),
        lawyerId: lawyerAR.id,
        clientId: clientAR.id,
        type: AppointmentType.IN_PERSON,
        status: AppointmentStatus.SCHEDULED,
        startsAtUtc: hoursFromNow(24),
        endsAtUtc: hoursFromNow(25),
        lawyerTimezoneSnapshot: lawyerAR.timezone,
        clientTimezoneSnapshot: clientAR.timezone,
        notes: 'Initial corporate consultation',
      },
      {
        id: randomUUID(),
        lawyerId: lawyerMX.id,
        clientId: clientUS.id,
        type: AppointmentType.VIDEO,
        status: AppointmentStatus.SCHEDULED,
        startsAtUtc: hoursFromNow(48),
        endsAtUtc: hoursFromNow(49),
        lawyerTimezoneSnapshot: lawyerMX.timezone,
        clientTimezoneSnapshot: clientUS.timezone,
        notes: 'Cross-border visa consultation',
      },
      {
        id: randomUUID(),
        lawyerId: lawyerES.id,
        clientId: clientES.id,
        type: AppointmentType.PHONE,
        status: AppointmentStatus.COMPLETED,
        startsAtUtc: hoursFromNow(-72),
        endsAtUtc: hoursFromNow(-71),
        lawyerTimezoneSnapshot: lawyerES.timezone,
        clientTimezoneSnapshot: clientES.timezone,
        notes: 'IP portfolio review — completed',
      },
      {
        id: randomUUID(),
        lawyerId: lawyerAR.id,
        clientId: clientUS.id,
        type: AppointmentType.VIDEO,
        status: AppointmentStatus.CANCELLED,
        startsAtUtc: hoursFromNow(-48),
        endsAtUtc: hoursFromNow(-47),
        lawyerTimezoneSnapshot: lawyerAR.timezone,
        clientTimezoneSnapshot: clientUS.timezone,
        notes: 'Client cancelled',
      },
    ],
  });

  const counts = {
    countries: await prisma.country.count(),
    lawyers: await prisma.lawyer.count(),
    clients: await prisma.client.count(),
    appointments: await prisma.appointment.count(),
  };

  console.log('✅ Seed complete:', counts);
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
