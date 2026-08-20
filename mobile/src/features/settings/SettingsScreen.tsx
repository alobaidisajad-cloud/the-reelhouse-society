import { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, StyleSheet,
  Alert, Modal, TextInput, KeyboardAvoidingView
} from 'react-native';
import { BlurView } from 'expo-blur';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, {
  useSharedValue, useAnimatedStyle, useAnimatedScrollHandler, withTiming,
  Easing, withRepeat, cancelAnimation, interpolate, Extrapolation, ReduceMotion,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { usePreventRemove, useNavigation } from '@react-navigation/native';
import Constants from 'expo-constants';
import { nav } from '@/src/utils/typedRouter';
import TactileEngine from '@/src/utils/TactileEngine';
import {
  ChevronLeft, LogOut, Trash2, Scale, Gavel, Shield, Scroll, FileText,
  ArrowDownUp, Sparkles, DoorOpen, KeyRound,
} from 'lucide-react-native';

import { useAuthStore } from '@/src/stores/auth';
import { useSettingsStore } from '@/src/stores/settings';
import { supabase } from '@/src/lib/supabase';
import reelToast from '@/src/utils/reelToast';
import { safeOpenURL } from '@/src/utils/linking';
import * as LocalAuthentication from 'expo-local-authentication';
import { useUpdateUser } from '@/src/hooks/useUpdateUser';
import { AuthService } from '@/src/services/AuthService';
import { ModerationService } from '@/src/services/ModerationService';
import { useAmbientGlow } from '@/src/hooks/useAmbientGlow';
import { colors } from '@/src/theme/theme';
import { scaledTextProps, displayTextProps } from '@/src/constants/textScaling';
import DataVault from '@/src/features/settings/DataVault';
import { storage } from '@/src/stores/mmkv-storage';
import PressableScale from '@/src/components/PressableScale';
import { resolveTier } from '@/src/utils/tier';
import { formatDateMonthYear } from '@/src/utils/timeAgo';
import { enterDown } from '@/src/utils/enter';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { SettingsSchema, type SettingsFormData } from '@/src/schemas/settings';

import { PatronageSection, AccountSection, PrivacySection, NotificationsSection, ExperienceSection, SectionCard, SectionHead, ActionBtn } from '@/src/features/settings/SettingsSections';
import { st } from '@/src/features/settings/settings.styles';

const withTimeout = <T,>(promise: Promise<T>, ms: number, fallback: T): Promise<T> => {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(fallback), ms);
    promise.then((res) => { clearTimeout(timer); resolve(res); }).catch(() => { clearTimeout(timer); resolve(fallback); });
  });
};

const AnimatedView = Animated.createAnimatedComponent(View);
const AnimatedSparkles = Animated.createAnimatedComponent(Sparkles);

/** Supabase's own floor for repeat OTP sends. Asking sooner only earns an error. */
const OTP_RESEND_SECONDS = 60;

/** Where the letterhead has left the screen and the bar should carry the name. */
const TITLE_FADE_FROM = 130;
const TITLE_FADE_TO = 210;

export function SettingsScreen() {
  const { user, logout } = useAuthStore();
  const { mutateAsync: updateUserMutation, isPending: isUpdatingUser } = useUpdateUser();
  const insets = useSafeAreaInsets();
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
  const [otpAction, setOtpAction] = useState<'signOut' | 'deleteAccount' | 'toggleBiometric' | null>(null);
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
      // The box stays open with a reason and a way to try again. It used to
      // leave a live modal, an empty field, and a toast that had already gone.
      if (isMountedRef.current) {
        setOtpError(e instanceof Error ? e.message : 'The code could not be sent. Check your connection and try again.');
      }
      return false;
    } finally {
      if (isMountedRef.current) setOtpSending(false);
    }
  }, [user?.email]);

  const requestOtpAuth = useCallback(async (action: 'signOut' | 'deleteAccount' | 'toggleBiometric') => {
    setOtpAction(action);
    setOtpCode('');
    setOtpError(null);
    setResendIn(0);
    setOtpModalVisible(true);
    await sendOtp();
  }, [sendOtp]);

  /**
   * ── ONE ERASURE, WHICHEVER DOOR YOU CAME THROUGH ─────────────────────────
   *
   * Deletion had two routes and they erased different amounts: the email-code
   * route called storage.clearAll(), the biometric route did not — so drafts,
   * the import receipt and local flags survived the destruction of the account.
   * Both routes call this now, so they cannot drift apart again.
   */
  const completeAccountDeletion = useCallback(async (): Promise<void> => {
    try {
      await AuthService.requestAccountDeletion();
    } catch {
      reelToast.error('Account deletion failed. Please contact support.');
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
    if (otpAction === 'signOut') {
      // Sign-out is instant: logout() clears auth state synchronously up front;
      // network cleanup continues in the background. Navigate immediately.
      logout().catch(() => {});
      TactileEngine.destroy();
      nav.replace('/login');
    } else if (otpAction === 'deleteAccount') {
      await completeAccountDeletion();
    } else if (otpAction === 'toggleBiometric') {
      const data = pendingSaveDataRef.current;
      if (!data) return;

      const nextVal = nextBiometricStateRef.current;
      const batchedPrefs = {
        notif_follows: data.notifFollows,
        notif_endorsements: data.notifEndorsements,
        notif_comments: data.notifComments,
        notif_system: data.notifSystem,
        social_visibility: data.socialVisibility,
        privacy_endorsements: data.privacyEndorsements,
        privacy_annotations: data.privacyAnnotations,
        biometric_lock: nextVal,
      };

      const freshPrefs = useAuthStore.getState().user?.preferences || {};
      const tactilePref = useSettingsStore.getState().tactileAudioEnabled;
      const mergedPrefs = { ...freshPrefs, tactile_audio_enabled: tactilePref, ...batchedPrefs };
      try {
        await updateUserMutation({
          is_social_private: data.socialVisibility === 'private',
          preferences: mergedPrefs
        });
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
    if (!user || isUpdatingUser) return;
    pendingSaveDataRef.current = data;

    let biometricCanceled = false;

    if (data.biometricLock !== (currentPrefs?.biometric_lock === true)) {
      const hasHardware = await withTimeout(LocalAuthentication.hasHardwareAsync(), 2000, false);
      const isEnrolled = await withTimeout(LocalAuthentication.isEnrolledAsync(), 2000, false);
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
          if (result.error === 'user_cancel') {
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

    const batchedPrefs = {
      notif_follows: data.notifFollows,
      notif_endorsements: data.notifEndorsements,
      notif_comments: data.notifComments,
      notif_system: data.notifSystem,
      social_visibility: data.socialVisibility,
      privacy_endorsements: data.privacyEndorsements,
      privacy_annotations: data.privacyAnnotations,
      biometric_lock: data.biometricLock,
    };

    const freshPrefs = useAuthStore.getState().user?.preferences || {};
    const tactilePref = useSettingsStore.getState().tactileAudioEnabled;
    const mergedPrefs = { ...freshPrefs, tactile_audio_enabled: tactilePref, ...batchedPrefs };

    try {
      await updateUserMutation({
        is_social_private: data.socialVisibility === 'private',
        preferences: mergedPrefs,
      });
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

  /**
   * ── EVERY EXIT, NOT JUST THE ARROW ───────────────────────────────────────
   *
   * The discard warning hung off the back button's onPress, so the iOS swipe
   * gesture and Android's hardware back walked straight past it and threw the
   * member's unsaved changes away in silence. usePreventRemove intercepts all
   * three, including the arrow, so there is one guard and one behaviour.
   */
  usePreventRemove(isDirty && !saving, ({ data }) => {
    Alert.alert('Discard changes?', 'You have unsaved modifications in your dossier.', [
      { text: 'Keep editing', style: 'cancel' },
      { text: 'Discard', style: 'destructive', onPress: () => navigation.dispatch(data.action) },
    ]);
  });

  const handleSignOut = async () => {
    Alert.alert('Depart the Society', 'Your membership will remain. You may return at any time.', [
      { text: 'CANCEL', style: 'cancel' },
      { text: 'SIGN OUT', style: 'destructive', onPress: async () => {
        const biometricEnabled = user?.preferences?.biometric_lock === true;
        if (biometricEnabled) {
          const hasHardware = await withTimeout(LocalAuthentication.hasHardwareAsync(), 2000, false);
          const isEnrolled = await withTimeout(LocalAuthentication.isEnrolledAsync(), 2000, false);

          if (hasHardware && isEnrolled) {
            try {
              const result = await LocalAuthentication.authenticateAsync({
                promptMessage: 'Confirm your identity to sign out',
                fallbackLabel: 'Use Passcode',
                disableDeviceFallback: false,
              });
              if (!result.success) {
                if (result.error === 'user_cancel') return;
                requestOtpAuth('signOut');
                return;
              }
            } catch {
              requestOtpAuth('signOut');
              return;
            }
          } else {
            requestOtpAuth('signOut');
            return;
          }
        }
        // Instant sign-out: state clears synchronously inside logout(); the
        // network cleanup finishes in the background.
        logout().catch(() => {});
        TactileEngine.destroy();
        nav.replace('/login');
      }},
    ]);
  };

  const handleDeleteAccount = async () => {
    Alert.alert(
      'Expunge All Records',
      'This will permanently destroy your dossier, all logs, stacks, and critiques. This action is irreversible.',
      [
        { text: 'CANCEL', style: 'cancel' },
        { text: 'DELETE', style: 'destructive', onPress: async () => {
          const biometricEnabled = user?.preferences?.biometric_lock === true;
          if (biometricEnabled) {
            const hasHardware = await withTimeout(LocalAuthentication.hasHardwareAsync(), 2000, false);
            const isEnrolled = await withTimeout(LocalAuthentication.isEnrolledAsync(), 2000, false);

            if (hasHardware && isEnrolled) {
              try {
                const result = await LocalAuthentication.authenticateAsync({
                  promptMessage: 'Confirm your identity to delete account',
                  fallbackLabel: 'Use Passcode',
                  disableDeviceFallback: false,
                });
                if (!result.success) {
                  if (result.error === 'user_cancel') return;
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

  if (!user) return null;

  const appVersion = Constants.expoConfig?.version ?? '';

  return (
    <View style={st.container}>
      <Animated.View style={[st.ambientGlow, glowStyle]} pointerEvents="none">
        <LinearGradient colors={['rgba(184,137,26,0.15)', 'transparent', 'transparent']} locations={[0, 0.4, 1]} style={StyleSheet.absoluteFillObject} />
      </Animated.View>
      <View style={[st.navBar, { paddingTop: insets.top + 12 }]}>
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
        <Animated.Text
          style={[st.navTitle, navTitleStyle]}
          numberOfLines={1}
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          {...displayTextProps}
        >
          Settings
        </Animated.Text>

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

      {/*
        KEYBOARD LAW (router-screen form): automaticallyAdjustKeyboardInsets
        scrolls the FOCUSED field above the keyboard on iOS — the mechanism the
        login, reset-password and composer screens already use. This page wrapped
        everything in a KeyboardAvoidingView instead, which is the "blind
        container padding" that only makes room WITHOUT scrolling to it: opening
        CHANGE PASSWORD near the foot of eight cards left the member typing a new
        cipher behind the keyboard. Android's window resize handles it natively.
      */}
      <Animated.ScrollView
        contentContainerStyle={{ paddingBottom: insets.bottom + 40 }}
        showsVerticalScrollIndicator={false}
        onScroll={onScroll}
        scrollEventThrottle={16}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
        automaticallyAdjustKeyboardInsets
      >
        <AnimatedView entering={enterDown(0, 600)} style={st.hero}>
          <View style={st.heroRuleTop} />
          <View style={st.heroEyebrowRow}>
            <Sparkles size={7} color={colors.sepia} strokeWidth={2} />
            <Text style={st.heroEyebrow} {...scaledTextProps}>EST. 1924</Text>
            <Sparkles size={7} color={colors.sepia} strokeWidth={2} />
          </View>
          <Text style={st.heroTitle} accessibilityRole="header" {...displayTextProps}>Settings</Text>
          <Text style={st.heroDesc} {...scaledTextProps}>Configure your presence within The Society.</Text>
          <View style={st.heroRuleBottom} />
        </AnimatedView>

        {/* ── Your standing ── */}
        <PatronageSection userRole={userRole} onUpgrade={() => nav.push('/membership')} />

        {/* ── Chapter: your dossier ── */}
        <View style={st.ornRule}><View style={st.ornLine} /><View style={st.ornDiamond} /><View style={st.ornLine} /></View>

        <AccountSection user={user} control={control} saving={saving} />
        <PrivacySection control={control} saving={saving} />
        <NotificationsSection control={control} saving={saving} />

        {/* ── Chapter: this device, and your data ── */}
        <View style={st.ornRule}><View style={st.ornLine} /><View style={st.ornDiamond} /><View style={st.ornLine} /></View>

        <ExperienceSection />

        <AnimatedView entering={enterDown(300)}>
          <SectionCard>
            <SectionHead icon={ArrowDownUp} label="IMPORT & EXPORT" />
            <DataVault />
          </SectionCard>
        </AnimatedView>

        {/* ── Chapter: the house ── */}
        <View style={st.ornRule}><View style={st.ornLine} /><View style={st.ornDiamond} /><View style={st.ornLine} /></View>

        <AnimatedView entering={enterDown(350)}>
          <SectionCard>
            <SectionHead icon={Scroll} label="LEGAL" />
            <View style={st.legalActions}>
              <ActionBtn icon={Shield} label="PRIVACY POLICY" onPress={() => safeOpenURL('https://www.thereelhousesociety.com/privacy')} />
              <ActionBtn icon={FileText} label="TERMS OF SERVICE" onPress={() => safeOpenURL('https://www.thereelhousesociety.com/terms')} />
            </View>
          </SectionCard>
        </AnimatedView>

        {isAdmin && (
          <AnimatedView entering={enterDown(375)}>
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
          </AnimatedView>
        )}

        {/* ── Chapter: the way out ── */}
        <View style={st.ornRule}><View style={st.ornLine} /><View style={st.ornDiamond} /><View style={st.ornLine} /></View>

        <AnimatedView entering={enterDown(400)}>
          <SectionCard danger>
            {/* A shield — the mark of protection — used to head the card that
                destroys an account, and served as PRIVACY POLICY's icon too. */}
            <SectionHead icon={DoorOpen} label="ACCOUNT ACTIONS" danger />
            <View style={st.legalActions}>
              <ActionBtn icon={LogOut} label="SIGN OUT" onPress={handleSignOut} />
              <View style={st.divider} />
              <ActionBtn icon={Trash2} label="DELETE ACCOUNT" onPress={handleDeleteAccount} danger />
            </View>
          </SectionCard>
        </AnimatedView>

        {/* The two legal links used to be repeated here, directly beneath the
            section that already carries them. */}
        <AnimatedView entering={enterDown(450)} style={st.heritageFooter}>
          <Text style={st.memberSince} {...scaledTextProps}>MEMBER SINCE {user.created_at ? formatDateMonthYear(user.created_at) : 'THE BEGINNING'}</Text>
          <View style={st.endMarkRow}>
            <View style={st.endMarkLine} /><Sparkles size={8} color={colors.sepia} strokeWidth={1.5} /><View style={st.endMarkLine} />
          </View>
          <Text style={st.heritageCopyright} {...scaledTextProps}>© 1924–{new Date().getFullYear()} The ReelHouse Society. All dossiers are classified.</Text>
          {!!appVersion && <Text style={st.edition} {...scaledTextProps}>EDITION {appVersion}</Text>}
        </AnimatedView>
      </Animated.ScrollView>

      <Modal statusBarTranslucent visible={otpModalVisible} animationType="fade" transparent onRequestClose={() => { if (!otpVerifying) setOtpModalVisible(false); }}>
        <BlurView intensity={80} tint="dark" style={StyleSheet.absoluteFill} />
        {/* 'padding' on BOTH platforms, and correctly so: RN Modal windows never
            resize for the keyboard, so automaticallyAdjustKeyboardInsets cannot
            reach inside one. This is the opposite case to the screen above. */}
        <KeyboardAvoidingView behavior="padding" style={st.modalOverlay}>
          <View style={st.modalContent}>
            <View style={st.modalHeader}>
              <KeyRound color={colors.bloodReel} size={16} />
              <Text style={st.modalTitle} {...scaledTextProps}>SECURITY VERIFICATION</Text>
            </View>
            <Text style={st.modalDesc} {...scaledTextProps}>
              {otpAction === 'signOut' && 'Enter the 6-digit cipher sent to your email to authorize sign out.'}
              {otpAction === 'deleteAccount' && 'Enter the 6-digit cipher sent to your email to authorize account deletion.'}
              {otpAction === 'toggleBiometric' && 'Enter the 6-digit cipher sent to your email to authorize this security change.'}
            </Text>
            {!!otpError && <Text style={st.modalFail} {...scaledTextProps}>{otpError}</Text>}
            <TextInput
              style={st.otpInput}
              value={otpCode}
              onChangeText={(t) => { setOtpCode(t); if (otpError) setOtpError(null); }}
              keyboardType="number-pad"
              maxLength={6}
              placeholder="000000"
              placeholderTextColor={colors.ash}
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
              accessibilityLabel={resendIn > 0 ? `Send a new code. Available in ${resendIn} seconds.` : 'Send a new code'}
            >
              <Text style={[st.modalResendText, (otpSending || resendIn > 0) && st.modalResendTextDim]} {...scaledTextProps}>
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
        </KeyboardAvoidingView>
      </Modal>

    </View>
  );
}
