import { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, InteractionManager } from 'react-native';
import Animated, { FadeIn, FadeInDown, ReduceMotion } from 'react-native-reanimated';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { supabase } from '@/src/lib/supabase';
import { useAuthStore } from '@/src/stores/auth';
import { hydrateFollowing } from '@/src/stores/domain/socialSlice';
import { storage } from '@/src/stores/mmkv-storage';
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
  
  // Extract type from params to use in rescue UI
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const flowType = params.type || (params.url ? Linking.parse(params.url).queryParams?.type as string : undefined);

  useEffect(() => {
    handleCallback();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleSuccessfulVerification(session: Session, type: string) {
    if (type === 'recovery') {
      setStatus('success');
      setTimeout(() => InteractionManager.runAfterInteractions(() => { try { router.dismissAll(); } catch {} (router.replace as any)('/reset-password'); }), 1500);
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
      storage.set(`ironvault_user_cache_${sessionOnlyUser.id}`, JSON.stringify(sessionOnlyUser));
      storage.set('last_user_id', sessionOnlyUser.id);
    } catch { /* non-critical */ }

    hydrateFollowing();
    setStatus('success');
    setTimeout(() => InteractionManager.runAfterInteractions(() => { try { router.dismissAll(); } catch {} (router.replace as any)('/(tabs)'); }), 2000);

    AuthService.getSessionProfile(session.user.id).then((profile) => {
      if (!profile) return;
      useAuthStore.setState((s) => {
        const updatedUser = s.user ? { ...s.user, ...profile } : null;
        if (updatedUser) {
          try {
            storage.set(`ironvault_user_cache_${updatedUser.id}`, JSON.stringify(updatedUser));
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
            const inferredType = (url ? Linking.parse(url).queryParams?.type as string : params.type) || 'signup';
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
            <Text style={s.eyebrow}>VERIFYING CLEARANCE</Text>
            <Text style={s.title} adjustsFontSizeToFit numberOfLines={2} minimumFontScale={0.7}>Decrypting your{'\n'}dossier...</Text>
          </AnimatedView>
        )}

        {/* ── Success ── */}
        {status === 'success' && (
          <AnimatedView entering={FadeInDown.duration(600).reduceMotion(ReduceMotion.Never)} style={s.stateWrap}>
            <View style={s.successIconWrap}>
              <Text style={s.successIcon}>✓</Text>
            </View>
            <Text style={[s.eyebrow, { color: colors.sepia }]}>CLEARANCE GRANTED</Text>
            <Text style={s.title} adjustsFontSizeToFit numberOfLines={2} minimumFontScale={0.7}>
              {params.type === 'recovery' ? 'Session Restored.' : 'Welcome to\nThe Society.'}
            </Text>
            <Text style={s.body}>
              {params.type === 'recovery'
                ? 'Redirecting you to set your new password...'
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
            <Text style={s.title} adjustsFontSizeToFit numberOfLines={2} minimumFontScale={0.7}>Link Expired{'\n'}or Invalid</Text>
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
