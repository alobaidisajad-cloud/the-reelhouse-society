import { useRef, useEffect, useCallback } from 'react';
import {
  View, Text, TextInput, StyleSheet,
  ScrollView,
  ActivityIndicator,
  KeyboardAvoidingView, Platform
} from 'react-native';
import { X, Sparkles } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import Animated, {
  FadeInDown, FadeInUp, FadeIn,
  useSharedValue, useAnimatedStyle, withTiming, withRepeat,
  Easing, interpolate, ReduceMotion,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { colors, fonts, effects } from '@/src/theme/theme';
import PressableScale from '@/src/components/PressableScale';
import { pickAny } from '@/src/lore/fragments';
import { useAuthFlow } from '@/src/hooks/useAuthFlow';

import { PasswordStrengthMeter } from '@/src/components/auth/PasswordStrengthMeter';
import { EmailConfirmationScreen } from '@/src/components/auth/EmailConfirmationScreen';
import { PasswordRecoveryModal } from '@/src/components/auth/PasswordRecoveryModal';
import { ToastOverlay } from '@/src/components/ToastOverlay';

const AnimatedView = Animated.createAnimatedComponent(View);
const AnimatedText = Animated.createAnimatedComponent(Text);
const AnimatedSparkles = Animated.createAnimatedComponent(Sparkles);

WebBrowser.maybeCompleteAuthSession();

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
    // Round 7: Removed infinite loop to allow UI thread idling
    opacity.value = withTiming(0.8, { duration: 2000, easing: Easing.inOut(Easing.ease) });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const style = useAnimatedStyle(() => ({ opacity: opacity.value }));
  return <Animated.View style={[s.rule, style]} />;
}

export default function LoginScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  
  const {
    isLogin,
    emailOrUsername, setEmailOrUsername,
    password, setPassword,
    username, setUsername,
    submitting,
    showPassword, setShowPassword,
    forgotModalVisible, setForgotModalVisible,
    forgotEmail, setForgotEmail,
    forgotLoading, forgotSent, setForgotSent,
    awaitingConfirmation, setAwaitingConfirmation, confirmedEmail, resending, resendCooldown,
    usernameStatus, checkUsernameAvailability, handleResend,
    handleLoginSubmit, handleForgotPassword, toggleMode
  } = useAuthFlow();

  // Memoize lore fragment so it doesn't change on every keystroke re-render
  const loreQuote = useRef(pickAny()).current;

  // Refs for input focus chaining
  const passwordRef = useRef<TextInput>(null);
  const usernameRef = useRef<TextInput>(null);

  // ── Animated title glow ──
  const titleGlow = useSharedValue(0);

  // ── Animated Submit Spinner ──
  const spinValue = useSharedValue(0);
  useEffect(() => {
    if (submitting) {
      // D2-01 FIX: Finite repeats instead of infinite loop to allow UI thread idling
      spinValue.value = withRepeat(withTiming(1, { duration: 1500, easing: Easing.linear }), 20);
    } else {
      spinValue.value = 0;
    }
  }, [submitting, spinValue]);

  const spinStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${spinValue.value * 360}deg` }]
  }));

  useEffect(() => {
    // Round 7: Removed infinite loop to allow UI thread idling
    titleGlow.value = withTiming(1, { duration: 3000, easing: Easing.inOut(Easing.ease) });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const titleGlowStyle = useAnimatedStyle(() => ({
    textShadowColor: `rgba(196, 150, 26, ${interpolate(titleGlow.value, [0, 1], [0.15, 0.55])})`,
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: interpolate(titleGlow.value, [0, 1], [4, 18]),
  }));

  // IMP #1: Haptic feedback on input focus
  const onInputFocus = useCallback(() => {
    Haptics.selectionAsync();
  }, []);

  // ── EMAIL CONFIRMATION SCREEN ──
  if (awaitingConfirmation) {
    return (
      <EmailConfirmationScreen
        confirmedEmail={confirmedEmail}
        resending={resending}
        onResend={handleResend}
        onClose={() => { setAwaitingConfirmation(false); router.replace('/(tabs)'); }}
        resendCooldown={resendCooldown}
      />
    );
  }

  return (
    <View style={[s.container, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      <ToastOverlay />
      {/* ── Background & Atmospherics ── */}
      <LinearGradient
        colors={[colors.ink, '#0B0907', colors.soot]}
        locations={[0, 0.5, 1]}
        style={StyleSheet.absoluteFillObject}
      />
      <FilmPerforations side="left" />
      <FilmPerforations side="right" />

      {/* ── Pinned Header / Close (0-Overlap) ── */}
      <View style={[s.fixedHeader, { top: insets.top }]}>
        <PressableScale
          style={s.closeBtn}
          onPress={() => {
            // If there's a stack to go back to, go back; otherwise go home
            if (router.canGoBack()) {
              router.back();
            } else {
              // #1 AUDIT FIX: Defer navigation to let auth guard settle,
              // preventing visible flash on cold-launch deep links
              requestAnimationFrame(() => {
                router.replace('/(tabs)');
              });
            }
          }}
          hitSlop={{ top: 15, right: 15, bottom: 15, left: 15 }}
          haptic="light"
        >
          <X size={18} color={colors.bone} strokeWidth={2} />
        </PressableScale>
      </View>

      {/* IMP #2: Native keyboard handling — no KeyboardAvoidingView jank */}
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView
          contentContainerStyle={s.scroll}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="interactive"
          automaticallyAdjustKeyboardInsets={true}
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
            {/* eslint-disable-next-line react/no-unescaped-entities */}
            — "{loreQuote}"
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
                style={[s.input, submitting && s.inputDisabled]}
                placeholder={isLogin ? 'patron@cinema.org' : 'your@email.com'}
                placeholderTextColor={colors.fog}
                value={emailOrUsername}
                onChangeText={setEmailOrUsername}
                onFocus={onInputFocus}
                editable={!submitting}
                autoCapitalize="none"
                autoCorrect={false}
                spellCheck={false}
                keyboardType={isLogin ? 'default' : 'email-address'}
                selectionColor={colors.sepia}
                returnKeyType="next"
                onSubmitEditing={() => {
                  if (!isLogin && usernameRef.current) usernameRef.current.focus();
                  else if (passwordRef.current) passwordRef.current.focus();
                }}
                blurOnSubmit={false}
                maxLength={254}
                keyboardAppearance="dark"
                accessibilityLabel={isLogin ? 'Email or username' : 'Email address'}
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
                  style={[s.input, { paddingLeft: 30, paddingRight: usernameStatus !== 'idle' ? 40 : 16 }, submitting && s.inputDisabled]}
                  placeholder="your_handle"
                  placeholderTextColor={colors.fog}
                  value={username}
                  onChangeText={(val) => { setUsername(val); checkUsernameAvailability(val); }}
                  onFocus={onInputFocus}
                  editable={!submitting}
                  autoCapitalize="none"
                  selectionColor={colors.sepia}
                  returnKeyType="next"
                  onSubmitEditing={() => passwordRef.current?.focus()}
                  blurOnSubmit={false}
                  autoCorrect={false}
                  maxLength={30}
                  keyboardAppearance="dark"
                  accessibilityLabel="Username handle"
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
                style={[s.input, { paddingRight: 60 }, submitting && s.inputDisabled]}
                placeholder="••••••••"
                placeholderTextColor={colors.fog}
                value={password}
                onChangeText={setPassword}
                onFocus={onInputFocus}
                editable={!submitting}
                secureTextEntry={!showPassword}
                selectionColor={colors.sepia}
                returnKeyType="go"
                onSubmitEditing={handleLoginSubmit}
                autoCorrect={false}
                maxLength={128}
                keyboardAppearance="dark"
                accessibilityLabel="Password"
              />
              <PressableScale
                style={s.showBtn}
                onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setShowPassword(v => !v); }}
                hitSlop={{ top: 15, right: 15, bottom: 15, left: 15 }}
                pressedScale={0.92}
              >
                <Text style={s.showText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>{showPassword ? 'HIDE' : 'SHOW'}</Text>
              </PressableScale>
            </View>
          </View>

          {/* Password strength meter (signup only) */}
          {!isLogin && password.length > 0 && <PasswordStrengthMeter password={password} />}

          {/* Forgot password link (login mode only) */}
          {isLogin && (
            <PressableScale
              onPress={() => {
                setForgotEmail(emailOrUsername.includes('@') ? emailOrUsername : '');
                setForgotSent(false);
                setForgotModalVisible(true);
              }}
              style={s.forgotBtn} hitSlop={{ top: 15, bottom: 15, left: 15, right: 15 }}
              haptic="selection"
            >
              <Text style={s.forgotText}>Forgot your credentials?</Text>
            </PressableScale>
          )}

          {/* Submit */}
          <PressableScale
            style={[s.submitBtn, (submitting || (!isLogin && usernameStatus === 'taken')) && s.submitDisabled]}
            onPress={handleLoginSubmit}
            disabled={submitting || (!isLogin && usernameStatus === 'taken')}
            hitSlop={{ top: 15, bottom: 15, left: 15, right: 15 }}
            pressedScale={0.97}
          >
            {submitting ? (
              <View style={s.submitLoading}>
                <AnimatedSparkles size={16} color={colors.ink} style={spinStyle} />
                <Text style={s.submitText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>
                  {isLogin ? 'VERIFYING...' : 'PROCESSING APPLICATION...'}
                </Text>
              </View>
            ) : (
              <Text style={[s.submitText, !isLogin && usernameStatus === 'taken' && { opacity: 0.5 }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>
                {isLogin ? '✦  IDENTIFY & ENTER' : '✦  REQUEST ADMISSION'}
              </Text>
            )}
          </PressableScale>
        </AnimatedView>

        {/* ── Toggle Login/Signup ── */}
        <AnimatedView entering={FadeInUp.duration(600).delay(450).reduceMotion(ReduceMotion.Never)} style={s.toggleWrap}>
          <PressableScale onPress={toggleMode} hitSlop={{ top: 15, bottom: 15, left: 15, right: 15 }} haptic="selection">
            <Text style={s.toggleText}>
              {isLogin ? 'No membership? ' : 'Already admitted? '}
              <Text style={s.toggleHighlight}>
                {isLogin ? 'Request admission' : 'Identify yourself'}
              </Text>
            </Text>
          </PressableScale>
        </AnimatedView>

        {/* Footer legal note */}
        <AnimatedView entering={FadeIn.duration(500).delay(700).reduceMotion(ReduceMotion.Never)} style={s.footerNote}>
          <Text style={s.footerText}>
            {/* eslint-disable-next-line react/no-unescaped-entities */}
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

  fixedHeader: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 56,
    zIndex: 100,
    flexDirection: 'row',
    justifyContent: 'flex-start',
    paddingHorizontal: 24,
    paddingTop: 16,
  },
  closeBtn: {
    width: 44, height: 44,
    alignItems: 'flex-end',
    justifyContent: 'center',
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
  inputDisabled: {
    opacity: 0.5,
  },
  fieldHint: {
    fontFamily: fonts.ui,
    fontSize: 9,
    color: colors.sepia,
    letterSpacing: 0.5,
    marginTop: 2,
  },

  // ── Username Status ──
  usernameStatusWrap: {
    position: 'absolute',
    right: 12,
    top: 0,
    bottom: 0,
    justifyContent: 'center',
  },
  usernameAvailable: {
    fontSize: 16,
    // #9 AUDIT FIX: Using theme-defined validation color
    color: colors.validation,
    fontFamily: fonts.uiBold,
  },
  usernameTaken: {
    fontSize: 16,
    color: colors.bloodReel,
    fontFamily: fonts.uiBold,
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
