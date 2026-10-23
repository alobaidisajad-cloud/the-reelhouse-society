import { useState, useEffect, useRef, useCallback } from 'react';
import { View, StyleSheet, Alert, Modal, type LayoutChangeEvent, type ScrollView } from 'react-native';
import { Text, TextInput } from '@/src/components/text';
import { AnimatedText } from '@/src/components/text/AnimatedText';
import { BlurView } from 'expo-blur';
import { useContentBottom, usePushedHeaderTop } from '@/src/components/layout/navMetrics';
import Animated, {
  useSharedValue, useAnimatedStyle, useAnimatedScrollHandler, withTiming,
  Easing, withRepeat, cancelAnimation, interpolate, Extrapolation, ReduceMotion,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { usePreventRemove, useNavigation } from '@react-navigation/native';
import { useLocalSearchParams } from 'expo-router';
import Constants from 'expo-constants';
import { nav } from '@/src/utils/typedRouter';
import TactileEngine from '@/src/utils/TactileEngine';
import {
  ChevronLeft, LogOut, Trash2, Scale, Gavel, Shield, Scroll, FileText,
  ArrowDownUp, Sparkles, DoorOpen, KeyRound,
} from 'lucide-react-native';

import { useAuthStore } from '@/src/stores/auth';
import { profileRead } from '@/src/utils/profileRead';
import { useSettingsStore } from '@/src/stores/settings';
import { supabase } from '@/src/lib/supabase';
import reelToast from '@/src/utils/reelToast';
import * as LocalAuthentication from 'expo-local-authentication';
import { useUpdateUser } from '@/src/hooks/useUpdateUser';
import { AuthService } from '@/src/services/AuthService';
import { ModerationService } from '@/src/services/ModerationService';
import { useAmbientGlow } from '@/src/hooks/useAmbientGlow';
import { colors } from '@/src/theme/theme';
import { UNREADY } from '@/src/theme/unready';
import { scaledTextProps, displayTextProps } from '@/src/constants/textScaling';
import DataVault from '@/src/features/settings/DataVault';
import { storage } from '@/src/stores/mmkv-storage';
import PressableScale from '@/src/components/PressableScale';
import { isArchivistPlusTier, resolveTier } from '@/src/utils/tier';
import { STORE } from '@/src/components/society/SmallPrint';
import { formatDateMonthYear } from '@/src/utils/timeAgo';
import { DEFAULT_DURATION } from '@/src/utils/enter';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { SettingsSchema, type SettingsFormData } from '@/src/schemas/settings';

import { PatronageSection, AccountSection, PrivacySection, NotificationsSection, ExperienceSection, FrontDeskSection, SectionCard, SectionHead, ActionBtn } from '@/src/features/settings/SettingsSections';
import { openHousePage, writeToFrontDesk, copySupportAddress } from '@/src/utils/housePages';
import { SUPPORT_EMAIL, SUPPORT_URL, TERMS_URL, PRIVACY_URL } from '@/src/constants/support';
import { st } from '@/src/features/settings/settings.styles';
import { ToastHost } from '@/src/components/ToastHost';
import { CentredCard } from '@/src/components/layout/CentredCard';
import { RoomLight } from '@/src/components/atmosphere/RoomLight';
import { mapAuthError } from '@/src/hooks/useAuthFlow';
import { EMAIL_CODE_DIGITS } from '@/src/constants/inputLimits';
import { raceDeadline } from '@/src/utils/raceDeadline';
import NetInfo from '@react-native-community/netinfo';
import { flushOfflineQueue, getQueueLength } from '@/src/utils/offlineQueue';
import { erasedBySigningOut, keptFor } from '@/src/utils/keptOnThisPhone';
import { counted } from '@/src/utils/counted';
import { Arrive } from '@/src/components/Arrive';
import { useScreenReady } from '@/src/hooks/useScreenReady';
import { RoomRetrieving, RoomUnreachable } from '@/src/components/profile/RoomParts';

/** The phone's answer about its lock, or no lock: a check that hangs or fails is a no. */
const lockAnswer = (asked: Promise<boolean>): Promise<boolean> => raceDeadline(asked, 2000).catch(() => false);

const AnimatedSparkles = Animated.createAnimatedComponent(Sparkles);

/** The phone's own lock was put away (by the member, the system or the app): not a failure. */
const LOCK_PUT_AWAY = new Set(['user_cancel', 'system_cancel', 'app_cancel']);

/** How long the sign-out waits for the queue to go out before it names what is left. */
const SEND_BEFORE_LEAVING_MS = 8000;

/** Supabase's own floor for repeat OTP sends. Asking sooner only earns an error. */
const OTP_RESEND_SECONDS = 60;

/** Where the letterhead has left the screen and the bar should carry the name. */
const TITLE_FADE_FROM = 130;
const TITLE_FADE_TO = 210;

export function SettingsScreen() {
  const { user, logout } = useAuthStore();
  const { mutateAsync: updateUserMutation, isPending: isUpdatingUser } = useUpdateUser();
  const end = useContentBottom();
  const headerTop = usePushedHeaderTop();
  // A door to one section (`/settings?section=import`) lands on it, once.
  const { section } = useLocalSearchParams<{ section?: string }>();
  const scrollRef = useRef<ScrollView>(null);
  const landedRef = useRef(false);
  const landOn = (name: string) => (e: LayoutChangeEvent) => {
    if (section !== name || landedRef.current) return;
    landedRef.current = true;
    scrollRef.current?.scrollTo({ y: Math.max(0, e.nativeEvent.layout.y - 16), animated: true });
  };
  const navigation = useNavigation();
  const isMountedRef = useRef(true);

  useEffect(() => {
    // Re-armed on mount. A ref only ever set to false stays false through a Fast
    // Refresh or a StrictMode double-invoke, and then every guarded update on
    // this screen is silently skipped.
    isMountedRef.current = true;
    return () => { isMountedRef.current = false; };
  }, []);

  // ── General ──
  const userRole = resolveTier(user);

  // ── The Tribunal door (proprietor only) ──
  // role === 'admin' comes from the profiles row; members never render this.
  const isAdmin = user?.role === 'admin';
  const [tribunalWaiting, setTribunalWaiting] = useState<number | null>(null);
  useEffect(() => {
    if (!isAdmin) return;
    let cancelled = false;
    ModerationService.getPendingCount()
      .then((n) => { if (!cancelled) setTribunalWaiting(n); })
      .catch(() => { /* the door still opens without its number */ });
    return () => { cancelled = true; };
  }, [isAdmin]);

  const [otpModalVisible, setOtpModalVisible] = useState(false);
  const [otpAction, setOtpAction] = useState<'deleteAccount' | 'toggleBiometric' | null>(null);
  const [otpCode, setOtpCode] = useState('');
  const [otpSending, setOtpSending] = useState(false);
  const [otpVerifying, setOtpVerifying] = useState(false);
  /** Said in the modal, not only in a toast that has already faded. */
  const [otpError, setOtpError] = useState<string | null>(null);
  const [resendIn, setResendIn] = useState(0);
  const nextBiometricStateRef = useRef<boolean>(false);
  const pendingSaveDataRef = useRef<SettingsFormData | null>(null);

  // Counts down only while the box is open; cleared on unmount either way.
  useEffect(() => {
    if (!otpModalVisible || resendIn <= 0) return;
    const t = setTimeout(() => { if (isMountedRef.current) setResendIn(s => s - 1); }, 1000);
    return () => clearTimeout(t);
  }, [otpModalVisible, resendIn]);

  /** Sends the cipher and reports the outcome IN the box. */
  const sendOtp = useCallback(async (): Promise<boolean> => {
    if (!user?.email) {
      setOtpError('This account has no email address, so a code cannot be sent.');
      return false;
    }
    setOtpSending(true);
    setOtpError(null);
    try {
      // shouldCreateUser: false — this is a re-auth challenge for an existing
      // account; the OTP endpoint must never be able to mint a new user.
      const { error } = await supabase.auth.signInWithOtp({ email: user.email, options: { shouldCreateUser: false } });
      if (error) throw error;
      if (isMountedRef.current) setResendIn(OTP_RESEND_SECONDS);
      reelToast.success(`Security code sent to ${user.email}`);
      return true;
    } catch (e: unknown) {
      // The box stays open, with the reason and a way to send again.
      if (isMountedRef.current) {
        const raw = (e as { message?: unknown } | null)?.message;
        setOtpError(typeof raw === 'string' && raw
          ? mapAuthError(raw).message
          : 'The code could not be sent. Check your connection and try again.');
      }
      return false;
    } finally {
      if (isMountedRef.current) setOtpSending(false);
    }
  }, [user?.email]);

  const requestOtpAuth = useCallback(async (action: 'deleteAccount' | 'toggleBiometric') => {
    setOtpAction(action);
    setOtpCode('');
    setOtpError(null);
    setResendIn(0);
    setOtpModalVisible(true);
    await sendOtp();
  }, [sendOtp]);

  /** The one erasure, whichever check (the phone's lock or the emailed code) let the member through. */
  const completeAccountDeletion = useCallback(async (): Promise<void> => {
    try {
      await AuthService.requestAccountDeletion();
    } catch {
      reelToast.error(`Account deletion failed. Try again, or write to ${SUPPORT_EMAIL} and we will do it for you.`);
      return;
    }
    try { await logout(); } catch { /* local teardown continues regardless */ }
    // logout() clears the stores and its own known keys; this removes everything
    // else this install ever wrote — drafts, receipts, flags, throttles.
    storage.clearAll();
    TactileEngine.destroy();
    nav.replace('/login');
  }, [logout]);

  const executePendingOtpAction = async () => {
    if (otpAction === 'deleteAccount') {
      await completeAccountDeletion();
    } else if (otpAction === 'toggleBiometric') {
      const data = pendingSaveDataRef.current;
      if (!data) return;

      const nextVal = nextBiometricStateRef.current;
      try {
        await updateUserMutation(amendments({ ...data, biometricLock: nextVal }));
        if (isMountedRef.current) {
          reset({ ...data, biometricLock: nextVal });
          TactileEngine.success();
          reelToast.success('Your dossier has been amended.');
        }
      } catch {
        // Mutation error handled globally; prevent reset/success falsely.
      }
    }
  };

  const handleOtpVerify = async () => {
    if (!user?.email || !otpCode || otpCode.length < 6) return;
    setOtpVerifying(true);
    setOtpError(null);
    try {
      const { error } = await supabase.auth.verifyOtp({ email: user.email, token: otpCode, type: 'email' });
      if (error) throw error;
      setOtpModalVisible(false);
      setOtpCode('');
      await executePendingOtpAction();
    } catch {
      if (isMountedRef.current) setOtpError('That code is invalid or has expired.');
    } finally {
      if (isMountedRef.current) setOtpVerifying(false);
    }
  };

  const currentPrefs = user?.preferences;

  // Whether the member's profile is read, and if not, asked for here: the form waits for it.
  const profileKnown = useAuthStore((s) => profileRead(s.user));
  const [profileFailed, setProfileFailed] = useState(false);
  const askProfile = useCallback(async () => {
    setProfileFailed(false);
    const held = await useAuthStore.getState().rereadProfile();
    if (isMountedRef.current && !held) setProfileFailed(true);
  }, []);
  const memberId = user?.id;
  useEffect(() => {
    // Not awaited: its answer lands in the store, and a failure in profileFailed.
    if (memberId && !profileKnown) void askProfile();
  }, [memberId, profileKnown, askProfile]);

  /** The form, as the profile keeps it: over the member's other preferences, never instead of them. */
  const amendments = (data: SettingsFormData) => ({
    is_social_private: data.socialVisibility === 'private',
    preferences: {
      ...(useAuthStore.getState().user?.preferences || {}),
      tactile_audio_enabled: useSettingsStore.getState().tactileAudioEnabled,
      notif_follows: data.notifFollows,
      notif_endorsements: data.notifEndorsements,
      notif_comments: data.notifComments,
      notif_system: data.notifSystem,
      social_visibility: data.socialVisibility,
      privacy_endorsements: data.privacyEndorsements,
      privacy_annotations: data.privacyAnnotations,
      biometric_lock: data.biometricLock,
    },
  });

  const { control, handleSubmit, reset, setValue, formState: { isDirty, dirtyFields } } = useForm<SettingsFormData>({
    resolver: zodResolver(SettingsSchema),
    defaultValues: {
      socialVisibility: (user?.is_social_private ? 'private' : 'public') as 'public' | 'private',
      privacyEndorsements: (currentPrefs?.privacy_endorsements || 'everyone') as 'everyone' | 'followers' | 'nobody',
      privacyAnnotations: (currentPrefs?.privacy_annotations || 'everyone') as 'everyone' | 'followers' | 'nobody',
      notifFollows: currentPrefs?.notif_follows ?? true,
      notifEndorsements: currentPrefs?.notif_endorsements ?? true,
      notifComments: currentPrefs?.notif_comments ?? true,
      notifSystem: currentPrefs?.notif_system ?? true,
      biometricLock: (currentPrefs?.biometric_lock as boolean) ?? false,
    }
  });

  // Sync from Supabase gracefully if no local edits
  useEffect(() => {
    if (!isDirty) {
      const visibility = (user?.is_social_private ? 'private' : 'public') as 'public' | 'private';
      reset({
        socialVisibility: visibility,
        privacyEndorsements: (currentPrefs?.privacy_endorsements || 'everyone') as 'everyone' | 'followers' | 'nobody',
        privacyAnnotations: (currentPrefs?.privacy_annotations || 'everyone') as 'everyone' | 'followers' | 'nobody',
        notifFollows: currentPrefs?.notif_follows ?? true,
        notifEndorsements: currentPrefs?.notif_endorsements ?? true,
        notifComments: currentPrefs?.notif_comments ?? true,
        notifSystem: currentPrefs?.notif_system ?? true,
        biometricLock: (currentPrefs?.biometric_lock as boolean) ?? false,
      });
    }
  }, [currentPrefs, user?.is_social_private, isDirty, reset]);

  const handleSave = handleSubmit(async (data) => {
    // Never over a profile not read: the form's defaults would be saved as the member's settings.
    if (!user || isUpdatingUser || !profileRead(user)) return;
    pendingSaveDataRef.current = data;

    let biometricCanceled = false;

    if (data.biometricLock !== (currentPrefs?.biometric_lock === true)) {
      const hasHardware = await lockAnswer(LocalAuthentication.hasHardwareAsync());
      const isEnrolled = await lockAnswer(LocalAuthentication.isEnrolledAsync());
      if (hasHardware && isEnrolled) {
        let result;
        try {
          result = await LocalAuthentication.authenticateAsync({
            promptMessage: data.biometricLock ? 'Confirm identity to enable Biometric Security' : 'Confirm identity to disable Biometric Security',
            fallbackLabel: 'Use Passcode',
            disableDeviceFallback: false,
          });
        } catch {
          nextBiometricStateRef.current = data.biometricLock;
          requestOtpAuth('toggleBiometric');
          return;
        }

        if (!result.success) {
          if (LOCK_PUT_AWAY.has(result.error)) {
            setValue('biometricLock', currentPrefs?.biometric_lock === true, { shouldDirty: true });

            const hasOtherChanges = Object.keys(dirtyFields).some(k => k !== 'biometricLock');
            if (!hasOtherChanges) {
              TactileEngine.error();
              reelToast.error('Changes not saved. Verification canceled.');
              return;
            }

            data.biometricLock = currentPrefs?.biometric_lock === true;
            biometricCanceled = true;
          } else {
            nextBiometricStateRef.current = data.biometricLock;
            requestOtpAuth('toggleBiometric');
            return;
          }
        }
      } else {
        nextBiometricStateRef.current = data.biometricLock;
        requestOtpAuth('toggleBiometric');
        return;
      }
    }

    try {
      await updateUserMutation(amendments(data));
      if (isMountedRef.current) {
        reset(data);
        TactileEngine.success();
        if (biometricCanceled) {
          reelToast.success('Settings saved (Biometric update canceled)');
        } else {
          reelToast.success('Your dossier has been amended.');
        }
      }
    } catch { /* surfaced by useUpdateUser's onError */ }
  });

  const saving = isUpdatingUser;

  /** Every exit asks first: the arrow, the iOS swipe and Android's back alike. */
  usePreventRemove(isDirty && !saving, ({ data }) => {
    Alert.alert('Discard changes?', 'You have unsaved modifications in your dossier.', [
      { text: 'Keep editing', style: 'cancel' },
      { text: 'Discard', style: 'destructive', onPress: () => navigation.dispatch(data.action) },
    ]);
  });

  const handleSignOut = async () => {
    // Online, what is queued is sent before the session ends; what is left is named.
    if (getQueueLength() > 0) {
      const net = await NetInfo.fetch().catch(() => null);
      if (net?.isConnected && net.isInternetReachable !== false) {
        await raceDeadline(flushOfflineQueue(), SEND_BEFORE_LEAVING_MS).catch(() => {});
      }
    }
    const erased = user ? erasedBySigningOut(keptFor(user.id)) : null;
    Alert.alert('Depart the Society', erased ?? 'Your membership will remain. You may return at any time.', [
      { text: erased ? 'STAY SIGNED IN' : 'CANCEL', style: 'cancel' },
      { text: 'SIGN OUT', style: 'destructive', onPress: () => {
        // Leaving gives nothing away, so no lock stands at the door out: offline,
        // or with Face ID failing, a member can always sign out.
        logout().catch(() => {});
        TactileEngine.destroy();
        nav.replace('/login');
      }},
    ]);
  };

  const handleDeleteAccount = async () => {
    // Deleting the account does not end a store subscription; a paying member is told so first.
    const paying = isArchivistPlusTier(userRole)
      ? ` If you pay through ${STORE.name}, cancel there too (in ${STORE.settings}): deleting your account does not stop the subscription.`
      : '';
    Alert.alert(
      'Expunge All Records',
      `This will permanently destroy your dossier, all logs, stacks, and critiques. This action is irreversible.${paying}`,
      [
        { text: 'CANCEL', style: 'cancel' },
        { text: 'DELETE', style: 'destructive', onPress: async () => {
          const biometricEnabled = user?.preferences?.biometric_lock === true;
          if (biometricEnabled) {
            const hasHardware = await lockAnswer(LocalAuthentication.hasHardwareAsync());
            const isEnrolled = await lockAnswer(LocalAuthentication.isEnrolledAsync());

            if (hasHardware && isEnrolled) {
              try {
                const result = await LocalAuthentication.authenticateAsync({
                  promptMessage: 'Confirm your identity to delete account',
                  fallbackLabel: 'Use Passcode',
                  disableDeviceFallback: false,
                });
                if (!result.success) {
                  if (LOCK_PUT_AWAY.has(result.error)) return;
                  requestOtpAuth('deleteAccount');
                  return;
                }
              } catch {
                requestOtpAuth('deleteAccount');
                return;
              }
            } else {
              requestOtpAuth('deleteAccount');
              return;
            }
          } else {
            requestOtpAuth('deleteAccount');
            return;
          }
          // Same erasure as the code route — one function, no drift.
          await completeAccountDeletion();
        }},
      ]
    );
  };

  const glowStyle = useAmbientGlow(0.04, 0.08, 3000);

  const spinValue = useSharedValue(0);
  useEffect(() => {
    if (saving) {
      spinValue.value = withRepeat(
        withTiming(1, { duration: 1500, easing: Easing.linear, reduceMotion: ReduceMotion.System }),
        -1,
        false
      );
    } else {
      cancelAnimation(spinValue);
      spinValue.value = 0;
    }
  }, [saving, spinValue]);

  const spinStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${spinValue.value * 360}deg` }]
  }));

  // The page is eight cards tall and had no name past the first screen.
  const scrollY = useSharedValue(0);
  const onScroll = useAnimatedScrollHandler((e) => { scrollY.value = e.contentOffset.y; });
  const navTitleStyle = useAnimatedStyle(() => ({
    opacity: interpolate(scrollY.value, [TITLE_FADE_FROM, TITLE_FADE_TO], [0, 1], Extrapolation.CLAMP),
  }));

  // Drawn from what this phone holds, so ready at once: the lab's control page (WORKLIST P0.112).
  // Unless the member's profile is not yet read (a login's first moments, or a read that gave
  // up): then the form is not drawn, and the page reads it.
  const readyMark = useScreenReady('settings', profileKnown ? 'ready' : profileFailed ? 'failed' : 'reading');

  if (!user) return null;

  const appVersion = Constants.expoConfig?.version ?? '';
  // Not while a code is being checked: the answer would land on a closed sheet.
  const closeOtp = () => { if (!otpVerifying) setOtpModalVisible(false); };

  return (
    <View style={st.container}>
      <RoomLight room="default" />
      {readyMark}
      <Animated.View style={[st.ambientGlow, glowStyle]} pointerEvents="none">
        <LinearGradient colors={['rgba(184,137,26,0.15)', 'transparent', 'transparent']} locations={[0, 0.4, 1]} style={StyleSheet.absoluteFillObject} />
      </Animated.View>
      <View style={[st.navBar, { paddingTop: headerTop }]}>
        <PressableScale
          onPress={() => { if (!saving) nav.back(); }}
          style={st.navBackBtn}
          hitSlop={null}
          haptic="light"
          accessibilityLabel="Go back"
          accessibilityRole="button"
          disabled={saving}
        >
          <ChevronLeft color={colors.bone} size={22} />
        </PressableScale>

        {/* A visual echo of the heading below, for when the letterhead has
            scrolled away. Hidden from assistive tech in both dialects: a reader
            already has the real <header>, and would otherwise meet the word
            "Settings" twice before reaching anything it can act on. */}
        <AnimatedText
          style={[st.navTitle, navTitleStyle]}
          numberOfLines={1}
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          {...displayTextProps}
        >
          Settings
        </AnimatedText>

        <PressableScale
          onPress={handleSave}
          disabled={saving || !isDirty}
          style={st.navSaveBtn}
          hitSlop={null}
          haptic="medium"
          pressedScale={0.95}
          accessibilityRole="button"
          accessibilityState={{ disabled: saving || !isDirty }}
          accessibilityLabel={saving ? 'Filing your amendments' : isDirty ? 'Save settings' : 'Save settings. Nothing has changed yet.'}
        >
          {saving
            ? <AnimatedSparkles size={12} color={colors.sepia} style={spinStyle} />
            : isDirty
              ? <View style={st.navSavePill}><Text style={st.navSavePillText} {...scaledTextProps}>SAVE</Text></View>
              : <Text style={st.navSaveText} {...scaledTextProps}>SAVE</Text>}
        </PressableScale>
      </View>

      {/* KEYBOARD LAW (router-screen form): automaticallyAdjustKeyboardInsets
          scrolls the focused field above the keyboard on iOS; on Android the
          root ends at the keyboard (KeyboardRoom) and this shorter view scrolls. */}
      <Animated.ScrollView
        ref={scrollRef}
        contentContainerStyle={{ paddingBottom: end }}
        showsVerticalScrollIndicator={false}
        onScroll={onScroll}
        scrollEventThrottle={16}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
        automaticallyAdjustKeyboardInsets
      >
        <Arrive name="settingsscreen-1" duration={600} style={st.hero}>
          <View style={st.heroRuleTop} />
          <View style={st.heroEyebrowRow}>
            <Sparkles size={7} color={colors.sepia} strokeWidth={2} />
            <Text style={st.heroEyebrow} {...scaledTextProps}>EST. 1924</Text>
            <Sparkles size={7} color={colors.sepia} strokeWidth={2} />
          </View>
          <Text style={st.heroTitle} accessibilityRole="header" {...displayTextProps}>Settings</Text>
          <Text style={st.heroDesc} {...scaledTextProps}>Configure your presence within The Society.</Text>
          <View style={st.heroRuleBottom} />
        </Arrive>

        {/* ── Your standing ── */}
        <PatronageSection userRole={userRole} onUpgrade={() => nav.push('/membership')} />

        {/* ── Chapter: your dossier ── */}
        <View style={st.ornRule}><View style={st.ornLine} /><View style={st.ornDiamond} /><View style={st.ornLine} /></View>

        {/* The form only over a profile read: drawn from the auth user alone, a private
            profile read as public and a save wrote it so. */}
        {profileKnown ? (
          <>
            <AccountSection user={user} control={control} saving={saving} />
            <PrivacySection control={control} saving={saving} />
            <NotificationsSection control={control} saving={saving} />
          </>
        ) : (
          <SectionCard>
            {profileFailed
              ? <RoomUnreachable room="your settings" onRetry={() => { void askProfile(); }} />
              : <RoomRetrieving room="your settings" />}
          </SectionCard>
        )}

        {/* ── Chapter: this device, and your data ── */}
        <View style={st.ornRule}><View style={st.ornLine} /><View style={st.ornDiamond} /><View style={st.ornLine} /></View>

        <ExperienceSection />

        <Arrive name="settingsscreen-2" duration={DEFAULT_DURATION} delay={300} onLayout={landOn('import')}>
          <SectionCard>
            <SectionHead icon={ArrowDownUp} label="IMPORT & EXPORT" />
            <DataVault />
          </SectionCard>
        </Arrive>

        {/* ── Chapter: the house ── */}
        <View style={st.ornRule}><View style={st.ornLine} /><View style={st.ornDiamond} /><View style={st.ornLine} /></View>

        <Arrive name="settingsscreen-3" duration={DEFAULT_DURATION} delay={325}>
          <FrontDeskSection
            memberId={user?.id ?? null}
            onWrite={(id) => { void writeToFrontDesk(id); }}
            onHelp={() => { void openHousePage(SUPPORT_URL); }}
            onCopy={() => { void copySupportAddress(); }}
          />
        </Arrive>

        <Arrive name="settingsscreen-4" duration={DEFAULT_DURATION} delay={350}>
          <SectionCard>
            <SectionHead icon={Scroll} label="LEGAL" />
            <View style={st.legalActions}>
              <ActionBtn icon={Shield} label="PRIVACY POLICY" onPress={() => { void openHousePage(PRIVACY_URL); }} />
              <ActionBtn icon={FileText} label="TERMS OF SERVICE" onPress={() => { void openHousePage(TERMS_URL); }} />
            </View>
          </SectionCard>
        </Arrive>

        {isAdmin && (
          <Arrive name="settingsscreen-5" duration={DEFAULT_DURATION} delay={375}>
            <SectionCard>
              <SectionHead icon={Scale} label="ADMINISTRATION" />
              <View style={st.legalActions}>
                <ActionBtn
                  icon={Gavel}
                  label={tribunalWaiting ? `ENTER THE TRIBUNAL · ${tribunalWaiting} WAITING` : 'ENTER THE TRIBUNAL'}
                  onPress={() => nav.push('/tribunal' as never)}
                />
              </View>
            </SectionCard>
          </Arrive>
        )}

        {/* ── Chapter: the way out ── */}
        <View style={st.ornRule}><View style={st.ornLine} /><View style={st.ornDiamond} /><View style={st.ornLine} /></View>

        <Arrive name="settingsscreen-6" duration={DEFAULT_DURATION} delay={400}>
          <SectionCard danger>
            <SectionHead icon={DoorOpen} label="ACCOUNT ACTIONS" danger />
            <View style={st.legalActions}>
              <ActionBtn icon={LogOut} label="SIGN OUT" onPress={handleSignOut} />
              <View style={st.divider} />
              <ActionBtn icon={Trash2} label="DELETE ACCOUNT" onPress={handleDeleteAccount} danger />
            </View>
          </SectionCard>
        </Arrive>

        <Arrive name="settingsscreen-7" duration={DEFAULT_DURATION} delay={450} style={st.heritageFooter}>
          <Text style={st.memberSince} {...scaledTextProps}>MEMBER SINCE {user.created_at ? formatDateMonthYear(user.created_at) : 'THE BEGINNING'}</Text>
          <View style={st.endMarkRow}>
            <View style={st.endMarkLine} /><Sparkles size={8} color={colors.sepia} strokeWidth={1.5} /><View style={st.endMarkLine} />
          </View>
          <Text style={st.heritageCopyright} {...scaledTextProps}>© 1924–{new Date().getFullYear()} The ReelHouse Society. All dossiers are classified.</Text>
          {!!appVersion && <Text style={st.edition} {...scaledTextProps}>EDITION {appVersion}</Text>}
        </Arrive>
      </Animated.ScrollView>

      <Modal statusBarTranslucent visible={otpModalVisible} animationType="fade" transparent onRequestClose={closeOtp}>
        <BlurView intensity={80} tint="dark" style={StyleSheet.absoluteFill} />
        {/* RN Modal windows never resize for the keyboard, so the screen's
            automaticallyAdjustKeyboardInsets cannot reach inside one: the card's
            own scroll ends above the keys (CentredCard), on both platforms. */}
        <View style={st.modalOverlay} onAccessibilityEscape={closeOtp}>
          <CentredCard style={st.modalRoom}>
            <View style={st.modalContent}>
              <View style={st.modalHeader}>
                <KeyRound color={colors.bloodReel} size={16} />
                <Text style={st.modalTitle} {...scaledTextProps}>SECURITY VERIFICATION</Text>
              </View>
              <Text style={st.modalDesc} {...scaledTextProps}>
                {otpAction === 'deleteAccount' && 'Enter the 6-digit cipher sent to your email to authorize account deletion.'}
                {otpAction === 'toggleBiometric' && 'Enter the 6-digit cipher sent to your email to authorize this security change.'}
              </Text>
              {!!otpError && <Text style={st.modalFail} {...scaledTextProps}>{otpError}</Text>}
              <TextInput
                style={st.otpInput}
                value={otpCode}
                onChangeText={(t) => { setOtpCode(t); if (otpError) setOtpError(null); }}
                keyboardType="number-pad"
                maxLength={EMAIL_CODE_DIGITS}
                placeholder="000000"
                placeholderTextColor={colors.fog}
                selectionColor={colors.selection}
                editable={!otpVerifying}
                autoFocus
                accessibilityLabel="Six digit security code"
                {...scaledTextProps}
              />
              <PressableScale
                style={st.modalResend}
                onPress={() => { sendOtp(); }}
                disabled={otpSending || otpVerifying || resendIn > 0}
                hitSlop={null}
                haptic="selection"
                accessibilityRole="button"
                accessibilityState={{ disabled: otpSending || otpVerifying || resendIn > 0 }}
                accessibilityLabel={resendIn > 0 ? `Send a new code. Available in ${counted(resendIn, 'second', 'seconds')}.` : 'Send a new code'}
              >
                <Text style={[st.modalResendText, (otpSending || resendIn > 0) && UNREADY.words]} {...scaledTextProps}>
                  {otpSending ? 'SENDING…' : resendIn > 0 ? `SEND A NEW CODE IN ${resendIn}s` : 'SEND A NEW CODE'}
                </Text>
              </PressableScale>
              <View style={st.modalActions}>
                <PressableScale style={st.modalBtnCancel} disabled={otpVerifying} hitSlop={null} accessibilityRole="button" accessibilityLabel="Cancel" onPress={() => { setOtpModalVisible(false); setOtpCode(''); setOtpError(null); }}>
                  <Text style={st.modalBtnCancelText} {...scaledTextProps}>CANCEL</Text>
                </PressableScale>
                <PressableScale style={[st.modalBtnConfirm, (!otpCode || otpCode.length < 6) && st.disabledBtn]} hitSlop={null} onPress={handleOtpVerify} disabled={otpVerifying || !otpCode || otpCode.length < 6} accessibilityRole="button" accessibilityLabel="Verify code">
                  <Text style={st.modalBtnConfirmText} {...scaledTextProps}>{otpVerifying ? 'VERIFYING…' : 'VERIFY'}</Text>
                </PressableScale>
              </View>
            </View>
          </CentredCard>
        </View>
        <ToastHost />
      </Modal>

    </View>
  );
}
