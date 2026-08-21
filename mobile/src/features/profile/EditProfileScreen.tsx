import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView,
  ActivityIndicator, InteractionManager, Platform, AccessibilityInfo
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeInDown, FadeIn } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { FormProvider } from 'react-hook-form';
import { ControlledInput, ControlledBioInput, ControlledUsernameInput } from '@/src/components/ControlledInput';
import { useAmbientGlow } from '@/src/hooks/useAmbientGlow';
import { ChevronLeft, User, Camera, Link2, Film, Sparkles, Stamp, Image as ImageIcon } from 'lucide-react-native';

import { useEditProfile } from '@/src/hooks/useEditProfile';
import { formatDateMonthYear } from '@/src/utils/timeAgo';
import { resolveTier, isAuteurPlusTier } from '@/src/utils/tier';
import { Toggle } from '@/src/components/Toggle';
import { backdropIsOn } from '@/src/components/profile/ProfileBackdrop';
import { pickBackdropFilm } from '@/src/components/profile/favourites';
import { useAuthStore } from '@/src/stores/auth';
import { supabase } from '@/src/lib/supabase';
import { enqueueMutation } from '@/src/utils/offlineQueue';
import { isNetworkError } from '@/src/utils/networkError';
import { colors, fonts } from '@/src/theme/theme';
import PressableScale from '@/src/components/PressableScale';
import { SectionCard, SectionHead } from '@/src/components/layout/SectionCards';
import { st } from '@/src/features/profile/profile.styles';
import { DiamondDivider } from '@/src/components/theme/DiamondDivider';
import AvatarCropSheet from '@/src/components/profile/AvatarCropSheet';
import { ProfileTriptych } from '@/src/components/profile/ProfileTriptych';
import { LinksEditor } from '@/src/features/profile/LinksEditor';
import Buster from '@/src/components/Buster';
import { Image } from 'expo-image';
import { scaledTextProps } from '@/src/constants/textScaling';

/**
 * THE BACKDROP — an Auteur privilege, and now a choice.
 *
 * An Auteur's file is dressed from the centre of their altarpiece: the poster
 * bleeds behind their portrait, washed and vignetted. It is the most striking
 * thing the app does with a member's own taste — and it is not what everyone
 * wants behind their own face. This gives it back to them.
 *
 * ── WHY IT WRITES IMMEDIATELY INSTEAD OF WAITING FOR SAVE ────────────────────
 * The triptych directly above it already writes the moment a film is chosen,
 * with no Save. A switch that quietly needed one would be the only control on
 * the page that did, and the member would find out by leaving and losing it.
 * Same optimistic-then-reconcile shape as the triptych: apply locally, send the
 * one key (the RPC merges), queue it if the network is out, roll back only on a
 * real refusal.
 *
 * ── ABSENT MEANS ON ──────────────────────────────────────────────────────────
 * Only an explicit `false` takes the backdrop down, so no Auteur loses theirs
 * on the day this ships.
 */
function BackdropSetting({ user }: { user: { id: string; preferences?: Record<string, unknown> | null } }) {
  const updateUser = useAuthStore(state => state.updateUser);
  const on = backdropIsOn(user?.preferences as { backdrop?: unknown } | null | undefined);
  const [busy, setBusy] = useState(false);

  // The film it would be cut from — so the line names it rather than making
  // the member go and look.
  const centre = pickBackdropFilm((user?.preferences as { favorites?: unknown } | null)?.favorites);

  const toggle = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    const next = !on;
    const currentPrefs = useAuthStore.getState().user?.preferences ?? {};
    const updated = { ...currentPrefs, backdrop: next };
    updateUser({ preferences: updated });
    try {
      const { error } = await supabase.rpc('update_my_preferences', { p_preferences: { backdrop: next } });
      if (error) throw error;
    } catch (e: unknown) {
      if (isNetworkError(e)) {
        enqueueMutation({ type: 'update_profile', payload: { user_id: user.id, preferences: updated } });
      } else {
        updateUser({ preferences: currentPrefs });
        if (__DEV__) console.error('[EditProfile] Failed to set backdrop:', e);
      }
    } finally {
      setBusy(false);
    }
  }, [busy, on, updateUser, user.id]);

  return (
    <SectionCard>
      <SectionHead icon={ImageIcon} label="THE BACKDROP" />
      <View style={bd.row}>
        <View style={bd.copy}>
          <Text {...scaledTextProps} style={st.fieldBody}>
            {centre
              ? `Your file is dressed from ${centre.title}. Turn this off for the house's own dark.`
              : "Dress your file with the centre of your triptych. Turn this off for the house's own dark."}
          </Text>
        </View>
        <Toggle active={on} onToggle={toggle} disabled={busy} label="Film backdrop on your profile" />
      </View>
    </SectionCard>
  );
}

const bd = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  copy: { flex: 1, minWidth: 0 },
});

export function EditProfileScreen() {
  const insets = useSafeAreaInsets();
  
  const {
    user,
    form,
    errors,
    avatarPreview, setAvatarPreview,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    avatarBase64, setAvatarBase64,
    showCropModal, setShowCropModal,
    handleRemoveAvatar,
    fields, handleAddLink, handleRemoveLink,
    saving, sealed, submitError,
    handleSave, handleBack
  } = useEditProfile();

  // The seal below carries `accessibilityLiveRegion`, which React Native declares
  // ANDROID ONLY. So on iPhone this confirmation was never spoken — the save
  // completed in silence for a VoiceOver member. Android already announces it;
  // this gives iOS the same. A no-op when no screen reader is running.
  useEffect(() => {
    if (sealed && Platform.OS === 'ios') {
      AccessibilityInfo.announceForAccessibility('Dossier amended — the record now reflects your hand');
    }
  }, [sealed]);

  const [isReady, setIsReady] = useState(false);
  useEffect(() => {
    const task = InteractionManager.runAfterInteractions(() => setIsReady(true));
    return () => task.cancel();
  }, []);

  const glowStyle = useAmbientGlow(0.04, 0.08, 3000);

  // KEYBOARD LAW (router-screen form): automaticallyAdjustKeyboardInsets on
  // the ScrollView scrolls the focused field above the keyboard on iOS;
  // Android's window resize handles it natively. Container padding removed —
  // it made room without scrolling to the field.

  if (!user) return null;

  return (
    <View style={{ flex: 1, backgroundColor: colors.ink }}>
      <View style={st.container}>
        <Animated.View style={[st.ambientGlow, glowStyle]}>
          <LinearGradient
            colors={['rgba(184,137,26,0.15)', 'transparent', 'transparent']}
            locations={[0, 0.4, 1]}
            style={StyleSheet.absoluteFillObject}
          />
        </Animated.View>
      
      <View style={[st.navBar, { paddingTop: insets.top + 8 }]}>
        <PressableScale onPress={handleBack} style={st.navBackBtn} hitSlop={{top: 15, bottom: 15, left: 15, right: 15}} haptic="light" accessibilityLabel="Go back">
          <ChevronLeft size={22} color={colors.bone} />
        </PressableScale>
        <PressableScale onPress={handleSave} disabled={saving} hitSlop={{top: 15, bottom: 15, left: 15, right: 15}} haptic="medium" accessibilityRole="button" accessibilityLabel={saving ? 'Saving profile' : 'Save profile changes'}>
          {saving ? <ActivityIndicator size="small" color={colors.sepia} /> : (
            <Text {...scaledTextProps} style={st.navSaveText}>SAVE</Text>
          )}
        </PressableScale>
      </View>

      <FormProvider {...form}>
        <ScrollView contentContainerStyle={[st.scrollContent, { paddingBottom: Math.max(insets.bottom, 100) }]} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets>

        {!!submitError && (
          <Animated.View entering={FadeInDown} style={{ paddingHorizontal: 16, paddingVertical: 12, backgroundColor: colors.errorBackground, borderWidth: 1, borderColor: colors.errorBorder, borderRadius: 4, marginBottom: 16, marginHorizontal: 16 }}>
            {/* Type-guard submitError to prevent invariant violation on object errors */}
            <Text {...scaledTextProps} style={{ fontFamily: fonts.sub, fontSize: 10, color: colors.crimson, textAlign: 'center', letterSpacing: 1 }}>
              {typeof submitError === 'string' ? submitError : (submitError instanceof Error ? submitError.message : (submitError as any)?.message || 'An unexpected error occurred while saving your dossier.')}
            </Text>
          </Animated.View>
        )}

        <Animated.View entering={FadeInDown.duration(600)} style={st.hero}>
          <View style={st.heroRuleTop} />
          <View style={st.heroEyebrowRow}>
            <Sparkles size={7} color={colors.sepia} strokeWidth={2} />
            <Text {...scaledTextProps} style={st.heroEyebrow}>THE DOSSIER BUREAU</Text>
            <Sparkles size={7} color={colors.sepia} strokeWidth={2} />
          </View>
          <Text {...scaledTextProps} style={st.heroTitle}>Edit Profile</Text>
          <Text {...scaledTextProps} style={st.heroDesc}>Shape how the society sees you.</Text>
          <View style={st.heroRuleBottom} />
        </Animated.View>


        {/* ════ PROFILE PICTURE ════ */}
        <Animated.View entering={FadeInDown.duration(500).delay(50)}>
          <SectionCard>
            <SectionHead icon={Camera} label="PROFILE PICTURE" />
            <View style={st.avatarSection}>
              <PressableScale 
                style={st.avatarWrap} 
                onPress={() => setShowCropModal(true)}
                accessibilityRole="button"
                accessibilityLabel="Change profile picture"
              >
                {avatarPreview ? (
                    <Image source={{ uri: avatarPreview }} style={st.avatarImg} contentFit="cover" transition={150} />
                ) : (
                    <Buster size={72} mood="smiling" />
                )}
                <View style={st.avatarOverlay}>
                    <Camera size={24} color={colors.parchment} />
                </View>
              </PressableScale>
              
              <Text {...scaledTextProps} style={st.avatarHint}>Tap portrait to change</Text>
              <Text {...scaledTextProps} style={st.avatarSpec}>JPG, PNG, or WEBP · MAX 5MB</Text>
              {avatarPreview && (
                <PressableScale onPress={handleRemoveAvatar} style={{ marginTop: 12, paddingVertical: 6, paddingHorizontal: 12, borderRadius: 4, backgroundColor: colors.errorBackground, borderWidth: 1, borderColor: colors.errorBorder }} haptic="light" accessibilityRole="button" accessibilityLabel="Remove portrait">
                  <Text {...scaledTextProps} style={{ fontFamily: fonts.sub, fontSize: 10, color: colors.crimson, textAlign: 'center', letterSpacing: 1 }}>REMOVE PORTRAIT</Text>
                </PressableScale>
              )}
            </View>
          </SectionCard>
        </Animated.View>
        
        <DiamondDivider />

        {/* ════ IDENTITY ════ */}
        <Animated.View entering={FadeInDown.duration(500).delay(100)}>
          <SectionCard>
            <SectionHead icon={User} label="IDENTITY" />

            <View style={st.fieldWrap}>
              <Text {...scaledTextProps} style={st.fieldLabel}>USERNAME</Text>
              <ControlledUsernameInput
                name="username"
                placeholderTextColor={colors.ash} maxLength={30} keyboardAppearance="dark" accessibilityLabel="Username" selectionColor={colors.sepia}
              />
              {!!errors.username && <Text {...scaledTextProps} style={st.errorText}>{errors.username.message}</Text>}
              <Text {...scaledTextProps} style={st.helperText}>Lowercase letters, numbers, and underscores only · 3-30 characters</Text>
            </View>

            <View style={st.fieldWrap}>
              <Text {...scaledTextProps} style={st.fieldLabel}>DISPLAY NAME</Text>
              <ControlledInput
                name="displayName"
                style={st.fieldInput}
                placeholderTextColor={colors.ash} placeholder="Your name in the credits..." maxLength={50} keyboardAppearance="dark" accessibilityLabel="Display name" selectionColor={colors.sepia}
              />
              {!!errors.displayName && <Text {...scaledTextProps} style={st.errorText}>{errors.displayName.message}</Text>}
            </View>

            <View style={st.fieldWrap}>
              <Text {...scaledTextProps} style={st.fieldLabel}>BIO</Text>
              <ControlledBioInput
                name="bio"
                maxLength={160}
                placeholderTextColor={colors.ash} placeholder="A brief dispatch about your cinematic journey..." keyboardAppearance="dark" accessibilityLabel="Bio" selectionColor={colors.sepia} returnKeyType="done" blurOnSubmit={true}
              />
              {!!errors.bio && <Text {...scaledTextProps} style={st.errorText}>{errors.bio.message}</Text>}
            </View>
          </SectionCard>
        </Animated.View>
        
        <DiamondDivider />

        {/* ════ FAVORITE FILMS ════ */}
        {isReady && (
          <Animated.View entering={FadeInDown.duration(500).delay(150)}>
              <SectionCard>
                  <SectionHead icon={Film} label="FAVORITE FILMS" />
                  <Text {...scaledTextProps} style={st.fieldBody}>Choose 3 films that define your cinematic identity. Tap a slot to search and select.</Text>
                  <ProfileTriptych 
                    user={{ 
                      id: user.id, 
                      preferences: user.preferences ? { favorites: user.preferences.favorites as import('@/src/components/profile/ProfileTriptych').TriptychFilm[] } : null 
                    }} 
                    isOwnProfile={true}
                    userRole={resolveTier(user)}
                  />
              </SectionCard>
          </Animated.View>
        )}

        {/* ════ THE BACKDROP — Auteur only ════
            It sits directly under the triptych because it is about the
            triptych: the centre panel is the film it dresses the page with. */}
        {isReady && isAuteurPlusTier(user) && (
          <>
            <DiamondDivider />
            <Animated.View entering={FadeInDown.duration(500).delay(175)}>
              <BackdropSetting user={user as { id: string; preferences?: Record<string, unknown> | null }} />
            </Animated.View>
          </>
        )}

        <DiamondDivider />

        {/* ════ LINKS ════ */}
        {isReady && (
          <Animated.View entering={FadeInDown.duration(500).delay(200)}>
              <SectionCard>
                  <SectionHead icon={Link2} label="LINKS" />
                  <LinksEditor 
                    links={fields} 
                    handleAddLink={handleAddLink} 
                    handleRemoveLink={handleRemoveLink} 
                    errors={errors as unknown as import('@/src/features/profile/LinksEditor').LinksEditorProps['errors']} 
                  />
              </SectionCard>
          </Animated.View>
        )}


        {/* ── Heritage Footer ── */}
        <Animated.View entering={FadeInDown.duration(500).delay(250)} style={st.heritageFooter}>
          <DiamondDivider />

          <Text {...scaledTextProps} style={st.memberSince}>
            MEMBER SINCE {user.created_at ? formatDateMonthYear(user.created_at) : 'THE BEGINNING'}
          </Text>

          <View style={st.endMarkRow}>
            <View style={st.endMarkLine} />
            <Sparkles size={8} color={colors.sepia} strokeWidth={1.5} />
            <View style={st.endMarkLine} />
          </View>
        </Animated.View>

          </ScrollView>
        </FormProvider>
      </View>

      {/* The save-seal ceremony — one stamped beat before returning to the dossier. */}
      {sealed && (
        <View style={st.sealOverlay} accessibilityLiveRegion="polite">
          <Animated.View entering={FadeIn.duration(220)} style={st.sealStamp}>
            <View style={st.sealRing}>
              <Stamp size={24} color={colors.crimson} strokeWidth={1.5} />
            </View>
            <Text {...scaledTextProps} style={st.sealTitle}>DOSSIER AMENDED</Text>
            <Text {...scaledTextProps} style={st.sealSub}>the record now reflects your hand</Text>
          </Animated.View>
        </View>
      )}

      {/* Decouple modal from keyboard avoidance view to prevent UI jump */}
      {showCropModal && (
        <AvatarCropSheet 
           onClose={() => setShowCropModal(false)}
           onSuccess={(base64: string) => {
               setAvatarBase64(base64);
               setAvatarPreview(`data:image/jpeg;base64,${base64}`);
               setShowCropModal(false);
           }}
        />
      )}
    </View>
  );
}
