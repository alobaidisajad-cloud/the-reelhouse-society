import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Text } from '@/src/components/text';
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

/**
 * Supabase Auth keeps a password as a bcrypt hash, and bcrypt reads only its
 * first 72 BYTES: past them a longer password is cut or refused, so the boxes
 * stop there and a password made of wider letters (Arabic, an emoji) is
 * measured in bytes, as the lock measures it.
 */
export const PASSWORD_MAX_BYTES = 72;
export const PASSWORD_TOO_LONG = `Too long for the lock: ${PASSWORD_MAX_BYTES} characters at most.`;

export function passwordBytes(pw: string): number {
  let n = 0;
  for (const ch of pw) {
    const cp = ch.codePointAt(0)!;
    n += cp < 0x80 ? 1 : cp < 0x800 ? 2 : cp < 0x10000 ? 3 : 4;
  }
  return n;
}

export const passwordFits = (pw: string) => passwordBytes(pw) <= PASSWORD_MAX_BYTES;

/** The one answer every screen asks before it sends a new password: every check met, and it fits the lock. */
export function passwordIsAccepted(pw: string): boolean {
  return Object.values(getPasswordChecks(pw)).every(Boolean) && passwordFits(pw);
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
  // Brand tarnish ladder: blood → rust → brass → archive-approved green.
  // `color` fills the BARS; `ink` prints the WORD. One value did both, so the
  // word read "WEAK" at 1.48:1 and "FAIR" at 2.46 — the pigments are for shapes.
  const labels = ['', 'WEAK', 'FAIR', 'FAIR', 'STRONG', 'VERY STRONG'];
  const clrs   = ['', colors.bloodReel, colors.rust, colors.rust, colors.sepia, colors.validation];
  const inks   = ['', colors.crimsonInk, colors.rustInk, colors.rustInk, colors.sepia, colors.validationInk];
  return { label: labels[passed], color: clrs[passed], ink: inks[passed] };
}

export function PasswordStrengthMeter({ password }: { password: string }) {
  if (password.length === 0) return null;

  const pwChecks = getPasswordChecks(password);
  const pwPassed = Object.values(pwChecks).filter(Boolean).length;
  const { label: pwStrengthLabel, color: pwStrengthColor, ink: pwStrengthInk } = getStrengthInfo(pwPassed);

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
        <Text style={[s.strengthLabel, { color: pwStrengthInk }]}>{pwStrengthLabel}</Text>
      </View>
      <View style={s.checksGrid}>
        {PW_CHECK_LABELS.map(([key, label]) => (
          // One element to a screen reader, said as a state: not "check mark, 8+ characters".
          <View key={key} style={s.checkRow} accessible accessibilityLabel={`${label}, ${pwChecks[key] ? 'met' : 'not yet'}`}>
            <Text style={[s.checkIcon, { color: pwChecks[key] ? colors.validation : colors.fog }]}>
              {pwChecks[key] ? '✓' : '○'}
            </Text>
            <Text style={[s.checkLabel, { color: pwChecks[key] ? colors.validationInk : colors.fog }]}>
              {label}
            </Text>
          </View>
        ))}
      </View>
      {!passwordFits(password) && (
        <Text style={[s.checkLabel, { color: colors.crimsonInk }]} accessibilityLiveRegion="polite">{PASSWORD_TOO_LONG}</Text>
      )}
    </Animated.View>
  );
}

const s = StyleSheet.create({
  strengthWrap: { gap: 10 },
  strengthBarRow: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  strengthSegment: { flex: 1, height: 3, borderRadius: 2 },
  strengthLabel: { fontFamily: fonts.sub, fontSize: 10, letterSpacing: 1, marginLeft: 8, minWidth: 80 },
  checksGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
  checkRow: { flexDirection: 'row', alignItems: 'center', gap: 4, width: '48%' as import('react-native').DimensionValue },
  checkIcon: { fontFamily: fonts.sub, fontSize: 11 },
  checkLabel: { fontFamily: fonts.sub, fontSize: 10, letterSpacing: 0.4 },
});
