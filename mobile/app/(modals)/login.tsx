import { useRef, useEffect, useCallback, useState } from 'react';
import {
  View, Text, TextInput,
  ScrollView
} from 'react-native';
import { X, Sparkles, Check } from 'lucide-react-native';
import TactileEngine from '@/src/utils/TactileEngine';
import Animated, {
  FadeInDown, FadeInUp, FadeIn, LinearTransition,
  useSharedValue, useAnimatedStyle, withTiming, withRepeat,
  Easing, interpolate, ReduceMotion,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { nav } from '@/src/utils/typedRouter';
import { useIsFocused } from '@react-navigation/native';
import * as WebBrowser from 'expo-web-browser';
import { colors } from '@/src/theme/theme';
import { displayTextProps } from '@/src/constants/textScaling';
import PressableScale from '@/src/components/PressableScale';
import { pickAny } from '@/src/lore/fragments';
import { useAuthFlow } from '@/src/hooks/useAuthFlow';
import { loginStyles as s } from '@/src/theme/authStyles';

import { AuthBackdrop, SocietyEyebrow, RegistrationBrackets, Est1924 } from '@/src/components/auth/AuthChrome';
import { SocietySeal } from '@/src/components/auth/SocietySeal';
import { PasswordStrengthMeter } from '@/src/components/auth/PasswordStrengthMeter';
import { EmailConfirmationScreen } from '@/src/components/auth/EmailConfirmationScreen';
import { PasswordRecoveryModal } from '@/src/components/auth/PasswordRecoveryModal';
import { ToastOverlay } from '@/src/components/ToastOverlay';

const AnimatedView = Animated.createAnimatedComponent(View);
const AnimatedText = Animated.createAnimatedComponent(Text);
const AnimatedSparkles = Animated.createAnimatedComponent(Sparkles);

WebBrowser.maybeCompleteAuthSession();

// ── Subtle animated pulse for the gold accent line ──
function PulsingRule() {
  const isFocused = useIsFocused();
  const opacity = useSharedValue(0.35);

  useEffect(() => {
    // Restore infinite cinematic breathing gated by useIsFocused
    if (isFocused) {
      opacity.value = withRepeat(
        withTiming(0.8, { duration: 2000, easing: Easing.inOut(Easing.ease) }),
        -1,
        true
      );
    } else {
      opacity.value = 0.35; // Reset to baseline when off-screen
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isFocused]);
  const style = useAnimatedStyle(() => ({ opacity: opacity.value }));
  return <Animated.View style={[s.rule, style]} />;
}

export default function LoginScreen() {

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
    handleLoginSubmit, handleForgotPassword, toggleMode,
    canAttempt, secondsRemaining, handleManualConfirmationCheck
  } = useAuthFlow();

  // Memoize lore fragment so it doesn't change on every keystroke re-render
  const loreQuote = useRef(pickAny()).current;

  // Refs for input focus chaining
  const passwordRef = useRef<TextInput>(null);
  const usernameRef = useRef<TextInput>(null);

  const isFocused = useIsFocused();

  // ── Animated title glow ──
  const titleGlow = useSharedValue(0);

  // ── Animated Submit Spinner ──
  const spinValue = useSharedValue(0);
  useEffect(() => {
    if (submitting && isFocused) {
      // Infinite loop instead of finite 20 repeats to handle long network requests, gated by useIsFocused
      spinValue.value = withRepeat(withTiming(1, { duration: 1500, easing: Easing.linear }), -1, false);
    } else {
      spinValue.value = 0;
    }
  }, [submitting, isFocused, spinValue]);

  const spinStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${spinValue.value * 360}deg` }]
  }));

  const checkingSpinValue = useSharedValue(0);
  useEffect(() => {
    if (usernameStatus === 'checking' && isFocused) {
      checkingSpinValue.value = withRepeat(withTiming(1, { duration: 1500, easing: Easing.linear }), -1, false);
    } else {
      checkingSpinValue.value = 0;
    }
  }, [usernameStatus, isFocused, checkingSpinValue]);

  const checkingSpinStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${checkingSpinValue.value * 360}deg` }]
  }));

  useEffect(() => {
    if (isFocused) {
      // Restore infinite cinematic glow gated by useIsFocused
      titleGlow.value = withRepeat(
        withTiming(1, { duration: 3000, easing: Easing.inOut(Easing.ease) }),
        -1,
        true
      );
    } else {
      titleGlow.value = 0; // Reset to baseline when off-screen
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isFocused]);
  const titleGlowStyle = useAnimatedStyle(() => ({
    // CONST-1: channels match base sepia (#B8891A = rgb(184,137,26))
    textShadowColor: `rgba(184, 137, 26, ${interpolate(titleGlow.value, [0, 1], [0.15, 0.55])})`,
    textShadowOffset: { width: 0, height: 0 },
    // 18 was the problem, not the glow. Past roughly 10 iOS stops rendering a
    // soft halo and starts painting a blocky rectangle behind the glyphs — the
    // bright box visible at the peak of the breath. 10 keeps the candlelight
    // and loses the artefact.
    textShadowRadius: interpolate(titleGlow.value, [0, 1], [4, 10]),
  }));

  // ── Field focus — the ledger line under the active field warms to brass ──
  const [focusedField, setFocusedField] = useState<'email' | 'username' | 'password' | null>(null);

  // IMP #1: Haptic feedback on input focus
  const onInputFocus = useCallback((field: 'email' | 'username' | 'password') => {
    TactileEngine.selection();
    setFocusedField(field);
  }, []);
  const onInputBlur = useCallback(() => {
    setFocusedField(null);
  }, []);

  // ── EMAIL CONFIRMATION SCREEN ──
  if (awaitingConfirmation) {
    return (
      <EmailConfirmationScreen
        confirmedEmail={confirmedEmail}
        resending={resending}
        onResend={handleResend}
        onClose={() => { setAwaitingConfirmation(false); nav.replace('/(tabs)'); }}
        resendCooldown={resendCooldown}
        onManualConfirm={handleManualConfirmationCheck}
        submitting={submitting}
      />
    );
  }

  return (
    // No paddingTop here any more. The pinned header is absolutely positioned
    // at top:0 — which is the container's PADDING box — and then adds
    // `paddingTop: insets.top` and `height: 56 + insets.top` of its own. With
    // the container also padding the inset it was counted twice, which is why
    // the close button sat so far down the screen.
    <View style={[s.container, { paddingBottom: insets.bottom }]}>
      <ToastOverlay />
      {/* ── Background & Atmospherics ── */}
      <AuthBackdrop />

      {/* ── Pinned Header / Close (0-Overlap) ── */}
      <BlurView intensity={80} tint="dark" style={[s.fixedHeader, { paddingTop: insets.top, height: 56 + insets.top }]}>
        <PressableScale
          style={s.closeBtn}
          onPress={() => {
            // Removed redundant nav.replace — typedRouter.back()
            // already falls back to /(tabs) if canGoBack() is false.
            nav.back();
          }}
          hitSlop={{ top: 15, right: 15, bottom: 15, left: 15 }}
          haptic="light"
          accessibilityLabel="Close login"
        >
          <X size={18} color={colors.bone} strokeWidth={2} />
        </PressableScale>
      </BlurView>

      {/* The header's lower edge was a hard line that content met and was cut
          by. Correct padding stops the guillotine; this makes the boundary a
          dissolve rather than an edge, so anything scrolling past it fades into
          the blur the way the safelight falls off in the Darkroom. Sits just
          below the header, non-interactive. */}
      <LinearGradient
        pointerEvents="none"
        colors={['rgba(10,9,6,0.85)', 'rgba(10,9,6,0)']}
        style={[s.headerFade, { top: 56 + insets.top }]}
      />

      {/* IMP #2: Native keyboard handling — no KeyboardAvoidingView jank */}
      <ScrollView
        style={{ flex: 1 }}
          // The header is `56 + insets.top` tall, not 56. The hardcoded 56+16
          // cleared a header that does not exist at that height, so on any
          // notched device the title was guillotined by roughly a full inset —
          // and because s.scroll centred its content, that slice was
          // unreachable rather than merely scrolled past.
          contentContainerStyle={[s.scroll, { paddingTop: 56 + insets.top + 16 }]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="interactive"
          automaticallyAdjustKeyboardInsets={true}
        >
          {/* ── Titles ── */}
          <AnimatedView entering={FadeInDown.duration(900).reduceMotion(ReduceMotion.Never)} style={s.header}>
          {/* The Society's mark — unframed, ignited by candlelight */}
          <View style={s.sealWrap}>
            <SocietySeal size={92} />
          </View>

          <SocietyEyebrow
            label={isLogin ? 'IDENTIFY YOURSELF' : 'REQUEST MEMBERSHIP'}
            style={s.eyebrowWrap}
          />

          {/* Capped for the same reason as the gate's masthead: a fixed
              lineHeight is a ceiling the font grows through, and uncapped the
              multiplier is unbounded. */}
          <AnimatedText {...displayTextProps} style={[s.title, titleGlowStyle]}>
            {isLogin ? 'Enter\nThe House' : 'Join\nThe Society'}
          </AnimatedText>

          <PulsingRule />

          <Text style={s.subtitle}>
            {isLogin
              ? 'The House remembers its own.'
              : 'Every great collection begins with a single frame.'}
          </Text>

          {/* The lore quote used to sit here, making six things a member had to
              pass before the first field. It is not cut — it moved to the
              footer, where it reads as the house signing off rather than as a
              fourth line of preamble. */}
        </AnimatedView>

        {/* ── Form ── */}
        <AnimatedView layout={LinearTransition.springify().mass(0.5).damping(14)} entering={FadeInDown.duration(700).delay(250).reduceMotion(ReduceMotion.Never)} style={s.formCard}>
          {/* Subtle top border glow */}
          <View style={s.formCardGlow} />
          {/* Archival registration marks in the card corners */}
          <RegistrationBrackets />

          {/* Email / Username */}
          <View style={s.fieldGroup}>
            <Text style={[s.inputLabel, focusedField === 'email' && s.inputLabelFocused]}>
              {isLogin ? 'EMAIL OR USERNAME' : 'EMAIL ADDRESS'}
            </Text>
            <View style={s.inputWrap}>
              <TextInput
                testID="email-input"
                style={[s.input, focusedField === 'email' && s.inputFocused, submitting && s.inputDisabled]}
                placeholder={isLogin ? 'patron@cinema.org' : 'your@email.com'}
                placeholderTextColor={colors.fog}
                value={emailOrUsername}
                onChangeText={(val) => setEmailOrUsername(val.trim().replace(/\s/g, ''))}
                onFocus={() => onInputFocus('email')}
                onBlur={onInputBlur}
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
                textContentType={isLogin ? 'username' : 'emailAddress'}
                autoComplete={isLogin ? 'username' : 'email'}
              />
            </View>
          </View>

          {/* Username (signup only) */}
          {!isLogin && (
            <AnimatedView entering={FadeInDown.duration(400)} style={s.fieldGroup}>
              <Text style={[s.inputLabel, focusedField === 'username' && s.inputLabelFocused]}>USERNAME / HANDLE</Text>
              <View style={s.inputWrap}>
                <Text style={s.inputPrefix}>@</Text>
                <TextInput
                  ref={usernameRef}
                  style={[s.input, { paddingLeft: 30, paddingRight: usernameStatus !== 'idle' ? 40 : 16 }, focusedField === 'username' && s.inputFocused, submitting && s.inputDisabled]}
                  placeholder="your_handle"
                  placeholderTextColor={colors.fog}
                  value={username}
                  onChangeText={(val) => {
                    const filtered = val.replace(/[^a-zA-Z0-9_]/g, '');
                    setUsername(filtered);
                    checkUsernameAvailability(filtered);
                  }}
                  onFocus={() => onInputFocus('username')}
                  onBlur={onInputBlur}
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
                    {usernameStatus === 'checking' && <AnimatedSparkles size={14} color={colors.fog} style={checkingSpinStyle} />}
                    {usernameStatus === 'available' && <Check size={14} color={colors.validation} strokeWidth={2.5} />}
                    {usernameStatus === 'taken' && <X size={14} color={colors.bloodReel} strokeWidth={2.5} />}
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
            <Text style={[s.inputLabel, focusedField === 'password' && s.inputLabelFocused]}>PASSWORD</Text>
            <View style={s.inputWrap}>
              <TextInput
                testID="password-input"
                ref={passwordRef}
                style={[s.input, { paddingRight: 60 }, focusedField === 'password' && s.inputFocused, submitting && s.inputDisabled]}
                placeholder="••••••••"
                placeholderTextColor={colors.fog}
                value={password}
                onChangeText={setPassword}
                onFocus={() => onInputFocus('password')}
                onBlur={onInputBlur}
                editable={!submitting}
                secureTextEntry={!showPassword}
                selectionColor={colors.sepia}
                returnKeyType="go"
                onSubmitEditing={handleLoginSubmit}
                // secureTextEntry suppresses auto-capitalisation only while it
                // is ON. The moment SHOW is pressed the field falls back to
                // React Native's default of 'sentences' and silently capitalises
                // the first character — a correct password, rejected, with no
                // way for the member to see why.
                autoCapitalize="none"
                autoCorrect={false}
                spellCheck={false}
                maxLength={128}
                keyboardAppearance="dark"
                accessibilityLabel="Password"
                textContentType={isLogin ? 'password' : 'newPassword'}
                autoComplete={isLogin ? 'password' : 'new-password'}
              />
              <PressableScale
                style={s.showBtn}
                onPress={() => { TactileEngine.navigate(); setShowPassword(!showPassword); }}
                hitSlop={{ top: 15, right: 15, bottom: 15, left: 15 }}
                pressedScale={0.92}
                accessibilityLabel={showPassword ? 'Hide password' : 'Show password'}
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
              accessibilityLabel="Forgot your credentials"
            >
              <Text style={s.forgotText}>Forgot your credentials?</Text>
            </PressableScale>
          )}

          {/* Submit */}
          <PressableScale
            testID="sign-in-submit"
            style={[s.submitBtn, (submitting || (!isLogin && usernameStatus === 'taken') || (isLogin && !canAttempt)) && s.submitDisabled]}
            onPress={handleLoginSubmit}
            disabled={submitting || (!isLogin && usernameStatus === 'taken') || (isLogin && !canAttempt)}
            hitSlop={{ top: 15, bottom: 15, left: 15, right: 15 }}
            pressedScale={0.97}
            accessibilityLabel={isLogin ? 'Sign in' : 'Request admission'}
          >
            {submitting ? (
              <View style={s.submitLoading}>
                <AnimatedSparkles size={16} color={colors.ink} style={spinStyle} />
                <Text style={s.submitText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>
                  {isLogin ? 'VERIFYING...' : 'PROCESSING APPLICATION...'}
                </Text>
              </View>
            ) : (
              <Text style={[s.submitText, (!isLogin && usernameStatus === 'taken') && { opacity: 0.5 }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>
                {isLogin ? (!canAttempt ? `✦  RETRY IN ${secondsRemaining}S` : '✦  IDENTIFY & ENTER') : '✦  REQUEST ADMISSION'}
              </Text>
            )}
          </PressableScale>
        </AnimatedView>

        {/* ── Toggle Login/Signup ── */}
        <AnimatedView entering={FadeInUp.duration(600).delay(450).reduceMotion(ReduceMotion.Never)} style={s.toggleWrap}>
          <PressableScale onPress={toggleMode} hitSlop={{ top: 15, bottom: 15, left: 15, right: 15 }} haptic="selection" accessibilityLabel={isLogin ? 'Switch to sign up' : 'Switch to sign in'}>
            <Text style={s.toggleText}>
              {isLogin ? 'No membership? ' : 'Already admitted? '}
              <Text style={s.toggleHighlight}>
                {isLogin ? 'Request admission' : 'Identify yourself'}
              </Text>
            </Text>
          </PressableScale>
        </AnimatedView>

        {/* Footer — founding mark + legal note */}
        <AnimatedView entering={FadeIn.duration(500).delay(700).reduceMotion(ReduceMotion.Never)} style={s.footerNote}>
          <Est1924 style={s.estMark} />
          {/* Relocated from above the form. Beneath the founding mark it reads
              as the house having the last word, which is what a lore fragment
              is for. */}
          <Text style={s.loreTransmission}>
            {/* eslint-disable-next-line react/no-unescaped-entities */}
            — "{loreQuote}"
          </Text>
          <Text style={s.footerText}>
            {/* eslint-disable-next-line react/no-unescaped-entities */}
            By continuing, you agree to The ReelHouse Society's{'\n'}Terms of Service & Privacy Policy
          </Text>
        </AnimatedView>
      </ScrollView>

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

// ── Styles imported from extracted module ──
// See src/theme/authStyles.ts for the full style definitions
