import { useState, useEffect, useMemo, useRef } from 'react';
import { Alert } from 'react-native';
import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { useAuthStore } from '@/src/stores/auth';
import { setSensitive } from '@/src/stores/mmkv-storage';
import { ProfileService } from '@/src/services/ProfileWriteService';
import { useRouter } from 'expo-router';
import { validateUsername } from '@/src/utils/validateUsername';
import { queryClient } from '@/src/lib/queryClient';
import { useLoungeStore } from '@/src/stores/lounge';
import { captureError } from '@/src/lib/sentry';
import TactileEngine from '@/src/utils/TactileEngine';

// Zod schema for the form
const editProfileSchema = z.object({
  // SCHEMA-1: validate via the single source of truth (validateUsername) instead of
  // a looser inline regex — this also rejects leading/trailing/consecutive
  // underscores and reserved handles, matching the server-side username policy.
  username: z.string().superRefine((val, ctx) => {
    const result = validateUsername(val);
    if (!result.valid) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: result.error ?? 'Invalid username.' });
    }
  }),
  displayName: z.string().max(50).optional().default(''),
  bio: z.string().max(160, 'Bio cannot exceed 160 characters').optional().default(''),
  // SCHEMA-1: enforce the documented 10-link cap (the LinksEditor advertises it).
  links: z.array(z.object({ title: z.string(), url: z.string() })).max(10, 'Maximum 10 links allowed').default([]),
});

type ProfileFormData = z.infer<typeof editProfileSchema>;

// Parse both legacy Record structures and modern Array structures
// to guarantee 0% data loss when editing profiles.
export const parseLinks = (raw: any): { title: string; url: string }[] => {
  if (!raw) return [];
  if (Array.isArray(raw)) {
    return raw.map(l => ({ title: l.title || '', url: l.url || '' }));
  }
  if (typeof raw === 'object') {
    return Object.entries(raw).map(([k, v]) => ({
      title: k.charAt(0).toUpperCase() + k.slice(1),
      url: v as string
    }));
  }
  return [];
};

// Drops blank entries and trims the rest before persisting to social_links.
export function sanitizeLinks(links: { title: string; url: string }[]): { title: string; url: string }[] {
  return links
    .filter((l) => l.title.trim() && l.url.trim())
    .map((l) => ({ title: l.title.trim(), url: l.url.trim() }));
}

// Mirrors the isDirty memo's avatar branch: true if a new image was picked,
// or the existing avatar was explicitly removed.
export function computeHasNewAvatar(
  avatarBase64: string | null,
  avatarPreview: string | null,
  currentAvatarUrl: string | null | undefined,
): boolean {
  return !!avatarBase64 || (avatarPreview === null && currentAvatarUrl != null);
}

export interface ProfileUpdateInput {
  sanitizedUsername: string;
  usernameChanged: boolean;
  displayName: string;
  bio: string;
  links: { title: string; url: string }[];
  finalAvatarUrl: string | null | undefined;
}

// Assembles the DB update payload sent to ProfileService.updateProfile.
// finalAvatarUrl is `undefined` when the avatar wasn't touched, so avatar_url
// is only included in the update when it actually changed.
//
// username follows the same rule, and for a sharper reason. The form is seeded
// with the STORED handle, and this used to write the SANITIZED form value on
// every save. A handle that predates the current charset rules — several live
// ones contain a dot — sanitizes to something different, so editing only a bio
// silently renamed the member. username is now included only when they actually
// changed it, which is what the web app has always done correctly.
export function buildProfileUpdates(input: ProfileUpdateInput): Record<string, any> {
  const updates: Record<string, any> = {
    display_name: input.displayName,
    bio: input.bio,
    social_links: sanitizeLinks(input.links),
  };
  if (input.usernameChanged) {
    updates.username = input.sanitizedUsername;
  }
  if (input.finalAvatarUrl !== undefined) {
    updates.avatar_url = input.finalAvatarUrl;
  }
  return updates;
}

export function useEditProfile() {
  const { user } = useAuthStore();
  const router = useRouter();

  const form = useForm<ProfileFormData>({
    resolver: zodResolver(editProfileSchema) as any,
    defaultValues: {
      username: user?.username || '',
      displayName: user?.display_name || '',
      bio: user?.bio || '',
      links: parseLinks(user?.social_links),
    },
  });

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: 'links',
  });

  const [avatarPreview, setAvatarPreview] = useState<string | null>(user?.avatar_url || null);
  const [avatarBase64, setAvatarBase64] = useState<string | null>(null);
  const [showCropModal, setShowCropModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [submitError, setSubmitError] = useState<string | Error | null>(null);
  // The one-beat "DOSSIER AMENDED" seal shown on a successful save before we
  // return to the profile — the confirmation the silent router.back() lacked.
  const [sealed, setSealed] = useState(false);
  const sealTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (sealTimerRef.current) clearTimeout(sealTimerRef.current); }, []);

  useEffect(() => {
    if (user) {
      form.reset({
        username: user.username || '',
        displayName: user.display_name || '',
        bio: user.bio || '',
        links: parseLinks(user.social_links),
      });
      setAvatarPreview(user.avatar_url || null);
    }
  }, [user, form]);

  const { isDirty: isFormDirty } = form.formState;

  const isDirty = useMemo(() => {
    const hasNewAvatar = computeHasNewAvatar(avatarBase64, avatarPreview, user?.avatar_url);
    return isFormDirty || hasNewAvatar;
  }, [isFormDirty, avatarBase64, avatarPreview, user?.avatar_url]);

  const handleSave = form.handleSubmit(async (data: any) => {
    if (!user) return;
    setSubmitError(null);
    setSaving(true);
    
    try {
      // Did they actually touch the handle? Compare what they were SHOWN against
      // what is stored — never the sanitized form of it. Sanitizing first made a
      // legacy handle look changed when nobody had typed anything, which is how
      // an unrelated bio edit ended up renaming people.
      const storedUsername = user.username ?? '';
      const typedUsername = (data.username ?? '').trim();
      const usernameChanged = typedUsername !== storedUsername;

      // `sanitizedUsername` is the handle that will be in the database after this
      // save — the stored one when untouched. Used below for the optimistic feed
      // sync, which matches on username and would otherwise miss legacy handles.
      let sanitizedUsername = storedUsername;

      // Only a handle the member is deliberately choosing gets validated. Holding a
      // legacy handle to today's rules would lock them out of editing their own bio.
      if (usernameChanged) {
        const validation = validateUsername(typedUsername);
        if (!validation.valid) {
          form.setError('username', { type: 'manual', message: validation.error || 'Invalid username' });
          setSaving(false);
          return;
        }
        sanitizedUsername = validation.sanitized;

        const isAvailable = await ProfileService.checkUsernameAvailable(sanitizedUsername, user.id);
        if (!isAvailable) {
          form.setError('username', { type: 'manual', message: 'This username is already taken.' });
          setSaving(false);
          return;
        }
      }

      // Map form fields to DB fields, handling the display_name mapping bug
      let finalAvatarUrl: string | null | undefined = undefined;
      if (avatarBase64) {
        finalAvatarUrl = await ProfileService.uploadAvatar(user.id, avatarBase64);
      } else if (avatarPreview === null && user.avatar_url != null) {
        finalAvatarUrl = null;
      }

      const updates = buildProfileUpdates({
        sanitizedUsername,
        usernameChanged,
        displayName: data.displayName,
        bio: data.bio,
        links: data.links,
        finalAvatarUrl,
      });

      await ProfileService.updateProfile(user.id, updates);

      // Optimistically propagate the new avatar instantly across all feeds and lounge messages
      if (finalAvatarUrl !== undefined) {
        try {
          // 1. Sync Lounge store
          useLoungeStore.getState().syncGlobalAvatar(user.id, finalAvatarUrl);

          // 2. Sync React Query Feeds
          queryClient.getQueriesData({ queryKey: ['feed'] }).forEach(([queryKey, data]: any) => {
            if (data?.pages) {
              const newPages = data.pages.map((page: any) => {
                if (Array.isArray(page)) {
                  return page.map((item: any) => 
                    item.username === sanitizedUsername 
                      ? { ...item, avatar_url: finalAvatarUrl }
                      : item
                  );
                }
                return page;
              });
              queryClient.setQueryData(queryKey, { ...data, pages: newPages });
            }
          });

          // 3. Sync Lounge Members Query
          queryClient.getQueriesData({ queryKey: ['lounge_members'] }).forEach(([queryKey, data]: any) => {
            if (Array.isArray(data)) {
              const newMembers = data.map((member: any) => {
                if (member.user_id === user.id) {
                  return {
                    ...member,
                    profiles: Array.isArray(member.profiles) 
                      ? [{ ...member.profiles[0], avatar_url: finalAvatarUrl }]
                      : { ...member.profiles, avatar_url: finalAvatarUrl }
                  };
                }
                return member;
              });
              queryClient.setQueryData(queryKey, newMembers);
            }
          });

          // 4. Sync Featured Critique Query
          queryClient.getQueriesData({ queryKey: ['featuredCritique'] }).forEach(([queryKey, data]: any) => {
            if (data && data.user_id === user.id) {
              const newData = {
                ...data,
                profiles: Array.isArray(data.profiles)
                  ? [{ ...data.profiles[0], avatar_url: finalAvatarUrl }]
                  : { ...data.profiles, avatar_url: finalAvatarUrl }
              };
              queryClient.setQueryData(queryKey, newData);
            }
          });

        } catch (syncErr) {
          if (__DEV__) console.warn('[useEditProfile] Avatar sync failed non-fatally:', syncErr);
        }
      }

      // Hard flush caches where manual iteration is impractical. This runs on
      // EVERY save (not just avatar changes) so search results and any ['user']
      // consumers reflect renamed handles, new display names, and edited bios.
      queryClient.removeQueries({ queryKey: ['universalSearch'] });
      queryClient.removeQueries({ queryKey: ['user', user.id] });

      // Fire-and-forget: asynchronous garbage collection
      if (finalAvatarUrl !== undefined) {
        ProfileService.purgeLegacyAvatars(user.id, finalAvatarUrl).catch(err => {
          console.error('Non-blocking legacy avatar purge failed:', err);
        });
      }
      
      // Update local auth store
      useAuthStore.setState((state) => {
        const updatedUser = state.user ? {
          ...state.user, 
          ...updates,
          display_name: updates.display_name ?? state.user.display_name 
        } as any : null;
        if (updatedUser) {
          setSensitive(`ironvault_user_cache_${updatedUser.id}`, JSON.stringify(updatedUser));
        }
        return { user: updatedUser };
      });

      // Seal the dossier: a one-beat "AMENDED" stamp + success haptic, then
      // return. This is the confirmation the old silent router.back() lacked —
      // and, paired with the profile's focus-refetch, the edit is guaranteed
      // to be reflected the moment the member lands back on their dossier.
      TactileEngine.success();
      setSaving(false);
      setSealed(true);
      sealTimerRef.current = setTimeout(() => { router.back(); }, 750);
      return;
    } catch (err: unknown) {
      console.error('Failed to update profile:', err);
      if (!__DEV__) captureError(err instanceof Error ? err : new Error(String(err)), { context: 'update_profile' });
      setSubmitError(err instanceof Error ? err : new Error('Failed to update profile. Please try again.'));
    } finally {
      setSaving(false);
    }
  });

  const handleBack = () => {
    if (isDirty) {
      Alert.alert(
        'Discard Changes?',
        'You have unsaved changes. Are you sure you want to discard them?',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Discard', style: 'destructive', onPress: () => router.back() }
        ]
      );
    } else {
      router.back();
    }
  };

  return {
    user,
    form,
    errors: form.formState.errors,
    avatarPreview,
    setAvatarPreview,
    avatarBase64,
    setAvatarBase64,
    showCropModal,
    setShowCropModal,
    handleRemoveAvatar: () => {
      setAvatarPreview(null);
      setAvatarBase64(null);
    },
    fields,
    handleAddLink: () => append({ title: '', url: '' }),
    handleRemoveLink: (index: number) => remove(index),
    saving,
    sealed,
    submitError,
    handleSave,
    handleBack,
    isDirty,
  };
}
