import { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, InteractionManager } from 'react-native';
import Animated, { FadeIn, FadeInDown, ReduceMotion } from 'react-native-reanimated';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { supabase } from '@/src/lib/supabase';
import { useAuthStore } from '@/src/stores/auth';
import { hydrateFollowing } from '@/src/stores/domain/socialSlice';
import { storage, setSensitive } from '@/src/stores/mmkv-storage';
import { colors, fonts, effects } from '@/src/theme/theme';
import PressableScale from '@/src/components/PressableScale';
import type { EmailOtpType, Session } from '@supabase/supabase-js';
import { AuthService } from '@/src/services/AuthService';
import * as Linking from 'expo-linking';

const AnimatedView = Animated.createAnimatedComponent(View);

// ── AUTH CALLBACK SCREEN ──
// Handles deep links from Supabase email verification & password recovery.
// URL: reelhouse://auth-callback?token_hash=xxx&type=signup|recovery  (scheme from Linking.createURL('auth-callback'))
export default function AuthCallbackScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ token_hash?: string; type?: string; url?: string; code?: string }>();
  const [status, setStatus] = useState<'verifying' | 'success' | 'error'>('verifying');
  const [errorMsg, setErrorMsg] = useState('');
  // The flow type actually confirmed by verification (params.type may be absent
  // when the type only arrives inside the deep-link url's query string).
  const [resolvedType, setResolvedType] = useState<string | undefined>(undefined);
  
  // Extract type from params to use in rescue UI
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const flowType = params.type || (params.url ? Linking.parse(params.url).queryParams?.type as string : undefined);

  useEffect(() => {
    handleCallback();
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
      setTimeout(() => InteractionManager.runAfterInteractions(() => { try { router.dismissAll(); } catch {} (router.replace as any)('/reset-password'); }), 800);
      return;
    }

    // The auth session itself is already valid at this point (verifyOtp/
    // exchangeCodeForSession succeeded). Don't let a slow `profiles` row
    // (e.g. a delayed DB trigger) discard it — sign the user in immediately
    // with session-only data, matching the pattern in stores/auth.ts's
    // login(), and enrich with the profile in the background.
    const sessionOnlyUser = { ...session.user, following: [] } as unknown as import('@/src/types').User;
    useAuthStore.setState({ user: sessionOnlyUser, isAuthenticated: true });
    try {
      setSensitive(`ironvault_user_cache_${sessionOnlyUser.id}`, JSON.stringify(sessionOnlyUser));
      storage.set('last_user_id', sessionOnlyUser.id);
    } catch { /* non-critical */ }

    hydrateFollowing();
    setStatus('success');
    setTimeout(() => InteractionManager.runAfterInteractions(() => { try { router.dismissAll(); } catch {} (router.replace as any)('/(tabs)'); }), 1200);

    AuthService.getSessionProfile(session.user.id).then((profile) => {
      if (!profile) return;
      useAuthStore.setState((s) => {
        const updatedUser = s.user ? { ...s.user, ...profile } : null;
        if (updatedUser) {
          try {
            setSensitive(`ironvault_user_cache_${updatedUser.id}`, JSON.stringify(updatedUser));
          } catch { /* non-critical */ }
        }
        return { user: updatedUser };
      });
    }).catch(() => { /* profile enrichment is best-effort here; restoreSession will retry on next launch */ });
  }

  async function handleCallback() {
    try {
      const url = params.url;
      const tokenHash = params.token_hash;
      const type = params.type;
      
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

      // Attempt 3: Implicit flow or Pre-existing session
      const { data: sessionData } = await supabase.auth.getSession();
      if (sessionData?.session) {
        await handleSuccessfulVerification(sessionData.session, type || 'recovery');
        return;
      }

      throw new Error('No valid authentication token found. The link may have expired.');
    } catch (err: unknown) {
      // A failed link must not leave the recovery flag armed — it would sign
      // the user out of a legitimate session on next launch.
      try { storage.delete('recovery_pending'); } catch {}
      const msg = err instanceof Error ? err.message : 'Verification failed. The link may have expired.';
      setErrorMsg(msg);
      setStatus('error');
    }
  }

  return (
    <View style={s.container}>
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
              <Text style={s.successIcon}>✓</Text>
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
              <Text style={s.errorIcon}>✕</Text>
            </View>
            <Text style={[s.eyebrow, { color: colors.bloodReel }]}>VERIFICATION FAILED</Text>
            <Text style={s.title}>Link Expired{'\n'}or Invalid</Text>
            <Text style={s.body}>{errorMsg}</Text>
            
            {/* Dynamic Rescue Options based on type */}
            <View style={{ marginTop: 28, width: '100%', gap: 12 }}>
              {params.type === 'recovery' ? (
                <PressableScale
                  style={s.retryBtn}
                  onPress={() => (router.replace as any)({ pathname: '/login', params: { action: 'forgot_password' } })}
                  pressedScale={0.97}
                  haptic="medium"
                >
                  <Text style={s.retryText}>REQUEST NEW RESET LINK</Text>
                </PressableScale>
              ) : params.type === 'signup' ? (
                <PressableScale
                  style={s.retryBtn}
                  onPress={() => (router.replace as any)({ pathname: '/login', params: { action: 'resend_signup' } })}
                  pressedScale={0.97}
                  haptic="medium"
                >
                  <Text style={s.retryText}>REQUEST NEW VERIFICATION</Text>
                </PressableScale>
              ) : params.type === 'email_change' ? (
                <PressableScale
                  style={s.retryBtn}
                  onPress={() => (router.replace as any)({ pathname: '/login', params: { action: 'resend_verification' } })}
                  pressedScale={0.97}
                  haptic="medium"
                >
                  <Text style={s.retryText}>RESEND VERIFICATION EMAIL</Text>
                </PressableScale>
              ) : (
                <PressableScale
                  style={s.retryBtn}
                  onPress={() => (router.replace as any)('/login')}
                  pressedScale={0.97}
                  haptic="medium"
                >
                  <Text style={s.retryText}>TRY AGAIN</Text>
                </PressableScale>
              )}

              <PressableScale
                style={s.retryBtnSecondary}
                onPress={() => (router.replace as any)('/(tabs)')}
                pressedScale={0.97}
                haptic="light"
              >
                <Text style={s.retryTextSecondary}>RETURN TO THE LOBBY</Text>
              </PressableScale>

              <PressableScale
                style={s.retryBtnTertiary}
                onPress={() => (router.replace as any)('/login')}
                pressedScale={0.97}
                haptic="light"
              >
                <Text style={s.retryTextTertiary}>RETURN TO LOGIN</Text>
              </PressableScale>
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
    fontFamily: fonts.sub, fontSize: 9, letterSpacing: 4,
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
