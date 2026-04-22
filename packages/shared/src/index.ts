// Enums matching the Prisma schema — keep in sync by design
export const AppointmentType = {
  IN_PERSON: 'IN_PERSON',
  VIDEO: 'VIDEO',
  PHONE: 'PHONE',
} as const;

export type AppointmentType = typeof AppointmentType[keyof typeof AppointmentType];

export const AppointmentStatus = {
  SCHEDULED: 'SCHEDULED',
  COMPLETED: 'COMPLETED',
  CANCELLED: 'CANCELLED',
  NO_SHOW: 'NO_SHOW',
} as const;

export type AppointmentStatus = typeof AppointmentStatus[keyof typeof AppointmentStatus];

// Entity DTOs — what the API returns, what the web consumes
export interface Country {
  id: number;
  code: string;
  name: string;
  defaultTimezone: string;
}

export interface Lawyer {
  id: string;
  fullName: string;
  email: string;
  timezone: string;
  countryId: number;
  country?: Country;
  specialties: string[];
  createdAt: string;
  updatedAt: string;
}

export interface Client {
  id: string;
  fullName: string;
  email: string;
  phone: string | null;
  timezone: string;
  createdAt: string;
}

export interface Appointment {
  id: string;
  lawyerId: string;
  clientId: string;
  type: AppointmentType;
  status: AppointmentStatus;
  startsAtUtc: string;           // ISO 8601 UTC
  endsAtUtc: string;             // ISO 8601 UTC
  lawyerTimezoneSnapshot: string;
  clientTimezoneSnapshot: string;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  // Optional expansions populated by the API
  lawyer?: Pick<Lawyer, 'id' | 'fullName' | 'timezone'>;
  client?: Pick<Client, 'id' | 'fullName' | 'timezone'>;
}

// API request DTOs
export interface CreateAppointmentRequest {
  lawyerId: string;
  clientId: string;
  type: AppointmentType;
  startsAtUtc: string;           // ISO 8601, always UTC from client
  endsAtUtc: string;
  notes?: string;
}

export interface ApiError {
  code: string;
  message: string;
  fieldErrors?: Record<string, string>;
}
