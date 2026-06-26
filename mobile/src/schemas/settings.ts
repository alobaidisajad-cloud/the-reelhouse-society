import { z } from 'zod';
import { SocialVisibilityEnum, PrivacyAudienceEnum } from './user';

/**
 * Settings form schema for the SettingsScreen.
 * All fields are required — the form must be fully populated before submission.
 *
 * Used by: SettingsScreen, ProfileWriteService
 *
 * Privacy/visibility enums are shared with the persisted preferences blob
 * (`user.ts`) so the form and storage layers can never drift (SCHEMA-2).
 */
export const SettingsSchema = z.object({
  socialVisibility: SocialVisibilityEnum,
  privacyEndorsements: PrivacyAudienceEnum,
  privacyAnnotations: PrivacyAudienceEnum,
  notifFollows: z.boolean(),
  notifEndorsements: z.boolean(),
  notifComments: z.boolean(),
  notifSystem: z.boolean(),
  biometricLock: z.boolean(),
});

export type SettingsFormData = z.infer<typeof SettingsSchema>;
