import type {
  Lawyer,
  Appointment,
  CreateAppointmentRequest,
  ApiError,
} from '@legal-appointments/shared';

const BASE = '/api';

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json', ...init?.headers },
    ...init,
  });

  if (!res.ok) {
    const error: ApiError = await res.json().catch(() => ({
      code: 'UNKNOWN',
      message: `HTTP ${res.status}`,
    }));
    throw Object.assign(new Error(error.message), { code: error.code, status: res.status, detail: error });
  }

  return res.json() as Promise<T>;
}

export const api = {
  lawyers: {
    list: () => request<Lawyer[]>('/lawyers'),
    getById: (id: string) => request<Lawyer>(`/lawyers/${id}`),
  },
  calendar: {
    get: (lawyerId: string, from: string, to: string) =>
      request<Appointment[]>(`/lawyers/${lawyerId}/calendar?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`),
  },
  appointments: {
    create: (data: CreateAppointmentRequest) =>
      request<Appointment>('/appointments', { method: 'POST', body: JSON.stringify(data) }),
    getById: (id: string) => request<Appointment>(`/appointments/${id}`),
  },
};
