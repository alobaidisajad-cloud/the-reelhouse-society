import { useEffect, useRef, useState } from 'react';
import { View, StyleSheet, ActivityIndicator, InteractionManager } from 'react-native';
import { Text } from '@/src/components/text';
import Animated, { FadeIn, FadeInDown, ReduceMotion } from 'react-native-reanimated';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { nav } from '@/src/utils/typedRouter';
import { supabase } from '@/src/lib/supabase';
import { useAuthStore } from '@/src/stores/auth';
import { storage } from '@/src/stores/mmkv-storage';
import { mapAuthError } from '@/src/hooks/useAuthFlow';
import { UNSPOKEN } from '@/src/components/dispatch/paper/paperMetrics';
import { colors, fonts, effects } from '@/src/theme/theme';
import PressableScale from '@/src/components/PressableScale';
import type { EmailOtpType, Session } from '@supabase/supabase-js';
import * as Linking from 'expo-linking';
import { RoomLight } from '@/src/components/atmosphere/RoomLight';

const AnimatedView = Animated.createAnimatedComponent(View);

// Where an email's link lands (authLink): a sign-up confirmed, or a password reset begun.
export default function AuthCallbackScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    token_hash?: string; type?: string; url?: string; code?: string;
    error?: string; error_code?: string; error_description?: string;
  }>();
  const [status, setStatus] = useState<'verifying' | 'success' | 'error'>('verifying');
  const [errorMsg, setErrorMsg] = useState('');
  // Which email this was, as verification found it, not only as the link said.
  const [resolvedType, setResolvedType] = useState<string | undefined>(undefined);
  // The walk onward after a confirmation, held so that leaving first cancels
  // it: it fired regardless, and pulled a member who had already gone back
  // to the page they left (and, in the tests, into the next test file).
  const onward = useRef<ReturnType<typeof setTimeout> | null>(null);
  const goOnward = (to: string, afterMs: number) => {
    onward.current = setTimeout(() => InteractionManager.runAfterInteractions(() => {
      try { router.dismissAll(); } catch {}
      nav.replace(to);
    }), afterMs);
  };

  useEffect(() => {
    handleCallback();
    return () => { if (onward.current) clearTimeout(onward.current); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleSuccessfulVerification(session: Session, type: string) {
    setResolvedType(type);
    if (type === 'recovery') {
      // SECURITY: the recovery link just minted a full session. Flag the reset
      // as pending so nothing hydrates the app as signed-in until a new
      // password is set (reset-password clears the flag; restoreSession
      // destroys the session if the flow is abandoned).
      try { storage.set('recovery_pending', 'true'); } catch {}
      setStatus('success');
      goOnward('/reset-password', 800);
      return;
    }

    // Signed in as every other door signs in (the profile arrives behind): a
    // slow profiles row never holds up a session that is already valid.
    useAuthStore.getState().adoptSession(session.user);
    setStatus('success');
    goOnward('/(tabs)', 1200);
  }

  async function handleCallback() {
    try {
      const url = params.url;
      const tokenHash = params.token_hash;
      const type = params.type;

      // Supabase sends a refused link back with its reason ("expired", "used").
      const refused = params.error_description || params.error_code || params.error;
      if (refused) throw new Error(refused);

      // Attempt 1: Modern PKCE code exchange
      if (url || params.code) {
        const code = params.code || (url ? (Linking.parse(url).queryParams?.code as string) : undefined);
        if (code) {
          const { data, error } = await supabase.auth.exchangeCodeForSession(code);
          if (error) throw error;
          if (data?.session) {
            // Prefer the redirectType auth-js stored alongside the PKCE code
            // verifier — it is authoritative for which email flow this was.
            const urlType = url ? (Linking.parse(url).queryParams?.type as string) : undefined;
            const libType = (data as { redirectType?: string | null }).redirectType === 'recovery' ? 'recovery' : undefined;
            const inferredType = libType || params.type || urlType || 'signup';
            await handleSuccessfulVerification(data.session, inferredType);
            return;
          }
        }
      }

      // Attempt 2: Legacy OTP token_hash verification
      if (tokenHash && type) {
        const { data, error } = await supabase.auth.verifyOtp({
          token_hash: tokenHash,
          type: type as EmailOtpType,
        });
        if (error) throw error;
        if (data?.session) {
          await handleSuccessfulVerification(data.session, type);
          return;
        }
      }

      // Anyone can open this link: a session already here verifies nothing.
      throw new Error('No valid authentication token found. The link may have expired.');
    } catch (err: unknown) {
      // A failed link must not leave the recovery flag armed — it would sign
      // the user out of a legitimate session on next launch.
      try { storage.delete('recovery_pending'); } catch {}
      const msg = err instanceof Error ? mapAuthError(err.message).message : 'Verification failed. The link may have expired.';
      setErrorMsg(msg);
      setStatus('error');
    }
  }

  return (
    <View style={s.container}>
      <RoomLight room="default" />
      <View style={s.content}>
        {/* ── Verifying ── */}
        {status === 'verifying' && (
          <AnimatedView entering={FadeIn.duration(500).reduceMotion(ReduceMotion.Never)} style={s.stateWrap}>
            <ActivityIndicator size="large" color={colors.sepia} style={{ marginBottom: 24 }} />
            <Text style={s.eyebrow}>ONE MOMENT</Text>
            <Text style={s.title}>Verifying your link</Text>
            <Text style={s.body}>This should only take a few seconds.</Text>
          </AnimatedView>
        )}

        {/* ── Success ── */}
        {status === 'success' && (
          <AnimatedView entering={FadeInDown.duration(600).reduceMotion(ReduceMotion.Never)} style={s.stateWrap}>
            <View style={s.successIconWrap}>
              <Text style={s.successIcon} {...UNSPOKEN}>✓</Text>
            </View>
            <Text style={[s.eyebrow, { color: colors.sepia }]}>
              {resolvedType === 'recovery' ? 'LINK VERIFIED' : 'CLEARANCE GRANTED'}
            </Text>
            <Text style={s.title}>
              {resolvedType === 'recovery' ? 'Link verified.' : 'Welcome to\nThe Society.'}
            </Text>
            <Text style={s.body}>
              {resolvedType === 'recovery'
                ? 'Taking you to set a new password...'
                : 'Your identity has been verified. Initiating access...'}
            </Text>
          </AnimatedView>
        )}

        {/* ── Error ── */}
        {status === 'error' && (
          <AnimatedView entering={FadeInDown.duration(600).reduceMotion(ReduceMotion.Never)} style={s.stateWrap}>
            <View style={s.errorIconWrap}>
              <Text style={s.errorIcon} {...UNSPOKEN}>✕</Text>
            </View>
            <Text style={[s.eyebrow, { color: colors.crimsonInk }]}>VERIFICATION FAILED</Text>
            <Text style={s.title}>Link Expired{'\n'}or Invalid</Text>
            <Text style={s.body}>{errorMsg}</Text>
            
            {/* Dynamic Rescue Options based on type */}
            <View style={{ marginTop: 28, width: '100%', gap: 12 }}>
              {params.type === 'recovery' ? (
                <PressableScale
                  style={s.retryBtn}
                  onPress={() => nav.replace('/login', { action: 'forgot_password' })}
                  pressedScale={0.97}
                  haptic="medium"
                >
                  <Text style={s.retryText}>REQUEST NEW RESET LINK</Text>
                </PressableScale>
              ) : params.type === 'signup' ? (
                <PressableScale
                  style={s.retryBtn}
                  onPress={() => nav.replace('/login', { action: 'resend_signup' })}
                  pressedScale={0.97}
                  haptic="medium"
                >
                  <Text style={s.retryText}>REQUEST NEW VERIFICATION</Text>
                </PressableScale>
              ) : (
                // What this opens is the sign-in form, and it says so.
                <PressableScale
                  style={s.retryBtn}
                  onPress={() => nav.replace('/login')}
                  pressedScale={0.97}
                  haptic="medium"
                  accessibilityRole="button"
                  accessibilityLabel="Go to sign in"
                >
                  <Text style={s.retryText}>SIGN IN</Text>
                </PressableScale>
              )}

              <PressableScale
                style={s.retryBtnSecondary}
                onPress={() => nav.replace('/(tabs)')}
                pressedScale={0.97}
                haptic="light"
              >
                <Text style={s.retryTextSecondary}>RETURN TO THE LOBBY</Text>
              </PressableScale>

              {/* Beside a SIGN IN above, this would be the same door twice. */}
              {(params.type === 'recovery' || params.type === 'signup') && (
                <PressableScale
                  style={s.retryBtnTertiary}
                  onPress={() => nav.replace('/login')}
                  pressedScale={0.97}
                  haptic="light"
                >
                  <Text style={s.retryTextTertiary}>RETURN TO LOGIN</Text>
                </PressableScale>
              )}
            </View>
          </AnimatedView>
        )}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.ink },
  content: {
    flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32,
  },
  stateWrap: { alignItems: 'center', maxWidth: 340 },

  eyebrow: {
    fontFamily: fonts.sub, fontSize: 10, letterSpacing: 3.2,
    color: colors.sepia, marginBottom: 12,
  },
  title: {
    fontFamily: fonts.display, fontSize: 28, color: colors.parchment,
    textAlign: 'center', lineHeight: 34, marginBottom: 16,
    ...effects.textShadowDeep,
  },
  body: {
    fontFamily: fonts.body, fontSize: 13, color: colors.bone,
    textAlign: 'center', lineHeight: 22,
  },

  // Success
  successIconWrap: {
    width: 64, height: 64, borderRadius: 32,
    backgroundColor: 'rgba(196, 150, 26, 0.1)', borderWidth: 1.5, borderColor: colors.sepia,
    alignItems: 'center', justifyContent: 'center', marginBottom: 20,
    ...effects.glowSepia,
  },
  successIcon: { fontSize: 28, color: colors.sepia, fontFamily: fonts.sub },

  // Error
  errorIconWrap: {
    width: 64, height: 64, borderRadius: 32,
    backgroundColor: 'rgba(107, 26, 10, 0.15)', borderWidth: 1.5, borderColor: colors.bloodReel,
    alignItems: 'center', justifyContent: 'center', marginBottom: 20,
  },
  errorIcon: { fontSize: 28, color: colors.crimson, fontFamily: fonts.sub },

  retryBtn: {
    backgroundColor: colors.sepia, borderRadius: 3, paddingVertical: 14,
    paddingHorizontal: 32, marginTop: 28, alignItems: 'center',
    ...effects.glowSepia,
  },
  retryText: {
    fontFamily: fonts.sub, fontSize: 10, letterSpacing: 2.5,
    color: colors.ink, fontWeight: '700', textAlign: 'center',
  },
  retryBtnSecondary: {
    backgroundColor: 'transparent', borderWidth: 1, borderColor: colors.ash, marginTop: 0,
    borderRadius: 3, paddingVertical: 14, paddingHorizontal: 32, alignItems: 'center',
  },
  retryTextSecondary: {
    fontFamily: fonts.sub, fontSize: 10, letterSpacing: 2.5,
    color: colors.fog, fontWeight: '700', textAlign: 'center',
  },
  retryBtnTertiary: {
    backgroundColor: 'transparent', borderWidth: 1, borderColor: colors.fog + '33', marginTop: 0,
    borderRadius: 3, paddingVertical: 14, paddingHorizontal: 32, alignItems: 'center',
  },
  retryTextTertiary: {
    fontFamily: fonts.sub, fontSize: 10, letterSpacing: 2.5,
    color: colors.fog + '99', fontWeight: '700', textAlign: 'center',
  },
});

// Expo Router per-route crash net — see src/components/RouteErrorBoundary.tsx
export { RouteErrorBoundary as ErrorBoundary } from '@/src/components/RouteErrorBoundary';
