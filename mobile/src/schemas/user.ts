import { z } from 'zod';

/**
 * Shared privacy/visibility enums — the single source of truth for both the
 * settings form (`settings.ts`, camelCase keys) and the persisted preferences
 * blob below (snake_case keys). Keeps the two from drifting (SCHEMA-2).
 */
export const SocialVisibilityEnum = z.enum(['public', 'followers', 'private']);
export const PrivacyAudienceEnum = z.enum(['everyone', 'followers', 'nobody']);

/**
 * User notification and privacy preferences from the `profiles.preferences` JSONB column.
 * 
 * Used by: SettingsScreen, ProfileWriteService, useProfileData
 * 
 * @remarks
 * - Uses `.catchall(z.unknown())` to tolerate future preference keys added via migration
 * - All fields optional — new users have no preferences set initially
 */
export const UserPreferencesSchema = z.object({
  // Enum-enforced but resilient: an unrecognized persisted value degrades to
  // undefined rather than failing the whole preferences parse (SCHEMA-2).
  social_visibility: SocialVisibilityEnum.optional().catch(undefined),
  privacy_endorsements: PrivacyAudienceEnum.optional().catch(undefined),
  privacy_annotations: PrivacyAudienceEnum.optional().catch(undefined),
  notif_follows: z.boolean().optional(),
  notif_endorsements: z.boolean().optional(),
  notif_comments: z.boolean().optional(),
  notif_system: z.boolean().optional(),
  biometric_lock: z.boolean().optional(),
  tactile_audio_enabled: z.boolean().optional(),
  favorites: z.array(z.unknown()).nullable().optional(),
  programmes: z.array(z.unknown()).nullable().optional(),
  hide_stats: z.boolean().optional(),
}).catchall(z.unknown());

/**
 * Core user identity schema derived from the `profiles` table.
 * 
 * Used by: AuthStore (session hydration), auth callbacks, MMKV persistence
 * 
 * @remarks
 * - `role` and `tier` map to subscription tiers (free < cinephile < archivist < auteur)
 * - `following` is a runtime-only field populated from followStore, excluded from MMKV cache
 * - `social_links` supports both legacy Record format and new array-of-objects format
 */
export const UserSchema = z.object({
  id: z.string(),
  username: z.string(),
  email: z.string().optional(),
  bio: z.string().optional(),
  avatar: z.string().optional(),
  avatar_url: z.string().optional(),
  role: z.enum(['free', 'cinephile', 'archivist', 'auteur']),
  tier: z.string().optional(),
  is_founding: z.boolean().optional(),
  // Canonical snake_case — matches DB columns. Removed camelCase duplicates
  // (displayName, socialVisibility, isSocialPrivate) to prevent dual-path bugs.
  display_name: z.string().optional(),
  persona: z.string().optional(),
  social_visibility: SocialVisibilityEnum.optional(),
  // Runtime-only field: populated in-memory, excluded from MMKV cache via destructuring
  // @deprecated — Use `useSocialStore.getState().following` instead. This field is a cold-start cache only.
  following: z.array(z.string()).optional(),
  followers_count: z.number().optional(),
  following_count: z.number().optional(),
  is_social_private: z.boolean().optional(),
  created_at: z.string().optional(),
  /** Real archive serial from the `member_no` DB sequence — null until migration data reaches this client. */
  member_no: z.number().nullable().optional(),
  preferences: UserPreferencesSchema.optional(),
  is_banned: z.boolean().optional(),
  ban_reason: z.string().optional(),
  social_links: z.union([
    z.record(z.string(), z.string()),
    z.array(z.object({ title: z.string(), url: z.string() }))
  ]).optional()
});

export type UserPreferences = z.infer<typeof UserPreferencesSchema>;

/** Zod-inferred base type (internal — use `User` interface for consumption). */
type _UserBase = z.infer<typeof UserSchema>;

/**
 * Core user identity type derived from the `profiles` table.
 *
 * @remarks
 * - `role` and `tier` map to subscription tiers (free < cinephile < archivist < auteur)
 * - `following` is deprecated — use `useSocialStore` instead
 * - `social_links` supports both legacy Record format and new array-of-objects format
 */
export interface User extends Omit<_UserBase, 'following'> {
  /**
   * @deprecated Use `useSocialStore.getState().following` instead. This field is a cold-start cache only.
   */
  following?: string[];
}
