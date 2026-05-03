import { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, InteractionManager } from 'react-native';
import Animated, { FadeIn, FadeInDown, ReduceMotion } from 'react-native-reanimated';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { supabase } from '@/src/lib/supabase';
import { useAuthStore } from '@/src/stores/auth';
import { storage } from '@/src/stores/mmkv-storage';
import { colors, fonts, effects } from '@/src/theme/theme';
import PressableScale from '@/src/components/PressableScale';
import type { EmailOtpType } from '@supabase/supabase-js';

const AnimatedView = Animated.createAnimatedComponent(View);

// ── AUTH CALLBACK SCREEN ──
// Handles deep links from Supabase email verification & password recovery.
// URL: reelhouse://auth/callback?token_hash=xxx&type=signup|recovery
export default function AuthCallbackScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ token_hash?: string; type?: string }>();
  const [status, setStatus] = useState<'verifying' | 'success' | 'error'>('verifying');
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    handleCallback();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleCallback() {
    try {
      const tokenHash = params.token_hash;
      const type = params.type; // 'signup' | 'recovery' | 'email_change'

      if (!tokenHash || !type) {
        // Fallback: try to get an existing session
        const { data: sessionData } = await supabase.auth.getSession();
        if (sessionData?.session) {
          setStatus('success');
          // D3-01 FIX: Clear ghost stack entries before replacing route
          setTimeout(() => InteractionManager.runAfterInteractions(() => { try { router.dismissAll(); } catch {} router.replace('/(tabs)'); }), 2000);
        } else {
          throw new Error('No valid token found in this link. It may have expired.');
        }
        return;
      }

      // Exchange the OTP token for a real session
      const { data, error } = await supabase.auth.verifyOtp({
        token_hash: tokenHash,
        type: type as EmailOtpType,
      });
      if (error) throw error;

      if (type === 'recovery') {
        // Password recovery — redirect to reset-password screen
        // The session is now active, so supabase.auth.updateUser will work
        setStatus('success');
        // D3-01 FIX: Clear ghost stack entries before replacing route
        setTimeout(() => InteractionManager.runAfterInteractions(() => { try { router.dismissAll(); } catch {} router.replace('/reset-password'); }), 1500);
        return;
      }

      if (data?.session) {
        // Email verification — fetch profile and set auth state
        let profile = null;
        const maxAttempts = 15;
        for (let attempt = 0; attempt < maxAttempts; attempt++) {
          const { data: p } = await supabase
            .from('profiles')
            .select('id, username, role, bio, avatar_url, display_name, is_social_private, preferences, persona, created_at')
            .eq('id', data.session.user.id)
            .maybeSingle();
          if (p) { profile = p; break; }
          const delay = Math.min(500 * Math.pow(1.5, attempt), 5000);
          await new Promise(r => setTimeout(r, delay));
        }

        if (!profile) throw new Error('Profile synchronization timed out. Please return to login.');

        const completeUser = { ...data.session.user, ...profile, following: [] } as import('@/src/types').User;
        useAuthStore.setState({
          user: completeUser,
          isAuthenticated: true,
        });
        // C-04 AUDIT FIX: Static import replaces dynamic require()
        try {
          // D1-03 FIX: Write to per-user cache key (was legacy 'ironvault_user_cache')
          storage.set(`ironvault_user_cache_${completeUser.id}`, JSON.stringify(completeUser));
        } catch { /* non-critical */ }

        setStatus('success');
        // D3-01 FIX: Clear ghost stack entries before replacing route
        setTimeout(() => InteractionManager.runAfterInteractions(() => { try { router.dismissAll(); } catch {} router.replace('/(tabs)'); }), 2000);
      } else {
        throw new Error('Verification succeeded but no session was created.');
      }
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
                  onPress={() => router.replace({ pathname: '/login', params: { action: 'forgot_password' } })}
                  pressedScale={0.97}
                  haptic="medium"
                >
                  <Text style={s.retryText}>REQUEST NEW RESET LINK</Text>
                </PressableScale>
              ) : params.type === 'signup' ? (
                <PressableScale
                  style={s.retryBtn}
                  onPress={() => router.replace({ pathname: '/login', params: { action: 'resend_signup' } })}
                  pressedScale={0.97}
                  haptic="medium"
                >
                  <Text style={s.retryText}>REQUEST NEW VERIFICATION</Text>
                </PressableScale>
              ) : params.type === 'email_change' ? (
                <PressableScale
                  style={s.retryBtn}
                  onPress={() => router.replace({ pathname: '/login', params: { action: 'resend_verification' } })}
                  pressedScale={0.97}
                  haptic="medium"
                >
                  <Text style={s.retryText}>RESEND VERIFICATION EMAIL</Text>
                </PressableScale>
              ) : (
                <PressableScale
                  style={s.retryBtn}
                  onPress={() => router.replace('/login')}
                  pressedScale={0.97}
                  haptic="medium"
                >
                  <Text style={s.retryText}>TRY AGAIN</Text>
                </PressableScale>
              )}

              <PressableScale
                style={s.retryBtnSecondary}
                onPress={() => router.replace('/(tabs)')}
                pressedScale={0.97}
                haptic="light"
              >
                <Text style={s.retryTextSecondary}>RETURN TO THE LOBBY</Text>
              </PressableScale>

              <PressableScale
                style={s.retryBtnTertiary}
                onPress={() => router.replace('/login')}
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
    fontFamily: fonts.ui, fontSize: 9, letterSpacing: 4,
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
  successIcon: { fontSize: 28, color: colors.sepia, fontFamily: fonts.uiBold },

  // Error
  errorIconWrap: {
    width: 64, height: 64, borderRadius: 32,
    backgroundColor: 'rgba(107, 26, 10, 0.15)', borderWidth: 1.5, borderColor: colors.bloodReel,
    alignItems: 'center', justifyContent: 'center', marginBottom: 20,
  },
  errorIcon: { fontSize: 28, color: colors.bloodReel, fontFamily: fonts.uiBold },

  retryBtn: {
    backgroundColor: colors.sepia, borderRadius: 3, paddingVertical: 14,
    paddingHorizontal: 32, marginTop: 28, alignItems: 'center',
    ...effects.glowSepia,
  },
  retryText: {
    fontFamily: fonts.uiMedium, fontSize: 10, letterSpacing: 2.5,
    color: colors.ink, fontWeight: '700', textAlign: 'center',
  },
  retryBtnSecondary: {
    backgroundColor: 'transparent', borderWidth: 1, borderColor: colors.ash, marginTop: 0,
    borderRadius: 3, paddingVertical: 14, paddingHorizontal: 32, alignItems: 'center',
  },
  retryTextSecondary: {
    fontFamily: fonts.uiMedium, fontSize: 10, letterSpacing: 2.5,
    color: colors.fog, fontWeight: '700', textAlign: 'center',
  },
  retryBtnTertiary: {
    backgroundColor: 'transparent', borderWidth: 1, borderColor: colors.fog + '33', marginTop: 0,
    borderRadius: 3, paddingVertical: 14, paddingHorizontal: 32, alignItems: 'center',
  },
  retryTextTertiary: {
    fontFamily: fonts.uiMedium, fontSize: 10, letterSpacing: 2.5,
    color: colors.fog + '99', fontWeight: '700', textAlign: 'center',
  },
});
