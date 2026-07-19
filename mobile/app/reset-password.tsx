// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { useState, useRef, useEffect, useCallback } from 'react';
import {
  View, Text, TextInput, StyleSheet,
  ScrollView, ActivityIndicator,
} from 'react-native';
import Animated, {
  FadeInDown, FadeIn, ReduceMotion,
} from 'react-native-reanimated';
import { supabase } from '@/src/lib/supabase';
import { useRouter } from 'expo-router';
import { colors, fonts, effects } from '@/src/theme/theme';
import reelToast from '@/src/utils/reelToast';
import { useAuthStore, storage } from '@/src/stores/auth';
import TactileEngine from '@/src/utils/TactileEngine';
import PressableScale from '@/src/components/PressableScale';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Lock } from 'lucide-react-native';

const AnimatedView = Animated.createAnimatedComponent(View);

// ── Password strength checks — identical to web ──
function getChecks(pw: string) {
  return {
    length:    pw.length >= 8,
    uppercase: /[A-Z]/.test(pw),
    lowercase: /[a-z]/.test(pw),
    number:    /[0-9]/.test(pw),
    special:   /[^A-Za-z0-9]/.test(pw),
  };
}

const CHECK_LABELS: [keyof ReturnType<typeof getChecks>, string][] = [
  ['length', '8+ characters'],
  ['uppercase', 'Uppercase letter'],
  ['lowercase', 'Lowercase letter'],
  ['number', 'Number'],
  ['special', 'Special character'],
];

function getStrength(passed: number) {
  const labels = ['', 'WEAK', 'FAIR', 'FAIR', 'STRONG', 'VERY STRONG'];
  const clrs   = ['', colors.crimson, '#c4a000', '#c4a000', colors.sepia, colors.flicker];
  return { label: labels[passed], color: clrs[passed] };
}

export default function ResetPasswordScreen() {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const insets = useSafeAreaInsets();
  // BUG FIX #4: Session guard
  const [hasSession, setHasSession] = useState<boolean | null>(null); // null = checking

  const confirmRef = useRef<TextInput>(null);
  // FIX #1: Redirect timer ref for cleanup on unmount
  const redirectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => { return () => { if (redirectTimerRef.current) clearTimeout(redirectTimerRef.current); }; }, []);

  const checks = getChecks(password);
  const passed = Object.values(checks).filter(Boolean).length;
  const strong = passed === 5;
  const { label: strengthLabel, color: strengthColor } = getStrength(passed);

  // BUG FIX #4: Check for active session on mount
  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getSession();
      // No session means the recovery link was expired/used — nothing to guard.
      if (!data?.session) storage.delete('recovery_pending');
      setHasSession(!!data?.session);
    })();
  }, []);

  const handleReset = async () => {
    if (!strong) {
      reelToast.error('Password does not meet security requirements.');
      return;
    }
    if (password !== confirm) {
      reelToast.error('Passwords do not match.');
      return;
    }

    setLoading(true);
    TactileEngine.mutate();
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      setSuccess(true);
      TactileEngine.success();

      // The new password is set — the recovery session is now legitimate.
      // Clear the pending flag BEFORE hydrating, or restoreSession would
      // treat this as an abandoned recovery and destroy the session.
      storage.delete('recovery_pending');

      // IMP #3: Re-trigger auth + fully hydrate the auth store
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        await supabase.auth.refreshSession();
        // Hydrate the Zustand auth store so the user is fully logged in
        await useAuthStore.getState().restoreSession();
      }

      // Timer now matches the "3 SECONDS" copy
      // FIX #1: Store timer ref so cleanup on unmount prevents stale navigation
      redirectTimerRef.current = setTimeout(() => {
        (router.replace as any)('/(tabs)');
      }, 3000);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to reset password.';
      reelToast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  // ── Success State ──
  if (success) {
    return (
      <View style={s.container}>
        <View style={s.successWrap}>
          <AnimatedView entering={FadeIn.duration(600).reduceMotion(ReduceMotion.Never)} style={s.successContent}>
            <View style={s.successIconWrap}>
              <Text style={s.successIcon}>✓</Text>
            </View>
            <Text style={s.successEyebrow}>CREDENTIALS SECURED</Text>
            <Text style={s.successTitle}>Password Reset{'\n'}Complete.</Text>
            <Text style={s.successBody}>
              Your new credentials have been secured.{'\n'}Redirecting you to the House...
            </Text>
            <Text style={s.successRedirect}>REDIRECTING IN 3 SECONDS...</Text>
          </AnimatedView>
        </View>
      </View>
    );
  }

  // BUG FIX #4: Session guard — checking state
  if (hasSession === null) {
    return (
      <View style={s.container}>
        <View style={s.successWrap}>
          <ActivityIndicator size="large" color={colors.sepia} />
        </View>
      </View>
    );
  }

  // BUG FIX #4: No session — show recovery options instead of dead-end form
  if (hasSession === false) {
    return (
      <View style={s.container}>
        <View style={s.successWrap}>
          <Animated.View entering={FadeIn.duration(600).reduceMotion(ReduceMotion.Never)} style={s.successContent}>
            <View style={[s.successIconWrap, { backgroundColor: 'rgba(107, 26, 10, 0.15)', borderColor: colors.bloodReel }]}>
              <Text style={[s.successIcon, { color: colors.bloodReel }]}>✕</Text>
            </View>
            <Text style={[s.successEyebrow, { color: colors.bloodReel }]}>SESSION EXPIRED</Text>
            <Text style={s.successTitle}>No Active Session</Text>
            <Text style={s.successBody}>
              Your reset link has expired or was already used.{"\n"}Please request a new one.
            </Text>
            <PressableScale
              style={[s.submitBtn, { marginTop: 20 }]}
              onPress={() => (router.replace as any)({ pathname: '/login', params: { action: 'forgot_password' } })}
              pressedScale={0.97}
              accessibilityRole="button"
              accessibilityLabel="Request new reset link"
            >
              <Text style={s.submitText}>REQUEST NEW RESET LINK</Text>
            </PressableScale>
            <PressableScale
              style={{ marginTop: 16, padding: 8 }}
              onPress={() => (router.replace as any)('/(tabs)')}
              pressedScale={0.95}
              haptic="light"
              accessibilityRole="button"
              accessibilityLabel="Return to lobby"
            >
              <Text style={[s.submitText, { color: colors.fog }]}>RETURN TO LOBBY</Text>
            </PressableScale>
          </Animated.View>
        </View>
      </View>
    );
  }

  // ── Main Form ──
  return (
    <ScrollView 
      style={s.container} 
      contentContainerStyle={[s.scroll, { paddingTop: Math.max(insets.top + 64, 96) }]}
      showsVerticalScrollIndicator={false} 
      keyboardShouldPersistTaps="handled"
      automaticallyAdjustKeyboardInsets={true}
    >
        {/* Close / Back — abandoning a pending recovery destroys the session:
            a recovery link alone must never leave the user signed in with an
            unchanged password. */}
        <PressableScale
          style={[s.backBtn, { top: Math.max(insets.top + 16, 56) }]}
          onPress={async () => {
            if (storage.getString('recovery_pending') === 'true') {
              storage.delete('recovery_pending');
              try { await supabase.auth.signOut({ scope: 'local' }); } catch {}
            }
            if (router.canGoBack()) {
              router.back();
            } else {
              (router.replace as any)('/(tabs)');
            }
          }}
          hitSlop={{ top: 12, right: 12, bottom: 12, left: 12 }}
          haptic="light"
          accessibilityRole="button"
          accessibilityLabel="Back to lobby"
        >
          <Text style={s.backText}>← BACK TO LOBBY</Text>
        </PressableScale>

        {/* Header */}
        <AnimatedView entering={FadeInDown.duration(800).reduceMotion(ReduceMotion.Never)} style={s.header}>
          <View style={s.iconWrap}>
            <Lock size={24} color={colors.sepia} strokeWidth={1.5} />
          </View>
          <Text style={s.eyebrow}>CREDENTIAL RESET</Text>
          <Text style={s.title}>Set New Password</Text>
          <View style={s.rule} />
          <Text style={s.subtitle}>
            Enter your new password below.{'\n'}Make it strong — the archives demand it.
          </Text>
        </AnimatedView>

        {/* Form Card */}
        <AnimatedView entering={FadeInDown.duration(600).delay(200).reduceMotion(ReduceMotion.Never)} style={s.formCard}>
          <View style={s.formCardGlow} />

          {/* New Password */}
          <View style={s.fieldGroup}>
            <Text style={s.inputLabel}>NEW PASSWORD</Text>
            <View style={s.inputWrap}>
              <TextInput
                style={[s.input, { paddingRight: 60 }]}
                placeholder="Enter new password"
                placeholderTextColor={colors.fog}
                value={password}
                onChangeText={setPassword}
                secureTextEntry={!showPassword}
                selectionColor={colors.sepia}
                autoCapitalize="none"
                autoCorrect={false}
                returnKeyType="next"
                onSubmitEditing={() => confirmRef.current?.focus()}
                blurOnSubmit={false}
                maxLength={128}
                keyboardAppearance="dark"
                accessibilityLabel="New password"
              />
              <PressableScale
                style={s.showBtn}
                onPress={() => setShowPassword(v => !v)}
                hitSlop={{ top: 10, right: 10, bottom: 10, left: 10 }}
                pressedScale={0.92}
                accessibilityRole="button"
                accessibilityLabel={showPassword ? "Hide password" : "Show password"}
              >
                <Text style={s.showText}>{showPassword ? 'HIDE' : 'SHOW'}</Text>
              </PressableScale>
            </View>
          </View>

          {/* Strength Meter */}
          {password.length > 0 && (
            <AnimatedView entering={FadeInDown.duration(300)} style={s.strengthWrap}>
              {/* Bar */}
              <View style={s.strengthBarRow}>
                {[1, 2, 3, 4, 5].map(i => (
                  <View
                    key={i}
                    style={[
                      s.strengthSegment,
                      { backgroundColor: i <= passed ? strengthColor : colors.ash },
                    ]}
                  />
                ))}
                <Text style={[s.strengthLabel, { color: strengthColor }]}>{strengthLabel}</Text>
              </View>

              {/* Individual checks */}
              <View style={s.checksGrid}>
                {CHECK_LABELS.map(([key, label]) => (
                  <View key={key} style={s.checkRow}>
                    <Text style={[s.checkIcon, { color: checks[key] ? colors.sepia : colors.fog }]}>
                      {checks[key] ? '✓' : '○'}
                    </Text>
                    <Text style={[s.checkLabel, { color: checks[key] ? colors.sepia : colors.fog }]}>
                      {label}
                    </Text>
                  </View>
                ))}
              </View>
            </AnimatedView>
          )}

          {/* Confirm Password */}
          <View style={s.fieldGroup}>
            <Text style={s.inputLabel}>CONFIRM PASSWORD</Text>
            <View style={s.inputWrap}>
              <TextInput
                ref={confirmRef}
                style={s.input}
                placeholder="Re-enter new password"
                placeholderTextColor={colors.fog}
                value={confirm}
                onChangeText={setConfirm}
                secureTextEntry={!showPassword}
                selectionColor={colors.sepia}
                autoCapitalize="none"
                autoCorrect={false}
                returnKeyType="go"
                onSubmitEditing={handleReset}
                maxLength={128}
                keyboardAppearance="dark"
                accessibilityLabel="Confirm new password"
              />
            </View>
            {confirm.length > 0 && password !== confirm && (
              <Text style={s.mismatchText}>PASSWORDS DO NOT MATCH</Text>
            )}
          </View>

          {/* Submit */}
          <PressableScale
            style={[s.submitBtn, (!strong || password !== confirm || loading) && s.submitDisabled]}
            onPress={handleReset}
            disabled={loading || !strong || password !== confirm}
            pressedScale={0.97}
            accessibilityRole="button"
            accessibilityLabel="Submit new password"
          >
            {loading ? (
              <View style={s.submitLoading}>
                <ActivityIndicator size="small" color={colors.ink} />
                <Text style={s.submitText}>RESETTING...</Text>
              </View>
            ) : (
              <Text style={s.submitText}>RESET PASSWORD</Text>
            )}
          </PressableScale>
        </AnimatedView>
      </ScrollView>
  );
}

// ══════════════════════════════════════════════════════════════
// STYLES — Nitrate Noir Reset Password
// ══════════════════════════════════════════════════════════════
const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.ink },
  scroll: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: 32, paddingBottom: 40 },

  // Back
  backBtn: { position: 'absolute', left: 0, zIndex: 10, padding: 8 },
  backText: { fontFamily: fonts.sub, fontSize: 9, letterSpacing: 1.5, color: colors.fog },

  // Header
  header: { alignItems: 'center', marginBottom: 28 },
  iconWrap: {
    width: 56, height: 56, borderRadius: 28,
    borderWidth: 1.5, borderColor: colors.sepiaBorder,
    backgroundColor: 'rgba(196, 150, 26, 0.06)',
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 16,
    ...effects.glowSepia,
  },

  eyebrow: { fontFamily: fonts.sub, fontSize: 9, letterSpacing: 5, color: colors.sepia, marginBottom: 10 },
  title: {
    fontFamily: fonts.display, fontSize: 28, color: colors.parchment,
    textAlign: 'center', lineHeight: 34,
    ...effects.textShadowDeep,
  },
  rule: { width: 50, height: 1, backgroundColor: colors.sepia, marginVertical: 14, opacity: 0.4 },
  subtitle: { fontFamily: fonts.body, fontSize: 12, color: colors.fog, textAlign: 'center', lineHeight: 20 },

  // Form Card
  formCard: {
    backgroundColor: 'rgba(14, 13, 10, 0.7)', borderWidth: 1, borderColor: colors.ash,
    borderRadius: 4, padding: 24, gap: 18, overflow: 'hidden',
  },
  formCardGlow: {
    position: 'absolute', top: 0, left: 20, right: 20, height: 1,
    backgroundColor: colors.sepia, opacity: 0.25,
  },

  // Fields
  fieldGroup: { gap: 6 },
  inputLabel: { fontFamily: fonts.sub, fontSize: 9, letterSpacing: 2.5, color: colors.fog, textTransform: 'uppercase' },
  inputWrap: { position: 'relative' },
  input: {
    backgroundColor: colors.soot, borderWidth: 1, borderColor: colors.ash,
    borderRadius: 3, padding: 14, paddingHorizontal: 16,
    fontSize: 14, fontFamily: fonts.body, color: colors.parchment,
  },
  showBtn: { position: 'absolute', right: 14, top: 0, bottom: 0, justifyContent: 'center' },
  showText: { fontFamily: fonts.sub, fontSize: 9, letterSpacing: 1.5, color: colors.sepia },

  // Strength
  strengthWrap: { gap: 10 },
  strengthBarRow: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  strengthSegment: { flex: 1, height: 3, borderRadius: 2 },
  strengthLabel: { fontFamily: fonts.sub, fontSize: 8, letterSpacing: 1.5, marginLeft: 8, minWidth: 80 },
  checksGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
  checkRow: { flexDirection: 'row', alignItems: 'center', gap: 4, width: '48%' as import('react-native').DimensionValue },
  checkIcon: { fontFamily: fonts.sub, fontSize: 11 },
  checkLabel: { fontFamily: fonts.sub, fontSize: 9, letterSpacing: 0.5 },

  // Mismatch
  mismatchText: { fontFamily: fonts.sub, fontSize: 9, letterSpacing: 1, color: colors.crimson, marginTop: 2 },

  // Submit
  submitBtn: {
    backgroundColor: colors.sepia, borderRadius: 3, paddingVertical: 16,
    alignItems: 'center', marginTop: 4,
    ...effects.glowSepia,
  },
  submitDisabled: { opacity: 0.4, shadowOpacity: 0 },
  submitText: { fontFamily: fonts.sub, fontSize: 11, letterSpacing: 2.5, color: colors.ink },
  submitLoading: { flexDirection: 'row', alignItems: 'center', gap: 10 },

  // Success
  successWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  successContent: { alignItems: 'center' },
  successIconWrap: {
    width: 64, height: 64, borderRadius: 32,
    backgroundColor: 'rgba(184,137,26,0.1)', borderWidth: 1, borderColor: colors.sepia,
    alignItems: 'center', justifyContent: 'center', marginBottom: 20,
  },
  successIcon: { fontSize: 28, color: colors.sepia, fontFamily: fonts.sub },
  successEyebrow: { fontFamily: fonts.sub, fontSize: 9, letterSpacing: 4, color: colors.sepia, marginBottom: 10 },
  successTitle: {
    fontFamily: fonts.display, fontSize: 26, color: colors.parchment,
    textAlign: 'center', lineHeight: 32, marginBottom: 16,
    ...effects.textShadowDeep,
  },
  successBody: { fontFamily: fonts.body, fontSize: 13, color: colors.bone, textAlign: 'center', lineHeight: 22, marginBottom: 20 },
  successRedirect: { fontFamily: fonts.sub, fontSize: 8, letterSpacing: 2, color: colors.fog },
});
