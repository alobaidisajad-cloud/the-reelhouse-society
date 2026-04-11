import { useState, useRef, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, ScrollView, Alert, Modal,
  ActivityIndicator, Image,
} from 'react-native';
import Animated, {
  FadeInDown, FadeInUp, FadeIn,
  useSharedValue, useAnimatedStyle, withRepeat, withTiming, withSequence,
  Easing, interpolate, ReduceMotion,
} from 'react-native-reanimated';
import { supabase } from '@/src/lib/supabase';
import { useRouter } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import * as Linking from 'expo-linking';
import { useAuthStore } from '@/src/stores/auth';
import { colors, fonts, effects } from '@/src/theme/theme';

const AnimatedView = Animated.createAnimatedComponent(View);
const AnimatedText = Animated.createAnimatedComponent(Text);

WebBrowser.maybeCompleteAuthSession();

// ── Password strength checks — identical to web ──
function getPasswordChecks(pw: string) {
  return {
    length:    pw.length >= 8,
    uppercase: /[A-Z]/.test(pw),
    lowercase: /[a-z]/.test(pw),
    number:    /[0-9]/.test(pw),
    special:   /[^A-Za-z0-9]/.test(pw),
  };
}
const PW_CHECK_LABELS: Array<[string, string]> = [
  ['length', '8+ characters'],
  ['uppercase', 'Uppercase letter'],
  ['lowercase', 'Lowercase letter'],
  ['number', 'Number'],
  ['special', 'Special character'],
];
function getStrengthInfo(passed: number) {
  const labels = ['', 'WEAK', 'FAIR', 'FAIR', 'STRONG', 'VERY STRONG'];
  const clrs   = ['', colors.bloodReel, '#c4a000', '#c4a000', colors.sepia, '#4caf50'];
  return { label: labels[passed], color: clrs[passed] };
}

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
  const { label: pwStrengthLabel, color: pwStrengthColor } = getStrengthInfo(pwPassed);

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
            user: { ...data.session.user, ...profile, following: [] } as any,
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
      Alert.alert('Sent!', 'A new verification link has been sent to your inbox.');
    } catch {
      Alert.alert('Error', 'Could not resend. Please try again.');
    } finally {
      setResending(false);
    }
  };

  const handleSubmit = async () => {
    if (!emailOrUsername || !password || (!isLogin && !username)) {
      Alert.alert('Missing Fields', 'Please fill all fields.');
      return;
    }
    // Rate limiting check
    const now = Date.now();
    if (isLogin && now < lockoutUntil) {
      const remaining = Math.ceil((lockoutUntil - now) / 1000);
      Alert.alert('Too Many Attempts', `Account locked. Try again in ${remaining}s.`);
      return;
    }
    // Enforce password strength on signup
    if (!isLogin && !pwStrong) {
      Alert.alert('Weak Password', 'Password does not meet all security requirements.');
      return;
    }
    // Username availability guard
    if (!isLogin && usernameStatus === 'taken') {
      Alert.alert('Username Taken', 'That username is already taken. Choose another.');
      return;
    }
    if (submitting) return;
    setSubmitting(true);

    try {
      if (isLogin) {
        await login(emailOrUsername.trim(), password);
        setLoginAttempts(0);
        router.back();
      } else {
        const formattedUsername = username.trim().toLowerCase().replace(/\s+/g, '_');
        if (formattedUsername.length < 3) {
          Alert.alert('Invalid Username', 'Username must be at least 3 characters.');
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
    } catch (error: any) {
      let msg = error?.message || 'Authentication failed.';
      if (msg.includes('Database error saving new user')) msg = 'Username is already taken.';
      if (msg.includes('Invalid login credentials')) {
        setLoginAttempts(prev => prev + 1);
        if (loginAttempts + 1 >= MAX_LOGIN_ATTEMPTS) {
          setLockoutUntil(Date.now() + LOCKOUT_DURATION_MS);
          setLoginAttempts(0);
          msg = 'Account locked for 30 seconds due to too many failed attempts.';
        } else {
          msg = 'Invalid email/username or password.';
        }
      }
      Alert.alert('Error', msg);
    } finally {
      setSubmitting(false);
    }
  };

  const handleOAuth = async (provider: 'google' | 'apple') => {
    if (submitting) return;
    setSubmitting(true);
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
    } catch (err: any) {
      Alert.alert('OAuth Error', err.message || 'Failed to authenticate.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleForgotPassword = async () => {
    if (!forgotEmail.trim()) {
      Alert.alert('Missing Email', 'Please enter your email address to reset your password.');
      return;
    }
    setForgotLoading(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(forgotEmail.trim(), {
        redirectTo: Linking.createURL('auth-callback') + '?type=recovery',
      });
      if (error) throw error;
      setForgotSent(true);
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Could not send reset link.');
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
      <View style={s.container}>
        <View style={s.confirmationWrap}>
          <AnimatedView entering={FadeIn.duration(600).reduceMotion(ReduceMotion.Never)} style={s.confirmationContent}>
            {/* Close */}
            <TouchableOpacity
              style={s.closeBtn}
              onPress={() => { setAwaitingConfirmation(false); router.back(); }}
              hitSlop={{ top: 12, right: 12, bottom: 12, left: 12 }}
            >
              <Text style={s.closeText}>✕</Text>
            </TouchableOpacity>

            {/* Floating mail icon */}
            <View style={s.confirmIconWrap}>
              <Text style={s.confirmIconEmoji}>✉️</Text>
            </View>

            <Text style={s.confirmEyebrow}>CLEARANCE PENDING</Text>
            <Text style={s.confirmTitle}>Check Your Inbox.</Text>
            <Text style={s.confirmBody}>
              We sent a classified verification link to:
            </Text>
            <View style={s.confirmEmailBox}>
              <Text style={s.confirmEmailText}>{confirmedEmail}</Text>
            </View>
            <Text style={s.confirmInstructions}>
              CLICK THE LINK IN YOUR EMAIL TO COMPLETE YOUR ENROLLMENT.{"\n"}
              CHECK YOUR SPAM FOLDER IF IT DOESN'T ARRIVE WITHIN 2 MINUTES.
            </Text>

            {/* Resend button */}
            <TouchableOpacity
              style={[s.confirmResendBtn, resending && { opacity: 0.5 }]}
              onPress={handleResend}
              disabled={resending}
              activeOpacity={0.7}
            >
              {resending ? (
                <View style={s.submitLoading}>
                  <ActivityIndicator size="small" color={colors.bone} />
                  <Text style={s.confirmResendText}>SENDING...</Text>
                </View>
              ) : (
                <Text style={s.confirmResendText}>↻  RESEND LINK</Text>
              )}
            </TouchableOpacity>

            <Text style={s.confirmAutoNote}>
              THIS SCREEN WILL AUTOMATICALLY LOG YOU IN ONCE CONFIRMED.
            </Text>
          </AnimatedView>
        </View>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView style={s.container} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      {/* Film-strip decoration */}
      <FilmPerforations side="left" />
      <FilmPerforations side="right" />

      <ScrollView
        contentContainerStyle={s.scroll}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Close button */}
        <TouchableOpacity
          style={s.closeBtn}
          onPress={() => router.back()}
          hitSlop={{ top: 12, right: 12, bottom: 12, left: 12 }}
        >
          <Text style={s.closeText}>✕</Text>
        </TouchableOpacity>

        {/* ── Header ── */}
        <AnimatedView entering={FadeInDown.duration(900).reduceMotion(ReduceMotion.Never)} style={s.header}>
          {/* Decorative stamp — official logo */}
          <View style={s.stampContainer}>
            <View style={s.stampBorder}>
              <Image
                source={require('../assets/images/reelhouse-logo.png')}
                style={s.stampLogo}
                resizeMode="contain"
              />
            </View>
          </View>

          <Text style={s.eyebrow}>
            {isLogin ? 'RETURNING PATRON' : 'NEW MEMBER APPLICATION'}
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
              />
              <TouchableOpacity
                style={s.showBtn}
                onPress={() => setShowPassword(v => !v)}
                hitSlop={{ top: 10, right: 10, bottom: 10, left: 10 }}
              >
                <Text style={s.showText}>{showPassword ? 'HIDE' : 'SHOW'}</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Password strength meter (signup only) */}
          {!isLogin && password.length > 0 && (
            <AnimatedView entering={FadeInDown.duration(300)} style={s.strengthWrap}>
              <View style={s.strengthBarRow}>
                {[1, 2, 3, 4, 5].map(i => (
                  <View
                    key={i}
                    style={[
                      s.strengthSegment,
                      { backgroundColor: i <= pwPassed ? pwStrengthColor : colors.ash },
                    ]}
                  />
                ))}
                <Text style={[s.strengthLabel, { color: pwStrengthColor }]}>{pwStrengthLabel}</Text>
              </View>
              <View style={s.checksGrid}>
                {PW_CHECK_LABELS.map(([key, label]) => (
                  <View key={key} style={s.checkRow}>
                    <Text style={[s.checkIcon, { color: (pwChecks as any)[key] ? '#4caf50' : colors.fog }]}>
                      {(pwChecks as any)[key] ? '✓' : '○'}
                    </Text>
                    <Text style={[s.checkLabel, { color: (pwChecks as any)[key] ? '#4caf50' : colors.fog }]}>
                      {label}
                    </Text>
                  </View>
                ))}
              </View>
            </AnimatedView>
          )}

          {/* Forgot password link (login mode only) */}
          {isLogin && (
            <TouchableOpacity
              onPress={() => {
                setForgotEmail(emailOrUsername.includes('@') ? emailOrUsername : '');
                setForgotSent(false);
                setForgotModalVisible(true);
              }}
              style={s.forgotBtn}
            >
              <Text style={s.forgotText}>Forgot your credentials?</Text>
            </TouchableOpacity>
          )}

          {/* Submit */}
          <TouchableOpacity
            style={[s.submitBtn, submitting && s.submitDisabled]}
            onPress={handleSubmit}
            disabled={submitting}
            activeOpacity={0.7}
          >
            {submitting ? (
              <View style={s.submitLoading}>
                <ActivityIndicator size="small" color={colors.ink} />
                <Text style={s.submitText}>
                  {isLogin ? 'ENTERING...' : 'REGISTERING...'}
                </Text>
              </View>
            ) : (
              <Text style={s.submitText}>
                {isLogin ? '✦  ENTER THE HOUSE' : '✦  CLAIM YOUR SEAT'}
              </Text>
            )}
          </TouchableOpacity>

          {/* Divider */}
          <View style={s.dividerWrap}>
            <View style={s.dividerLine} />
            <Text style={s.dividerText}>OR</Text>
            <View style={s.dividerLine} />
          </View>

          {/* OAuth */}
          <View style={s.oauthWrap}>
            {Platform.OS === 'ios' && (
              <TouchableOpacity
                style={[s.oauthBtn, s.oauthApple, submitting && s.submitDisabled]}
                onPress={() => handleOAuth('apple')}
                disabled={submitting}
                activeOpacity={0.7}
              >
                <Text style={s.oauthAppleIcon}></Text>
                <Text style={s.oauthAppleText}>CONTINUE WITH APPLE</Text>
              </TouchableOpacity>
            )}

            <TouchableOpacity
              style={[s.oauthBtn, submitting && s.submitDisabled]}
              onPress={() => handleOAuth('google')}
              disabled={submitting}
              activeOpacity={0.7}
            >
              <Text style={s.oauthGoogleIcon}>G</Text>
              <Text style={s.oauthText}>CONTINUE WITH GOOGLE</Text>
            </TouchableOpacity>
          </View>
        </AnimatedView>

        {/* ── Toggle Login/Signup ── */}
        <AnimatedView entering={FadeInUp.duration(600).delay(450).reduceMotion(ReduceMotion.Never)} style={s.toggleWrap}>
          <TouchableOpacity onPress={toggleMode} activeOpacity={0.6}>
            <Text style={s.toggleText}>
              {isLogin ? "Don't have a seat? " : 'Already a patron? '}
              <Text style={s.toggleHighlight}>
                {isLogin ? 'Join the Society' : 'Sign in'}
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

      {/* ── Forgot Password Modal ── */}
      <Modal
        visible={forgotModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setForgotModalVisible(false)}
      >
        <KeyboardAvoidingView style={s.modalOverlay} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <TouchableOpacity
            style={StyleSheet.absoluteFill}
            activeOpacity={1}
            onPress={() => setForgotModalVisible(false)}
          />
          <View style={s.modalContent}>
            {/* Close */}
            <TouchableOpacity
              style={s.modalCloseBtn}
              onPress={() => setForgotModalVisible(false)}
              hitSlop={{ top: 10, right: 10, bottom: 10, left: 10 }}
            >
              <Text style={s.modalCloseText}>✕</Text>
            </TouchableOpacity>

            {/* Header */}
            <View style={s.modalHeader}>
              <View style={s.modalIconWrap}>
                <Text style={s.modalIcon}>🔒</Text>
              </View>
              <Text style={s.modalEyebrow}>CREDENTIAL RECOVERY</Text>
              <Text style={s.modalTitle}>
                {forgotSent ? 'Check Your Inbox' : 'Reset Password'}
              </Text>
            </View>

            {forgotSent ? (
              <View>
                <Text style={s.modalBodyText}>
                  We sent a password reset link to{' '}
                  <Text style={{ color: colors.parchment, fontFamily: fonts.bodyBold }}>
                    {forgotEmail}
                  </Text>
                  .
                </Text>
                <Text style={s.modalSubText}>
                  Check your spam folder if it doesn't arrive within 2 minutes.
                </Text>
                <TouchableOpacity
                  style={s.modalSubmitBtn}
                  onPress={() => {
                    setForgotModalVisible(false);
                    setForgotSent(false);
                  }}
                  activeOpacity={0.7}
                >
                  <Text style={s.modalSubmitText}>BACK TO SIGN IN</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <View style={{ gap: 16 }}>
                <Text style={s.modalBodyText}>
                  Enter the email associated with your account and we'll send you a classified reset link.
                </Text>
                <View style={s.inputWrap}>
                  <TextInput
                    style={s.input}
                    placeholder="your@email.com"
                    placeholderTextColor={colors.fog}
                    value={forgotEmail}
                    onChangeText={setForgotEmail}
                    autoCapitalize="none"
                    keyboardType="email-address"
                    selectionColor={colors.sepia}
                    returnKeyType="go"
                    onSubmitEditing={handleForgotPassword}
                    autoCorrect={false}
                  />
                </View>
                <TouchableOpacity
                  style={[s.modalSubmitBtn, forgotLoading && s.submitDisabled]}
                  onPress={handleForgotPassword}
                  disabled={forgotLoading}
                  activeOpacity={0.7}
                >
                  {forgotLoading ? (
                    <View style={s.submitLoading}>
                      <ActivityIndicator size="small" color={colors.ink} />
                      <Text style={s.modalSubmitText}>SENDING...</Text>
                    </View>
                  ) : (
                    <Text style={s.modalSubmitText}>SEND RESET LINK</Text>
                  )}
                </TouchableOpacity>
              </View>
            )}
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </KeyboardAvoidingView>
  );
}

// ══════════════════════════════════════════════════════════════
// STYLES — Nitrate Noir Premium Auth
// ══════════════════════════════════════════════════════════════
const s = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.ink,
  },
  scroll: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: 32,
    paddingBottom: 40,
    paddingTop: 60,
  },

  // ── Close ──
  closeBtn: {
    position: 'absolute',
    top: 56,
    right: 0,
    zIndex: 10,
    padding: 8,
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeText: {
    color: colors.fog,
    fontSize: 18,
    fontFamily: fonts.ui,
  },

  // ── Header ──
  header: {
    alignItems: 'center',
    marginBottom: 32,
  },
  stampContainer: {
    marginBottom: 20,
  },
  stampBorder: {
    width: 64,
    height: 64,
    borderRadius: 32,
    borderWidth: 1.5,
    borderColor: colors.sepiaBorder,
    backgroundColor: 'rgba(196, 150, 26, 0.06)',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    ...effects.glowSepia,
  },
  stampLogo: {
    width: 44,
    height: 44,
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

  // ── Form Card ──
  formCard: {
    backgroundColor: 'rgba(14, 13, 10, 0.7)',
    borderWidth: 1,
    borderColor: colors.ash,
    borderRadius: 4,
    padding: 24,
    gap: 18,
    overflow: 'hidden',
  },
  formCardGlow: {
    position: 'absolute',
    top: 0,
    left: 20,
    right: 20,
    height: 1,
    backgroundColor: colors.sepia,
    opacity: 0.25,
  },

  // ── Fields ──
  fieldGroup: {
    gap: 6,
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
    left: 14,
    top: 15,
    fontFamily: fonts.body,
    fontSize: 14,
    color: colors.fog,
    zIndex: 2,
  },
  input: {
    backgroundColor: colors.soot,
    borderWidth: 1,
    borderColor: colors.ash,
    borderRadius: 3,
    padding: 14,
    paddingHorizontal: 16,
    fontSize: 14,
    fontFamily: fonts.body,
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

  // ── Forgot Password Modal ──
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(5, 3, 1, 0.95)',
    justifyContent: 'center',
    padding: 24,
  },
  modalContent: {
    backgroundColor: colors.ink,
    borderWidth: 1,
    borderColor: 'rgba(196,150,26,0.3)',
    borderRadius: 4,
    padding: 28,
    ...effects.glowSepia,
  },
  modalCloseBtn: {
    position: 'absolute',
    top: 16,
    right: 16,
    zIndex: 10,
    padding: 8,
  },
  modalCloseText: {
    color: colors.fog,
    fontSize: 16,
    fontFamily: fonts.ui,
  },
  modalHeader: {
    alignItems: 'center',
    marginBottom: 24,
  },
  modalIconWrap: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: 'rgba(196,150,26,0.08)',
    borderWidth: 1,
    borderColor: colors.sepiaBorder,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  modalIcon: {
    fontSize: 22,
  },
  modalEyebrow: {
    fontFamily: fonts.ui,
    fontSize: 8,
    letterSpacing: 4,
    color: colors.sepia,
    marginBottom: 8,
  },
  modalTitle: {
    fontFamily: fonts.display,
    fontSize: 24,
    color: colors.parchment,
    textAlign: 'center',
    ...effects.textShadowDeep,
  },
  modalBodyText: {
    fontFamily: fonts.body,
    fontSize: 13,
    color: colors.bone,
    lineHeight: 22,
    textAlign: 'center',
    marginBottom: 8,
  },
  modalSubText: {
    fontFamily: fonts.ui,
    fontSize: 9,
    letterSpacing: 1,
    color: colors.fog,
    textAlign: 'center',
    marginBottom: 20,
  },
  modalSubmitBtn: {
    backgroundColor: colors.sepia,
    borderRadius: 3,
    paddingVertical: 14,
    alignItems: 'center',
    ...effects.glowSepia,
  },
  modalSubmitText: {
    fontFamily: fonts.uiMedium,
    fontSize: 10,
    letterSpacing: 2,
    color: colors.ink,
    fontWeight: '700',
  },

  // ── Strength Meter ──
  strengthWrap: { gap: 10 },
  strengthBarRow: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  strengthSegment: { flex: 1, height: 3, borderRadius: 2 },
  strengthLabel: { fontFamily: fonts.ui, fontSize: 8, letterSpacing: 1.5, marginLeft: 8, minWidth: 80 },
  checksGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
  checkRow: { flexDirection: 'row', alignItems: 'center', gap: 4, width: '48%' as any },
  checkIcon: { fontFamily: fonts.ui, fontSize: 11 },
  checkLabel: { fontFamily: fonts.ui, fontSize: 9, letterSpacing: 0.5 },

  // ── Username Availability ──
  usernameStatusWrap: {
    position: 'absolute', right: 14, top: 0, bottom: 0,
    justifyContent: 'center',
  },
  usernameAvailable: { fontSize: 16, color: '#4caf50', fontFamily: fonts.uiBold },
  usernameTaken: { fontSize: 14, color: colors.bloodReel, fontFamily: fonts.uiBold },

  // ── Email Confirmation Screen ──
  confirmationWrap: {
    flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32,
  },
  confirmationContent: { alignItems: 'center', maxWidth: 360 },
  confirmIconWrap: {
    width: 64, height: 64, borderRadius: 32,
    backgroundColor: 'rgba(196, 150, 26, 0.1)',
    borderWidth: 1.5, borderColor: colors.sepia,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 20,
    ...effects.glowSepia,
  },
  confirmIconEmoji: { fontSize: 28 },
  confirmEyebrow: {
    fontFamily: fonts.ui, fontSize: 9, letterSpacing: 4,
    color: colors.sepia, marginBottom: 12,
  },
  confirmTitle: {
    fontFamily: fonts.display, fontSize: 28, color: colors.parchment,
    textAlign: 'center', lineHeight: 34, marginBottom: 16,
    ...effects.textShadowDeep,
  },
  confirmBody: {
    fontFamily: fonts.body, fontSize: 13, color: colors.bone,
    textAlign: 'center', lineHeight: 22, marginBottom: 12,
  },
  confirmEmailBox: {
    backgroundColor: colors.soot, borderWidth: 1, borderColor: colors.ash,
    borderRadius: 2, paddingVertical: 10, paddingHorizontal: 16,
    marginBottom: 20, alignSelf: 'stretch',
  },
  confirmEmailText: {
    fontFamily: fonts.ui, fontSize: 11, letterSpacing: 0.8,
    color: colors.flicker, textAlign: 'center',
  },
  confirmInstructions: {
    fontFamily: fonts.ui, fontSize: 8, letterSpacing: 1,
    color: colors.fog, textAlign: 'center', lineHeight: 16,
    marginBottom: 24,
  },
  confirmResendBtn: {
    borderWidth: 1, borderColor: colors.ash, borderRadius: 2,
    paddingVertical: 10, paddingHorizontal: 20,
    flexDirection: 'row', alignItems: 'center', gap: 6,
    marginBottom: 20,
  },
  confirmResendText: {
    fontFamily: fonts.ui, fontSize: 10, letterSpacing: 1.5, color: colors.bone,
  },
  confirmAutoNote: {
    fontFamily: fonts.ui, fontSize: 7, letterSpacing: 1,
    color: colors.fog, textAlign: 'center', opacity: 0.6,
  },
});
