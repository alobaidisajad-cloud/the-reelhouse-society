import { z } from 'zod';
import { UserPreferencesSchema } from './user';

/**
 * Schema for profile update mutations via ProfileWriteService.
 * 
 * Used by: useEditProfile, SettingsScreen, AvatarCropSheet
 * 
 * @remarks
 * - Username validation: 3-30 chars, alphanumeric + underscores only
 * - Bio capped at 160 chars (Twitter-style limit)
 * - social_links supports both legacy Record and new array-of-objects format
 */
export const ProfileUpdateSchema = z.object({
  username: z.string().min(3).max(30).regex(/^[a-z0-9_]+$/, 'Username can only contain lowercase letters, numbers, and underscores').optional(),
  bio: z.string().max(160, 'Bio cannot exceed 160 characters').optional(),
  display_name: z.string().max(50).optional(),
  avatar_url: z.string().url().nullable().optional(),
  is_social_private: z.boolean().optional(),
  persona: z.string().max(50).optional(),
  preferences: UserPreferencesSchema.optional(),
  social_links: z.union([
    z.record(z.string(), z.string()),
    z.array(z.object({ title: z.string(), url: z.string() }))
  ]).optional(),
});

export const ProfilePreferencesUpdateSchema = UserPreferencesSchema;

/**
 * Read-side profile schema — validates Supabase profile rows
 * at the service boundary BEFORE they reach useProfileData.ts.
 *
 * Eliminates the `profile as unknown as ProfileUser` double-cast that
 * would silently mask column renames or type changes from Supabase.
 * Uses .passthrough() to tolerate additional columns from future migrations.
 */
export const ProfileUserSchema = z.object({
  id: z.string(),
  username: z.string(),
  display_name: z.string().nullable().optional(),
  avatar_url: z.string().nullable().optional(),
  bio: z.string().nullable().optional(),
  role: z.string().nullable().optional(),
  tier: z.string().nullable().optional(),
  is_founding: z.boolean().nullable().optional(),
  persona: z.string().nullable().optional(),
  is_social_private: z.boolean().nullable().optional(),
  followers_count: z.number().nullable().optional(),
  following_count: z.number().nullable().optional(),
  followers: z.array(z.string()).nullable().optional(),
  following: z.array(z.string()).nullable().optional(),
  favorite_films: z.array(z.number()).nullable().optional(),
  preferences: UserPreferencesSchema.nullable().optional(),
  created_at: z.string().nullable().optional(),
  social_links: z.union([
    z.array(z.object({ title: z.string(), url: z.string() })),
    z.record(z.string(), z.string()),
  ]).nullable().optional(),
}).passthrough();

export type ValidatedProfileUser = z.infer<typeof ProfileUserSchema>;

