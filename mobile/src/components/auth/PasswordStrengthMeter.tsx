import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { colors, fonts } from '@/src/theme/theme';

export function getPasswordChecks(pw: string) {
  return {
    length:    pw.length >= 8,
    uppercase: /[A-Z]/.test(pw),
    lowercase: /[a-z]/.test(pw),
    number:    /[0-9]/.test(pw),
    special:   /[^A-Za-z0-9]/.test(pw),
  };
}

export type PwCheckKey = keyof ReturnType<typeof getPasswordChecks>;
export const PW_CHECK_LABELS: [PwCheckKey, string][] = [
  ['length', '8+ characters'],
  ['uppercase', 'Uppercase letter'],
  ['lowercase', 'Lowercase letter'],
  ['number', 'Number'],
  ['special', 'Special character'],
];

export function getStrengthInfo(passed: number) {
  // Brand tarnish ladder: blood → rust → brass → archive-approved green
  const labels = ['', 'WEAK', 'FAIR', 'FAIR', 'STRONG', 'VERY STRONG'];
  const clrs   = ['', colors.bloodReel, colors.rust, colors.rust, colors.sepia, colors.validation];
  return { label: labels[passed], color: clrs[passed] };
}

export function PasswordStrengthMeter({ password }: { password: string }) {
  if (password.length === 0) return null;

  const pwChecks = getPasswordChecks(password);
  const pwPassed = Object.values(pwChecks).filter(Boolean).length;
  const { label: pwStrengthLabel, color: pwStrengthColor } = getStrengthInfo(pwPassed);

  return (
    <Animated.View entering={FadeInDown.duration(300)} style={s.strengthWrap}>
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
            <Text style={[s.checkIcon, { color: pwChecks[key] ? colors.validation : colors.fog }]}>
              {pwChecks[key] ? '✓' : '○'}
            </Text>
            <Text style={[s.checkLabel, { color: pwChecks[key] ? colors.validation : colors.fog }]}>
              {label}
            </Text>
          </View>
        ))}
      </View>
    </Animated.View>
  );
}

const s = StyleSheet.create({
  strengthWrap: { gap: 10 },
  strengthBarRow: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  strengthSegment: { flex: 1, height: 3, borderRadius: 2 },
  strengthLabel: { fontFamily: fonts.sub, fontSize: 8, letterSpacing: 1.5, marginLeft: 8, minWidth: 80 },
  checksGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
  checkRow: { flexDirection: 'row', alignItems: 'center', gap: 4, width: '48%' as import('react-native').DimensionValue },
  checkIcon: { fontFamily: fonts.ui, fontSize: 11 },
  checkLabel: { fontFamily: fonts.ui, fontSize: 9, letterSpacing: 0.5 },
});
