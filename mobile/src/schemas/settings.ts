import { z } from 'zod';

/**
 * Settings form schema for the SettingsScreen.
 * All fields are required — the form must be fully populated before submission.
 * 
 * Used by: SettingsScreen, ProfileWriteService
 */
export const SettingsSchema = z.object({
  socialVisibility: z.enum(['public', 'followers', 'private']),
  privacyEndorsements: z.enum(['everyone', 'followers', 'nobody']),
  privacyAnnotations: z.enum(['everyone', 'followers', 'nobody']),
  notifFollows: z.boolean(),
  notifEndorsements: z.boolean(),
  notifComments: z.boolean(),
  notifSystem: z.boolean(),
  biometricLock: z.boolean(),
});

export type SettingsFormData = z.infer<typeof SettingsSchema>;
