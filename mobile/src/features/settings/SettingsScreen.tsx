import { useState, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, ScrollView,
  Alert, Modal, TextInput, KeyboardAvoidingView, Platform
} from 'react-native';
import { BlurView } from 'expo-blur';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeInDown, useSharedValue, useAnimatedStyle, withTiming, Easing, withRepeat, cancelAnimation } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { nav } from '@/src/utils/typedRouter';
import TactileEngine from '@/src/utils/TactileEngine';
import { ChevronLeft, LogOut, Trash2, Shield, FileText, Download, Sparkles } from 'lucide-react-native';

import { useAuthStore } from '@/src/stores/auth';
import { useSettingsStore } from '@/src/stores/settings';
import { supabase } from '@/src/lib/supabase';
import reelToast from '@/src/utils/reelToast';
import { safeOpenURL } from '@/src/utils/linking';
import * as LocalAuthentication from 'expo-local-authentication';
import { useUpdateUser } from '@/src/hooks/useUpdateUser';
import { AuthService } from '@/src/services/AuthService';
import { useAmbientGlow } from '@/src/hooks/useAmbientGlow';
import { colors } from '@/src/theme/theme';
import DataVault from '@/src/features/settings/DataVault';
import { storage } from '@/src/stores/mmkv-storage';
import PressableScale from '@/src/components/PressableScale';
import { resolveTier } from '@/src/utils/tier';
import { formatDateMonthYear } from '@/src/utils/timeAgo';
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
const HITSLOP_10 = { top: 10, bottom: 10, left: 10, right: 10 } as const;
const HITSLOP_15 = { top: 15, bottom: 15, left: 15, right: 15 } as const;

export function SettingsScreen() {
  const { user, logout } = useAuthStore();
  const { mutateAsync: updateUserMutation, isPending: isUpdatingUser } = useUpdateUser();
  const insets = useSafeAreaInsets();
  const isMountedRef = useRef(true);

  useEffect(() => {
    return () => { isMountedRef.current = false; };
  }, []);

  // ── General ──
  const userRole = resolveTier(user);
  
  const [otpModalVisible, setOtpModalVisible] = useState(false);
  const [otpAction, setOtpAction] = useState<'signOut' | 'deleteAccount' | 'toggleBiometric' | null>(null);
  const [otpCode, setOtpCode] = useState('');
  const [_otpSending, setOtpSending] = useState(false);
  const [otpVerifying, setOtpVerifying] = useState(false);
  const nextBiometricStateRef = useRef<boolean>(false);
  const pendingSaveDataRef = useRef<SettingsFormData | null>(null);

  const requestOtpAuth = async (action: 'signOut' | 'deleteAccount' | 'toggleBiometric') => {
    if (!user?.email) { reelToast.error('Email required for verification.'); return; }
    setOtpAction(action);
    setOtpModalVisible(true);
    setOtpSending(true);
    try {
      const { error } = await supabase.auth.signInWithOtp({ email: user.email });
      if (error) throw error;
      reelToast.success(`Security code sent to ${user.email}`);
    } catch (e: unknown) {
      reelToast.error(e instanceof Error ? e.message : 'Failed to send code.');
    } finally {
      setOtpSending(false);
    }
  };

  const executePendingOtpAction = async () => {
    if (otpAction === 'signOut') {
      try { await logout(); } catch (e) {}
      TactileEngine.destroy();
      nav.replace('/login');
    } else if (otpAction === 'deleteAccount') {
      try { await AuthService.requestAccountDeletion(); } catch { reelToast.error('Deletion failed.'); return; }
      try { await logout(); } catch (e) {}
      storage.clearAll();
      TactileEngine.destroy();
      nav.replace('/login');
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
      } catch (e) {
        // Mutation error handled globally; prevent reset/success falsely.
      }
    }
  };

  const handleOtpVerify = async () => {
    if (!user?.email || !otpCode || otpCode.length < 6) return;
    setOtpVerifying(true);
    try {
      const { error } = await supabase.auth.verifyOtp({ email: user.email, token: otpCode, type: 'email' });
      if (error) throw error;
      setOtpModalVisible(false);
      setOtpCode('');
      await executePendingOtpAction();
    } catch (e: unknown) {
      reelToast.error('Invalid or expired code.');
    } finally {
      if (isMountedRef.current) setOtpVerifying(false);
    }
  };
  
  const currentPrefs = user?.preferences;

  const { control, handleSubmit, reset, setValue, formState: { isDirty, dirtyFields } } = useForm<SettingsFormData>({
    resolver: zodResolver(SettingsSchema),
    defaultValues: {
      socialVisibility: (currentPrefs?.social_visibility || (user?.is_social_private ? 'private' : 'public')) as 'public' | 'followers' | 'private',
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
      const visibility = (currentPrefs?.social_visibility || (user?.is_social_private ? 'private' : 'public')) as 'public' | 'followers' | 'private';
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
        } catch (e) {
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
    } catch (e) {}
  });

  const saving = isUpdatingUser;

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
            } catch (e) {
              requestOtpAuth('signOut');
              return;
            }
          } else {
            requestOtpAuth('signOut');
            return;
          }
        }
        try { await logout(); } catch (e) {}
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
              } catch (e) {
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
          try {
            await AuthService.requestAccountDeletion();
          } catch {
            reelToast.error('Account deletion failed. Please contact support.');
            return;
          }
          try { await logout(); } catch (e) {}
          TactileEngine.destroy();
          nav.replace('/login');
        }},
      ]
    );
  };

  const glowStyle = useAmbientGlow(0.04, 0.08, 3000);

  const spinValue = useSharedValue(0);
  useEffect(() => {
    if (saving) {
      spinValue.value = withRepeat(withTiming(1, { duration: 1500, easing: Easing.linear }), -1, false);
    } else {
      cancelAnimation(spinValue);
      spinValue.value = 0;
    }
  }, [saving, spinValue]);

  const spinStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${spinValue.value * 360}deg` }]
  }));

  if (!user) return null;

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={st.container}>
        <Animated.View style={[st.ambientGlow, glowStyle]}>
          <LinearGradient colors={['rgba(139,105,20,0.15)', 'transparent', 'transparent']} locations={[0, 0.4, 1]} style={StyleSheet.absoluteFillObject} />
        </Animated.View>
        <View style={[st.navBar, { paddingTop: insets.top + 12 }]}>
          <PressableScale onPress={handleSave} disabled={saving || !isDirty} hitSlop={HITSLOP_15} haptic="medium" pressedScale={0.95} accessibilityRole="button" accessibilityLabel="Save settings">
            {saving ? <AnimatedSparkles size={12} color={colors.sepia} style={spinStyle} /> : <Text style={[st.navSaveText, !isDirty && st.disabledBtn]}>SAVE</Text>}
          </PressableScale>
        </View>

        <ScrollView contentContainerStyle={st.scrollContent} showsVerticalScrollIndicator={false}>
          <AnimatedView entering={FadeInDown.duration(600)} style={st.hero}>
            <View style={st.header}>
              <PressableScale
                onPress={() => {
                  if (saving) return;
                  if (isDirty) {
                    Alert.alert('Discard Changes?', 'You have unsaved modifications in your dossier.', [
                      { text: 'Cancel', style: 'cancel' },
                      { text: 'Discard', style: 'destructive', onPress: () => nav.back() }
                    ]);
                  } else {
                    nav.back();
                  }
                }}
                style={st.backBtn}
                hitSlop={HITSLOP_10}
                accessibilityLabel="Go back"
                accessibilityRole="button"
                disabled={saving}
              >
                <ChevronLeft color={colors.parchment} size={28} strokeWidth={2.5} />
              </PressableScale>
              <Text style={st.title}>Dossier Settings</Text>
            </View>
            <View style={st.heroEyebrowRow}>
              <Sparkles size={7} color={colors.sepia} strokeWidth={2} />
            </View>
            <Text style={st.heroEst}>EST. 1924</Text>
            <Text style={st.heroDesc}>Configure your presence within The Society.</Text>
            <View style={st.heroRuleBottom} />
          </AnimatedView>

          <PatronageSection userRole={userRole} onUpgrade={() => nav.push('/membership')} />
          <View style={st.ornRule}><View style={st.ornLine} /><View style={st.ornDiamond} /><View style={st.ornLine} /></View>

          <AccountSection user={user} control={control} saving={saving} />
          <View style={st.ornRule}><View style={st.ornLine} /><View style={st.ornDiamond} /><View style={st.ornLine} /></View>

          <PrivacySection control={control} saving={saving} />
          <View style={st.ornRule}><View style={st.ornLine} /><View style={st.ornDiamond} /><View style={st.ornLine} /></View>

          <NotificationsSection control={control} saving={saving} />
          <View style={st.ornRule}><View style={st.ornLine} /><View style={st.ornDiamond} /><View style={st.ornLine} /></View>

          <ExperienceSection />

          <AnimatedView entering={FadeInDown.duration(500).delay(300)}>
            <SectionCard>
              <SectionHead icon={Download} label="IMPORT & EXPORT" />
              <DataVault />
            </SectionCard>
          </AnimatedView>
          <View style={st.ornRule}><View style={st.ornLine} /><View style={st.ornDiamond} /><View style={st.ornLine} /></View>

          <AnimatedView entering={FadeInDown.duration(500).delay(350)}>
            <SectionCard>
              <SectionHead icon={FileText} label="LEGAL" />
              <View style={st.legalActions}>
                <ActionBtn icon={Shield} label="PRIVACY POLICY" onPress={() => safeOpenURL('https://www.thereelhousesociety.com/privacy')} />
                <ActionBtn icon={FileText} label="TERMS OF SERVICE" onPress={() => safeOpenURL('https://www.thereelhousesociety.com/terms')} />
              </View>
            </SectionCard>
          </AnimatedView>

          <AnimatedView entering={FadeInDown.duration(500).delay(400)}>
            <SectionCard danger>
              <SectionHead icon={Shield} label="ACCOUNT ACTIONS" danger />
              <View style={st.legalActions}>
                <ActionBtn icon={LogOut} label="SIGN OUT" onPress={handleSignOut} />
                <View style={st.divider} />
                <ActionBtn icon={Trash2} label="DELETE ACCOUNT" onPress={handleDeleteAccount} danger />
              </View>
            </SectionCard>
          </AnimatedView>

          <AnimatedView entering={FadeInDown.duration(500).delay(450)} style={st.heritageFooter}>
            <View style={st.ornRule}><View style={st.ornLine} /><View style={st.ornDiamond} /><View style={st.ornLine} /></View>
            <View style={st.legalFooter}>
              <PressableScale onPress={() => safeOpenURL('https://www.thereelhousesociety.com/privacy')} haptic="selection" pressedScale={0.96} accessibilityRole="link" accessibilityLabel="Privacy Policy"><Text style={st.legalFooterLink}>PRIVACY POLICY</Text></PressableScale>
              <View style={st.footerDot} />
              <PressableScale onPress={() => safeOpenURL('https://www.thereelhousesociety.com/terms')} haptic="selection" pressedScale={0.96} accessibilityRole="link" accessibilityLabel="Terms of Service"><Text style={st.legalFooterLink}>TERMS OF SERVICE</Text></PressableScale>
            </View>
            <Text style={st.memberSince}>MEMBER SINCE {user.created_at ? formatDateMonthYear(user.created_at) : 'THE BEGINNING'}</Text>
            <View style={st.endMarkRow}>
              <View style={st.endMarkLine} /><Sparkles size={8} color={colors.sepia} strokeWidth={1.5} /><View style={st.endMarkLine} />
            </View>
            <Text style={st.heritageMark}>EST. 1924 · THE REELHOUSE SOCIETY</Text>
            <Text style={st.heritageCopyright}>© 1924–{new Date().getFullYear()} The ReelHouse Society. All dossiers are classified.</Text>
          </AnimatedView>
        </ScrollView>

        <Modal visible={otpModalVisible} animationType="fade" transparent onRequestClose={() => { if (!otpVerifying) setOtpModalVisible(false); }}>
          <BlurView intensity={80} tint="dark" style={StyleSheet.absoluteFill} />
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={st.modalOverlay}>
            <View style={st.modalContent}>
              <View style={st.modalHeader}>
                <Shield color={colors.bloodReel} size={16} />
                <Text style={st.modalTitle}>SECURITY VERIFICATION</Text>
              </View>
              <Text style={st.modalDesc}>
                {otpAction === 'signOut' && 'Enter the 6-digit cipher sent to your email to authorize sign out.'}
                {otpAction === 'deleteAccount' && 'Enter the 6-digit cipher sent to your email to authorize account deletion.'}
                {otpAction === 'toggleBiometric' && 'Enter the 6-digit cipher sent to your email to authorize this security change.'}
              </Text>
              <TextInput
                style={st.otpInput}
                value={otpCode}
                onChangeText={setOtpCode}
                keyboardType="number-pad"
                maxLength={6}
                placeholder="000000"
                placeholderTextColor={colors.ash}
                editable={!otpVerifying}
                autoFocus
              />
              <View style={st.modalActions}>
                <PressableScale style={st.modalBtnCancel} disabled={otpVerifying} onPress={() => { setOtpModalVisible(false); setOtpCode(''); }}>
                  <Text style={st.modalBtnCancelText}>CANCEL</Text>
                </PressableScale>
                <PressableScale style={[st.modalBtnConfirm, (!otpCode || otpCode.length < 6) && st.disabledBtn]} onPress={handleOtpVerify} disabled={otpVerifying || !otpCode || otpCode.length < 6}>
                  <Text style={st.modalBtnConfirmText}>{otpVerifying ? 'VERIFYING...' : 'VERIFY'}</Text>
                </PressableScale>
              </View>
            </View>
          </KeyboardAvoidingView>
        </Modal>

      </View>
    </KeyboardAvoidingView>
  );
}
