import { z } from 'zod';

export const createLawyerSchema = z.object({
  fullName: z.string().min(1).max(200),
  email: z.string().email(),
  timezone: z.string().min(1),          // full IANA validation is in TimezoneService
  specialties: z.array(z.string()).default([]),
  countryId: z.number().int().positive(),
});

export type CreateLawyerInput = z.infer<typeof createLawyerSchema>;

export const updateLawyerSchema = z.object({
  fullName: z.string().min(1).max(200).optional(),
  email: z.string().email().optional(),
  timezone: z.string().min(1).optional(),
  specialties: z.array(z.string()).optional(),
  countryId: z.number().int().positive().optional(),
});

export type UpdateLawyerInput = z.infer<typeof updateLawyerSchema>;
