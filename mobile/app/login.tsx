import { useState, useRef, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, ScrollView, Modal,
  ActivityIndicator,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import Animated, {
  FadeInDown, FadeInUp, FadeIn,
  useSharedValue, useAnimatedStyle, withRepeat, withTiming, withSequence,
  Easing, interpolate, ReduceMotion,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { supabase } from '@/src/lib/supabase';
import { useRouter } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import * as Linking from 'expo-linking';
import { useAuthStore } from '@/src/stores/auth';
import { colors, fonts, effects } from '@/src/theme/theme';
import reelToast from '@/src/utils/reelToast';
import { pickAny } from '@/src/lore/fragments';

const AnimatedView = Animated.createAnimatedComponent(View);
const AnimatedText = Animated.createAnimatedComponent(Text);

WebBrowser.maybeCompleteAuthSession();

import { PasswordStrengthMeter, getPasswordChecks } from '@/src/components/auth/PasswordStrengthMeter';
import { EmailConfirmationScreen } from '@/src/components/auth/EmailConfirmationScreen';
import { PasswordRecoveryModal } from '@/src/components/auth/PasswordRecoveryModal';

// ── Decorative film-strip perforations ──
function FilmPerforations({ side }: { side: 'left' | 'right' }) {
  const holes = Array.from({ length: 18 });
  return (
    <View style={[perfStyles.strip, side === 'left' ? perfStyles.left : perfStyles.right]}>
      {holes.map((_, i) => (
        <View key={i} style={perfStyles.hole} />
      ))}
    </View>
  );
}

const perfStyles = StyleSheet.create({
  strip: {
    position: 'absolute', top: 0, bottom: 0, width: 18,
    justifyContent: 'space-evenly', alignItems: 'center',
    opacity: 0.08,
  },
  left: { left: 0 },
  right: { right: 0 },
  hole: {
    width: 8, height: 8, borderRadius: 1.5,
    backgroundColor: colors.parchment,
  },
});

// ── Subtle animated pulse for the gold accent line ──
function PulsingRule() {
  const opacity = useSharedValue(0.35);
  useEffect(() => {
    opacity.value = withRepeat(
      withSequence(
        withTiming(0.8, { duration: 2000, easing: Easing.inOut(Easing.ease) }),
        withTiming(0.35, { duration: 2000, easing: Easing.inOut(Easing.ease) }),
      ),
      -1, false,
    );
  }, []);
  const style = useAnimatedStyle(() => ({ opacity: opacity.value }));
  return <Animated.View style={[s.rule, style]} />;
}

export default function LoginScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { login, signup } = useAuthStore();


  const [isLogin, setIsLogin] = useState(true);
  const [emailOrUsername, setEmailOrUsername] = useState('');
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const [forgotModalVisible, setForgotModalVisible] = useState(false);
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotLoading, setForgotLoading] = useState(false);
  const [forgotSent, setForgotSent] = useState(false);

  // Email confirmation state (resend flow)
  const [awaitingConfirmation, setAwaitingConfirmation] = useState(false);
  const [confirmedEmail, setConfirmedEmail] = useState('');
  const [resending, setResending] = useState(false);

  // Username availability
  const [usernameStatus, setUsernameStatus] = useState<'idle' | 'checking' | 'available' | 'taken'>('idle');
  const usernameCheckTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Login rate limiting
  const [loginAttempts, setLoginAttempts] = useState(0);
  const [lockoutUntil, setLockoutUntil] = useState(0);
  const MAX_LOGIN_ATTEMPTS = 5;
  const LOCKOUT_DURATION_MS = 30000;

  // Refs for input focus chaining
  const passwordRef = useRef<TextInput>(null);
  const usernameRef = useRef<TextInput>(null);

  // ── Animated title glow ──
  const titleGlow = useSharedValue(0);
  useEffect(() => {
    titleGlow.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 3000, easing: Easing.inOut(Easing.ease) }),
        withTiming(0, { duration: 3000, easing: Easing.inOut(Easing.ease) }),
      ),
      -1, false,
    );
  }, []);
  const titleGlowStyle = useAnimatedStyle(() => ({
    textShadowColor: `rgba(196, 150, 26, ${interpolate(titleGlow.value, [0, 1], [0.15, 0.55])})`,
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: interpolate(titleGlow.value, [0, 1], [4, 18]),
  }));

  // Password strength for signup mode
  const pwChecks = getPasswordChecks(password);
  const pwPassed = Object.values(pwChecks).filter(Boolean).length;
  const pwStrong = pwPassed === 5;

  // ── DEBOUNCED USERNAME AVAILABILITY CHECK ──
  useEffect(() => {
    return () => { if (usernameCheckTimer.current) clearTimeout(usernameCheckTimer.current); };
  }, []);

  const checkUsernameAvailability = (value: string) => {
    if (usernameCheckTimer.current) clearTimeout(usernameCheckTimer.current);
    const trimmed = value.trim().toLowerCase().replace(/\s+/g, '_');
    if (trimmed.length < 3) { setUsernameStatus('idle'); return; }
    setUsernameStatus('checking');
    usernameCheckTimer.current = setTimeout(async () => {
      try {
        const { data, error } = await supabase
          .from('profiles')
          .select('username')
          .eq('username', trimmed)
          .maybeSingle();
        if (error) throw error;
        setUsernameStatus(data ? 'taken' : 'available');
      } catch {
        setUsernameStatus('idle');
      }
    }, 500);
  };

  // ── AUTO-LOGIN POLLING AFTER EMAIL CONFIRMATION ──
  useEffect(() => {
    if (!awaitingConfirmation || !emailOrUsername || !password) return;
    let cancelled = false;
    let attempts = 0;
    const maxAttempts = 120; // 10 minutes

    const poll = setInterval(async () => {
      if (cancelled || attempts >= maxAttempts) { clearInterval(poll); return; }
      attempts++;
      try {
        const { data, error } = await supabase.auth.signInWithPassword({
          email: emailOrUsername, password,
        });
        if (!error && data?.session) {
          clearInterval(poll);
          if (cancelled) return;
          const { data: profile } = await supabase
            .from('profiles')
            .select('id, username, role, bio, avatar_url, display_name, is_social_private, preferences, persona, created_at')
            .eq('id', data.session.user.id)
            .single();
          useAuthStore.setState({
            user: { ...data.session.user, ...profile, following: [] } as import('@/src/types').User,
            isAuthenticated: true,
          });
          setAwaitingConfirmation(false);
          router.back();
        }
      } catch { /* silently retry */ }
    }, 5000);

    return () => { cancelled = true; clearInterval(poll); };
  }, [awaitingConfirmation, emailOrUsername, password]);

  // ── RESEND VERIFICATION EMAIL ──
  const handleResend = async () => {
    setResending(true);
    try {
      await supabase.auth.resend({ type: 'signup', email: confirmedEmail });
      reelToast('A new cipher has been wired to your inbox.');
    } catch {
      reelToast.error('The telegraph line is disrupted. Try again.');
    } finally {
      setResending(false);
    }
  };

  const handleSubmit = async () => {
    if (!emailOrUsername || !password || (!isLogin && !username)) {
      reelToast('All fields are required for clearance.');
      return;
    }
    // Rate limiting check
    const now = Date.now();
    if (isLogin && now < lockoutUntil) {
      const remaining = Math.ceil((lockoutUntil - now) / 1000);
      reelToast(`Credentials suspended. Retry in ${remaining}s.`);
      return;
    }
    // Enforce password strength on signup
    if (!isLogin && !pwStrong) {
      reelToast('Your cipher does not meet Society encryption standards.');
      return;
    }
    // Username availability guard
    if (!isLogin && usernameStatus === 'taken') {
      reelToast('That handle is already claimed by another patron.');
      return;
    }
    if (submitting) return;
    setSubmitting(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    try {
      if (isLogin) {
        await login(emailOrUsername.trim(), password);
        setLoginAttempts(0);
        router.back();
      } else {
        const formattedUsername = username.trim().toLowerCase().replace(/\s+/g, '_');
        if (formattedUsername.length < 3) {
          reelToast('Handle must be at least 3 characters.');
          setSubmitting(false);
          return;
        }
        const result = await signup(emailOrUsername.trim(), password, formattedUsername);
        if (result.needsConfirmation) {
          // Show the email confirmation screen with resend button
          setConfirmedEmail(emailOrUsername.trim());
          setAwaitingConfirmation(true);
        } else {
          router.back();
        }
      }
    } catch (error: unknown) {
      const rawMsg = error instanceof Error ? error.message : 'Authentication failed.';
      let msg = rawMsg;
      if (msg.includes('Database error saving new user')) msg = 'Username is already taken.';
      if (msg.includes('Invalid login credentials')) {
        setLoginAttempts(prev => prev + 1);
        if (loginAttempts + 1 >= MAX_LOGIN_ATTEMPTS) {
          setLockoutUntil(Date.now() + LOCKOUT_DURATION_MS);
          setLoginAttempts(0);
          msg = 'Too many failed attempts. Credentials suspended for 30 seconds.';
        } else {
          msg = 'Identity not recognized. Check your credentials.';
        }
      }
      reelToast.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  const handleOAuth = async (provider: 'google' | 'apple') => {
    if (submitting) return;
    setSubmitting(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      const redirectUri = Linking.createURL('/');
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider,
        options: {
          redirectTo: redirectUri,
          skipBrowserRedirect: true,
        },
      });
      if (error) throw error;

      if (data?.url) {
        const res = await WebBrowser.openAuthSessionAsync(data.url, redirectUri);
        if (res.type === 'success') {
          // Supabase handles the PKCE code exchange via deep link
        }
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Authentication failed. The booth is dark.';
      reelToast.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  const handleForgotPassword = async () => {
    if (!forgotEmail.trim()) {
      reelToast('Please enter your email to request a credential reset.');
      return;
    }
    setForgotLoading(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(forgotEmail.trim(), {
        redirectTo: Linking.createURL('auth-callback') + '?type=recovery',
      });
      if (error) throw error;
      setForgotSent(true);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'The telegraph line is down. Try again.';
      reelToast.error(msg);
    } finally {
      setForgotLoading(false);
    }
  };

  const toggleMode = () => {
    setIsLogin(v => !v);
    setEmailOrUsername('');
    setPassword('');
    setUsername('');
    setUsernameStatus('idle');
  };

  // ── EMAIL CONFIRMATION SCREEN ──
  if (awaitingConfirmation) {
    return (
      <EmailConfirmationScreen
        confirmedEmail={confirmedEmail}
        resending={resending}
        onResend={handleResend}
        onClose={() => { setAwaitingConfirmation(false); router.back(); }}
      />
    );
  }

  return (
    <View style={[s.container, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      {/* ── Background & Atmospherics ── */}
      <LinearGradient
        colors={[colors.ink, '#0B0907', colors.soot]}
        locations={[0, 0.5, 1]}
        style={StyleSheet.absoluteFillObject}
      />
      <FilmPerforations side="left" />
      <FilmPerforations side="right" />

      {/* ── Pinned Header / Close (0-Overlap) ── */}
      <View style={s.fixedHeader}>
        <TouchableOpacity
          style={s.closeBtn}
          onPress={() => router.back()}
          hitSlop={{ top: 15, right: 15, bottom: 15, left: 15 }}
        >
          <Text style={s.closeText}>✕</Text>
        </TouchableOpacity>
      </View>

      <KeyboardAvoidingView style={s.keyboardFlex} behavior={Platform.OS === 'ios' ? 'padding' : 'height'} keyboardVerticalOffset={Platform.OS === 'ios' ? insets.bottom + 10 : 0}>
        <ScrollView
          contentContainerStyle={s.scroll}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* ── Titles ── */}
          <AnimatedView entering={FadeInDown.duration(900).reduceMotion(ReduceMotion.Never)} style={s.header}>
          {/* Decorative stamp — official logo */}
          <View style={s.stampContainer}>
            <View style={s.stampBorder}>
              <Image
                source={require('../assets/images/reelhouse-logo.png')}
                style={s.stampLogo}
                contentFit="contain"
              />
            </View>
          </View>

          <Text style={s.eyebrow} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>
            {isLogin ? 'IDENTIFY YOURSELF' : 'REQUEST MEMBERSHIP'}
          </Text>

          <AnimatedText style={[s.title, titleGlowStyle]}>
            {isLogin ? 'Enter\nThe House' : 'Join\nThe Society'}
          </AnimatedText>

          <PulsingRule />

          <Text style={s.subtitle}>
            {isLogin
              ? 'The House remembers its own.'
              : 'Every great collection begins with a single frame.'}
          </Text>

          <Text style={s.loreTransmission}>
            — “{pickAny()}”
          </Text>
        </AnimatedView>

        {/* ── Form ── */}
        <AnimatedView entering={FadeInDown.duration(700).delay(250).reduceMotion(ReduceMotion.Never)} style={s.formCard}>
          {/* Subtle top border glow */}
          <View style={s.formCardGlow} />

          {/* Email / Username */}
          <View style={s.fieldGroup}>
            <Text style={s.inputLabel}>{isLogin ? 'EMAIL OR USERNAME' : 'EMAIL ADDRESS'}</Text>
            <View style={s.inputWrap}>
              <TextInput
                style={s.input}
                placeholder={isLogin ? 'patron@cinema.org' : 'your@email.com'}
                placeholderTextColor={colors.fog}
                value={emailOrUsername}
                onChangeText={setEmailOrUsername}
                autoCapitalize="none"
                keyboardType={isLogin ? 'default' : 'email-address'}
                selectionColor={colors.sepia}
                returnKeyType="next"
                onSubmitEditing={() => {
                  if (!isLogin && usernameRef.current) usernameRef.current.focus();
                  else if (passwordRef.current) passwordRef.current.focus();
                }}
                blurOnSubmit={false}
                autoCorrect={false}
                maxLength={254}
              />
            </View>
          </View>

          {/* Username (signup only) */}
          {!isLogin && (
            <AnimatedView entering={FadeInDown.duration(400)} style={s.fieldGroup}>
              <Text style={s.inputLabel}>USERNAME / HANDLE</Text>
              <View style={s.inputWrap}>
                <Text style={s.inputPrefix}>@</Text>
                <TextInput
                  ref={usernameRef}
                  style={[s.input, { paddingLeft: 30, paddingRight: usernameStatus !== 'idle' ? 40 : 16 }]}
                  placeholder="your_handle"
                  placeholderTextColor={colors.fog}
                  value={username}
                  onChangeText={(val) => { setUsername(val); checkUsernameAvailability(val); }}
                  autoCapitalize="none"
                  selectionColor={colors.sepia}
                  returnKeyType="next"
                  onSubmitEditing={() => passwordRef.current?.focus()}
                  blurOnSubmit={false}
                  autoCorrect={false}
                  maxLength={30}
                />
                {/* Status indicator */}
                {usernameStatus !== 'idle' && (
                  <View style={s.usernameStatusWrap}>
                    {usernameStatus === 'checking' && <ActivityIndicator size="small" color={colors.fog} />}
                    {usernameStatus === 'available' && <Text style={s.usernameAvailable}>✓</Text>}
                    {usernameStatus === 'taken' && <Text style={s.usernameTaken}>✕</Text>}
                  </View>
                )}
              </View>
              {username.length > 0 && username.length < 3 && (
                <Text style={s.fieldHint}>Minimum 3 characters</Text>
              )}
              {usernameStatus === 'taken' && (
                <Text style={[s.fieldHint, { color: colors.bloodReel }]}>USERNAME ALREADY TAKEN</Text>
              )}
            </AnimatedView>
          )}

          {/* Password */}
          <View style={s.fieldGroup}>
            <Text style={s.inputLabel}>PASSWORD</Text>
            <View style={s.inputWrap}>
              <TextInput
                ref={passwordRef}
                style={[s.input, { paddingRight: 60 }]}
                placeholder="••••••••"
                placeholderTextColor={colors.fog}
                value={password}
                onChangeText={setPassword}
                secureTextEntry={!showPassword}
                selectionColor={colors.sepia}
                returnKeyType="go"
                onSubmitEditing={handleSubmit}
                autoCorrect={false}
                maxLength={128}
              />
              <TouchableOpacity
                style={s.showBtn}
                onPress={() => setShowPassword(v => !v)}
                hitSlop={{ top: 15, right: 15, bottom: 15, left: 15 }}
              >
                <Text style={s.showText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>{showPassword ? 'HIDE' : 'SHOW'}</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Password strength meter (signup only) */}
          {!isLogin && password.length > 0 && <PasswordStrengthMeter password={password} />}

          {/* Forgot password link (login mode only) */}
          {isLogin && (
            <TouchableOpacity
              onPress={() => {
                setForgotEmail(emailOrUsername.includes('@') ? emailOrUsername : '');
                setForgotSent(false);
                setForgotModalVisible(true);
              }}
              style={s.forgotBtn} hitSlop={{ top: 15, bottom: 15, left: 15, right: 15 }}
            >
              <Text style={s.forgotText}>Forgot your credentials?</Text>
            </TouchableOpacity>
          )}

          {/* Submit */}
          <TouchableOpacity
            style={[s.submitBtn, submitting && s.submitDisabled]}
            onPress={handleSubmit}
            disabled={submitting}
            activeOpacity={0.7} hitSlop={{ top: 15, bottom: 15, left: 15, right: 15 }}
          >
            {submitting ? (
              <View style={s.submitLoading}>
                <ActivityIndicator size="small" color={colors.ink} />
                <Text style={s.submitText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>
                  {isLogin ? 'VERIFYING...' : 'PROCESSING APPLICATION...'}
                </Text>
              </View>
            ) : (
              <Text style={s.submitText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>
                {isLogin ? '✦  IDENTIFY & ENTER' : '✦  REQUEST ADMISSION'}
              </Text>
            )}
          </TouchableOpacity>
        </AnimatedView>

        {/* ── Toggle Login/Signup ── */}
        <AnimatedView entering={FadeInUp.duration(600).delay(450).reduceMotion(ReduceMotion.Never)} style={s.toggleWrap}>
          <TouchableOpacity onPress={toggleMode} activeOpacity={0.6} hitSlop={{ top: 15, bottom: 15, left: 15, right: 15 }}>
            <Text style={s.toggleText}>
              {isLogin ? 'No membership? ' : 'Already admitted? '}
              <Text style={s.toggleHighlight}>
                {isLogin ? 'Request admission' : 'Identify yourself'}
              </Text>
            </Text>
          </TouchableOpacity>
        </AnimatedView>

        {/* Footer legal note */}
        <AnimatedView entering={FadeIn.duration(500).delay(700).reduceMotion(ReduceMotion.Never)} style={s.footerNote}>
          <Text style={s.footerText}>
            By continuing, you agree to The ReelHouse Society's{'\n'}Terms of Service & Privacy Policy
          </Text>
        </AnimatedView>
      </ScrollView>
      </KeyboardAvoidingView>

      {/* ── Forgot Password Modal ── */}
      <PasswordRecoveryModal
        visible={forgotModalVisible}
        forgotSent={forgotSent}
        forgotEmail={forgotEmail}
        forgotLoading={forgotLoading}
        onClose={() => setForgotModalVisible(false)}
        onEmailChange={setForgotEmail}
        onSubmit={handleForgotPassword}
        onBackToSignIn={() => { setForgotModalVisible(false); setForgotSent(false); }}
      />
    </View>
  );
}

// ══════════════════════════════════════════════════════════════
// STYLES — Archival Ledger Form
// ══════════════════════════════════════════════════════════════
const s = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.ink,
  },
  keyboardFlex: {
    flex: 1,
  },
  fixedHeader: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 56,
    zIndex: 100,
    flexDirection: 'row',
    justifyContent: 'flex-end',
    paddingHorizontal: 24,
    paddingTop: 16,
  },
  closeBtn: {
    width: 44, height: 44,
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  closeText: {
    color: colors.fog,
    fontSize: 20,
    fontFamily: fonts.ui,
    opacity: 0.8,
  },
  scroll: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: 32,
    paddingBottom: 24,
    paddingTop: 40,
  },

  // ── Headers ──
  header: {
    alignItems: 'center',
    marginBottom: 32,
  },
  stampContainer: {
    marginBottom: 16,
  },
  stampBorder: {
    width: 60,
    height: 60,
    borderRadius: 30,
    borderWidth: 1.5,
    borderColor: 'rgba(196,150,26,0.3)',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0E0B08',
  },
  stampLogo: {
    width: 28,
    height: 35,
    tintColor: colors.sepia,
  },
  eyebrow: {
    fontFamily: fonts.sub,
    fontSize: 9,
    letterSpacing: 5,
    color: colors.sepia,
    marginBottom: 12,
    textTransform: 'uppercase',
  },
  title: {
    fontFamily: fonts.display,
    fontSize: 34,
    color: colors.parchment,
    textAlign: 'center',
    lineHeight: 40,
    ...effects.textShadowDeep,
  },
  rule: {
    width: 60,
    height: 1,
    backgroundColor: colors.sepia,
    marginVertical: 16,
  },
  subtitle: {
    fontFamily: fonts.bodyItalic,
    fontSize: 12,
    color: colors.bone,
    textAlign: 'center',
    opacity: 0.8,
  },
  loreTransmission: {
    fontFamily: fonts.bodyItalic,
    fontSize: 10,
    color: colors.fog,
    textAlign: 'center',
    marginTop: 12,
    opacity: 0.6,
    lineHeight: 16,
    maxWidth: 280,
    alignSelf: 'center',
  },
  formCard: {
    backgroundColor: '#110D0A',
    borderWidth: 1,
    borderColor: '#30261A',
    borderRadius: 6,
    padding: 24,
    gap: 20,
  },
  formCardGlow: {
    position: 'absolute',
    top: 0,
    left: 40,
    right: 40,
    height: 1,
    backgroundColor: colors.sepia,
    opacity: 0.4,
  },

  // ── Archival Inputs ──
  fieldGroup: {
    gap: 8,
  },
  inputLabel: {
    fontFamily: fonts.ui,
    fontSize: 9,
    letterSpacing: 2.5,
    color: colors.fog,
    textTransform: 'uppercase',
  },
  inputWrap: {
    position: 'relative',
  },
  inputPrefix: {
    position: 'absolute',
    left: 4,
    top: 10,
    fontFamily: fonts.mono,
    fontSize: 16,
    color: colors.sepia,
    zIndex: 2,
    opacity: 0.8,
  },
  input: {
    backgroundColor: 'transparent',
    borderBottomWidth: 2,
    borderColor: '#3A2E1C',
    paddingVertical: 12,
    paddingHorizontal: 4,
    fontSize: 16,
    fontFamily: fonts.mono,
    color: colors.parchment,
  },
  fieldHint: {
    fontFamily: fonts.ui,
    fontSize: 9,
    color: colors.sepia,
    letterSpacing: 0.5,
    marginTop: 2,
  },

  // ── Password ──
  showBtn: {
    position: 'absolute',
    right: 14,
    top: 0,
    bottom: 0,
    justifyContent: 'center',
  },
  showText: {
    fontFamily: fonts.uiMedium,
    fontSize: 9,
    letterSpacing: 1.5,
    color: colors.sepia,
  },

  // ── Forgot password ──
  forgotBtn: {
    alignSelf: 'flex-end',
    marginTop: -8,
  },
  forgotText: {
    fontFamily: fonts.ui,
    color: colors.fog,
    fontSize: 10,
    letterSpacing: 0.5,
    textDecorationLine: 'underline',
    textDecorationColor: colors.fog,
  },

  // ── Submit ──
  submitBtn: {
    backgroundColor: colors.sepia,
    borderRadius: 3,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 4,
    ...effects.glowSepia,
  },
  submitDisabled: {
    opacity: 0.5,
    shadowOpacity: 0,
  },
  submitText: {
    fontFamily: fonts.uiMedium,
    fontSize: 11,
    letterSpacing: 2.5,
    color: colors.ink,
    fontWeight: '700',
  },
  submitLoading: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },

  // ── Divider ──
  dividerWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 2,
  },
  dividerLine: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.ash,
  },
  dividerText: {
    fontFamily: fonts.uiMedium,
    color: colors.fog,
    fontSize: 9,
    marginHorizontal: 16,
    letterSpacing: 2,
  },

  // ── OAuth ──
  oauthWrap: {
    gap: 12,
  },
  oauthBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: colors.ash,
    borderRadius: 3,
    paddingVertical: 14,
    gap: 10,
  },
  oauthApple: {
    backgroundColor: colors.parchment,
    borderColor: colors.parchment,
  },
  oauthAppleIcon: {
    fontSize: 17,
    color: colors.ink,
    marginTop: Platform.OS === 'ios' ? -1 : 0,
  },
  oauthAppleText: {
    fontFamily: fonts.uiMedium,
    fontSize: 10,
    letterSpacing: 1.5,
    color: colors.ink,
    fontWeight: '600',
  },
  oauthGoogleIcon: {
    fontSize: 15,
    color: colors.parchment,
    fontFamily: fonts.uiBold,
  },
  oauthText: {
    fontFamily: fonts.uiMedium,
    fontSize: 10,
    letterSpacing: 1.5,
    color: colors.bone,
    fontWeight: '600',
  },

  // ── Toggle ──
  toggleWrap: {
    alignItems: 'center',
    marginTop: 28,
  },
  toggleText: {
    fontFamily: fonts.body,
    color: colors.fog,
    fontSize: 12,
  },
  toggleHighlight: {
    color: colors.sepia,
    fontFamily: fonts.bodyBold,
    textDecorationLine: 'underline',
    textDecorationColor: colors.sepia,
  },

  // ── Footer ──
  footerNote: {
    alignItems: 'center',
    marginTop: 20,
    paddingHorizontal: 16,
  },
  footerText: {
    fontFamily: fonts.ui,
    fontSize: 8,
    letterSpacing: 0.5,
    color: colors.fog,
    textAlign: 'center',
    lineHeight: 14,
    opacity: 0.6,
  },
});
