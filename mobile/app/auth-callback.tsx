import { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import Animated, { FadeIn, FadeInDown, ReduceMotion } from 'react-native-reanimated';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { supabase } from '@/src/lib/supabase';
import { useAuthStore } from '@/src/stores/auth';
import { colors, fonts, effects } from '@/src/theme/theme';

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
          setTimeout(() => router.replace('/(tabs)'), 2000);
        } else {
          throw new Error('No valid token found in this link. It may have expired.');
        }
        return;
      }

      // Exchange the OTP token for a real session
      const { data, error } = await supabase.auth.verifyOtp({
        token_hash: tokenHash,
        type: type as any,
      });
      if (error) throw error;

      if (type === 'recovery') {
        // Password recovery — redirect to reset-password screen
        // The session is now active, so supabase.auth.updateUser will work
        setStatus('success');
        setTimeout(() => router.replace('/reset-password'), 1500);
        return;
      }

      if (data?.session) {
        // Email verification — fetch profile and set auth state
        const { data: profile } = await supabase
          .from('profiles')
          .select('id, username, role, bio, avatar_url, display_name, is_social_private, preferences, persona, created_at')
          .eq('id', data.session.user.id)
          .single();

        useAuthStore.setState({
          user: { ...data.session.user, ...profile, following: [] } as any,
          isAuthenticated: true,
        });

        setStatus('success');
        setTimeout(() => router.replace('/(tabs)'), 2000);
      } else {
        throw new Error('Verification succeeded but no session was created.');
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Verification failed. The link may have expired.');
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
            <Text style={s.title}>Decrypting your{'\n'}dossier...</Text>
          </AnimatedView>
        )}

        {/* ── Success ── */}
        {status === 'success' && (
          <AnimatedView entering={FadeInDown.duration(600).reduceMotion(ReduceMotion.Never)} style={s.stateWrap}>
            <View style={s.successIconWrap}>
              <Text style={s.successIcon}>✓</Text>
            </View>
            <Text style={[s.eyebrow, { color: colors.sepia }]}>CLEARANCE GRANTED</Text>
            <Text style={s.title}>
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
            <Text style={s.title}>Link Expired{'\n'}or Invalid</Text>
            <Text style={s.body}>{errorMsg}</Text>
            <TouchableOpacity
              style={s.retryBtn}
              onPress={() => router.replace('/(tabs)')}
              activeOpacity={0.7}
            >
              <Text style={s.retryText}>RETURN TO THE LOBBY</Text>
            </TouchableOpacity>
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
    paddingHorizontal: 32, marginTop: 28,
    ...effects.glowSepia,
  },
  retryText: {
    fontFamily: fonts.uiMedium, fontSize: 10, letterSpacing: 2.5,
    color: colors.ink, fontWeight: '700',
  },
});
