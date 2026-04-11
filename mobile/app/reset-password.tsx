import { useState, useRef } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, ScrollView, Alert, ActivityIndicator,
} from 'react-native';
import Animated, {
  FadeInDown, FadeIn, useSharedValue, useAnimatedStyle,
  withTiming, withSequence, withRepeat, Easing, ReduceMotion,
} from 'react-native-reanimated';
import { supabase } from '@/src/lib/supabase';
import { useRouter } from 'expo-router';
import { colors, fonts, effects } from '@/src/theme/theme';

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

const CHECK_LABELS: Array<[keyof ReturnType<typeof getChecks>, string]> = [
  ['length', '8+ characters'],
  ['uppercase', 'Uppercase letter'],
  ['lowercase', 'Lowercase letter'],
  ['number', 'Number'],
  ['special', 'Special character'],
];

function getStrength(passed: number) {
  const labels = ['', 'WEAK', 'FAIR', 'FAIR', 'STRONG', 'VERY STRONG'];
  const clrs   = ['', colors.bloodReel, '#c4a000', '#c4a000', colors.sepia, '#4caf50'];
  return { label: labels[passed], color: clrs[passed] };
}

export default function ResetPasswordScreen() {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  const confirmRef = useRef<TextInput>(null);

  const checks = getChecks(password);
  const passed = Object.values(checks).filter(Boolean).length;
  const strong = passed === 5;
  const { label: strengthLabel, color: strengthColor } = getStrength(passed);

  const handleReset = async () => {
    if (!strong) {
      Alert.alert('Weak Password', 'Password does not meet security requirements.');
      return;
    }
    if (password !== confirm) {
      Alert.alert('Mismatch', 'Passwords do not match.');
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      setSuccess(true);

      // Re-trigger auth so the user gets properly logged in with new password
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        await supabase.auth.refreshSession();
      }

      // Navigate home after brief delay
      setTimeout(() => {
        router.replace('/(tabs)');
      }, 2500);
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to reset password.');
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

  // ── Main Form ──
  return (
    <KeyboardAvoidingView style={s.container} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        {/* Close / Back */}
        <TouchableOpacity
          style={s.backBtn}
          onPress={() => router.back()}
          hitSlop={{ top: 12, right: 12, bottom: 12, left: 12 }}
        >
          <Text style={s.backText}>← BACK TO LOBBY</Text>
        </TouchableOpacity>

        {/* Header */}
        <AnimatedView entering={FadeInDown.duration(800).reduceMotion(ReduceMotion.Never)} style={s.header}>
          <View style={s.iconWrap}>
            <Text style={s.iconEmoji}>🔒</Text>
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
                    <Text style={[s.checkIcon, { color: checks[key] ? '#4caf50' : colors.fog }]}>
                      {checks[key] ? '✓' : '○'}
                    </Text>
                    <Text style={[s.checkLabel, { color: checks[key] ? '#4caf50' : colors.fog }]}>
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
              />
            </View>
            {confirm.length > 0 && password !== confirm && (
              <Text style={s.mismatchText}>PASSWORDS DO NOT MATCH</Text>
            )}
          </View>

          {/* Submit */}
          <TouchableOpacity
            style={[s.submitBtn, (!strong || password !== confirm || loading) && s.submitDisabled]}
            onPress={handleReset}
            disabled={loading || !strong || password !== confirm}
            activeOpacity={0.7}
          >
            {loading ? (
              <View style={s.submitLoading}>
                <ActivityIndicator size="small" color={colors.ink} />
                <Text style={s.submitText}>RESETTING...</Text>
              </View>
            ) : (
              <Text style={s.submitText}>RESET PASSWORD</Text>
            )}
          </TouchableOpacity>
        </AnimatedView>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

// ══════════════════════════════════════════════════════════════
// STYLES — Nitrate Noir Reset Password
// ══════════════════════════════════════════════════════════════
const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.ink },
  scroll: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: 32, paddingBottom: 40, paddingTop: 60 },

  // Back
  backBtn: { position: 'absolute', top: 56, left: 0, zIndex: 10, padding: 8 },
  backText: { fontFamily: fonts.ui, fontSize: 9, letterSpacing: 1.5, color: colors.fog },

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
  iconEmoji: { fontSize: 24 },
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
  inputLabel: { fontFamily: fonts.ui, fontSize: 9, letterSpacing: 2.5, color: colors.fog, textTransform: 'uppercase' },
  inputWrap: { position: 'relative' },
  input: {
    backgroundColor: colors.soot, borderWidth: 1, borderColor: colors.ash,
    borderRadius: 3, padding: 14, paddingHorizontal: 16,
    fontSize: 14, fontFamily: fonts.body, color: colors.parchment,
  },
  showBtn: { position: 'absolute', right: 14, top: 0, bottom: 0, justifyContent: 'center' },
  showText: { fontFamily: fonts.uiMedium, fontSize: 9, letterSpacing: 1.5, color: colors.sepia },

  // Strength
  strengthWrap: { gap: 10 },
  strengthBarRow: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  strengthSegment: { flex: 1, height: 3, borderRadius: 2 },
  strengthLabel: { fontFamily: fonts.ui, fontSize: 8, letterSpacing: 1.5, marginLeft: 8, minWidth: 80 },
  checksGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
  checkRow: { flexDirection: 'row', alignItems: 'center', gap: 4, width: '48%' as any },
  checkIcon: { fontFamily: fonts.ui, fontSize: 11 },
  checkLabel: { fontFamily: fonts.ui, fontSize: 9, letterSpacing: 0.5 },

  // Mismatch
  mismatchText: { fontFamily: fonts.ui, fontSize: 9, letterSpacing: 1, color: colors.bloodReel, marginTop: 2 },

  // Submit
  submitBtn: {
    backgroundColor: colors.sepia, borderRadius: 3, paddingVertical: 16,
    alignItems: 'center', marginTop: 4,
    ...effects.glowSepia,
  },
  submitDisabled: { opacity: 0.4, shadowOpacity: 0 },
  submitText: { fontFamily: fonts.uiMedium, fontSize: 11, letterSpacing: 2.5, color: colors.ink, fontWeight: '700' },
  submitLoading: { flexDirection: 'row', alignItems: 'center', gap: 10 },

  // Success
  successWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  successContent: { alignItems: 'center' },
  successIconWrap: {
    width: 64, height: 64, borderRadius: 32,
    backgroundColor: 'rgba(76, 175, 80, 0.1)', borderWidth: 1, borderColor: '#4caf50',
    alignItems: 'center', justifyContent: 'center', marginBottom: 20,
  },
  successIcon: { fontSize: 28, color: '#4caf50', fontFamily: fonts.uiBold },
  successEyebrow: { fontFamily: fonts.ui, fontSize: 9, letterSpacing: 4, color: '#4caf50', marginBottom: 10 },
  successTitle: {
    fontFamily: fonts.display, fontSize: 26, color: colors.parchment,
    textAlign: 'center', lineHeight: 32, marginBottom: 16,
    ...effects.textShadowDeep,
  },
  successBody: { fontFamily: fonts.body, fontSize: 13, color: colors.bone, textAlign: 'center', lineHeight: 22, marginBottom: 20 },
  successRedirect: { fontFamily: fonts.ui, fontSize: 8, letterSpacing: 2, color: colors.fog },
});
