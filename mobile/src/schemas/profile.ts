import { z } from 'zod';

/** Individual social link entry with 40-char title limit. */
export const ProfileLinkSchema = z.object({
  id: z.string(),
  title: z.string().max(40, 'Max 40 characters'),
  url: z.string(), // Allowing empty or incomplete URLs during typing, validated on save
});

/**
 * Client-side edit profile form validation.
 * 
 * Used by: useEditProfile hook, EditProfileScreen
 * 
 * @remarks
 * - Username: lowercase only, 3-20 chars, no special chars except underscore
 * - Bio capped at 160 chars (aligned with ProfileUpdateSchema's server-side limit)
 * - Max 10 social links
 */
export const EditProfileSchema = z.object({
  username: z.string()
    .min(3, 'Must be at least 3 characters')
    .max(30, 'Must be 30 characters or fewer')
    .regex(/^[a-z0-9_]+$/, 'Only lowercase letters, numbers, and underscores'),
  displayName: z.string().max(50, 'Display name must be 50 or fewer characters').optional(),
  bio: z.string().max(160, 'Bio must be 160 or fewer characters').optional(),
  links: z.array(ProfileLinkSchema).max(10, 'Maximum 10 links allowed'),
});

export type EditProfileFormData = z.infer<typeof EditProfileSchema>;
