/**
 * SmallPrint — what the stores require, said plainly, and the four doors out.
 *
 * Apple (guideline 3.1.2) requires, where a subscription is sold: what renews,
 * when, how to cancel, and working links to the Terms of Use and the Privacy
 * Policy. Restore is required too. None of it is decoration, so none of it is
 * set below 12pt, and every link is a full 44pt target.
 *
 * The wording names the store the member is actually in. An Android member told
 * to look in "App Store settings" has been given directions to someone else's
 * house.
 */
import { memo } from 'react';
import { View, Text, StyleSheet, Platform } from 'react-native';

import PressableScale from '@/src/components/PressableScale';
import { colors, fonts } from '@/src/theme/theme';
import { deckLabelProps, scaledTextProps } from '@/src/constants/textScaling';

export const STORE = Platform.OS === 'android'
  ? { name: 'Google Play', account: 'Google account', settings: 'Google Play settings' }
  : { name: 'the App Store', account: 'Apple ID', settings: 'App Store settings' };

export const SmallPrint = memo(function SmallPrint({
  restoring, busy, onRestore, onManage, onTerms, onPrivacy,
}: {
  restoring: boolean;
  busy: boolean;
  onRestore: () => void;
  onManage: () => void;
  onTerms: () => void;
  onPrivacy: () => void;
}) {
  const links: { key: string; label: string; spoken: string; role: 'button' | 'link'; onPress: () => void; disabled?: boolean }[] = [
    { key: 'restore', label: restoring ? 'Restoring…' : 'Restore purchases', spoken: restoring ? 'Restoring purchases' : 'Restore purchases', role: 'button', onPress: onRestore, disabled: restoring || busy },
    { key: 'manage', label: 'Manage subscription', spoken: `Manage subscription in ${STORE.name}`, role: 'button', onPress: onManage },
    { key: 'terms', label: 'Terms of Use', spoken: 'Terms of Use', role: 'link', onPress: onTerms },
    { key: 'privacy', label: 'Privacy Policy', spoken: 'Privacy Policy', role: 'link', onPress: onPrivacy },
  ];
  return (
    <View style={s.wrap}>
      <Text style={s.print} {...scaledTextProps}>
        Payment is charged to your {STORE.account} when you confirm. A subscription renews automatically at the same price unless you cancel at least 24 hours before the period ends. Manage or cancel it any time in your {STORE.settings}. The founding seat is one payment and never renews.
      </Text>
      <View style={s.links}>
        {links.map((l) => (
          <PressableScale
            key={l.key}
            style={s.link}
            onPress={l.onPress}
            disabled={l.disabled}
            haptic="light"
            pressedScale={0.97}
            hitSlop={null}
            accessibilityRole={l.role}
            accessibilityLabel={l.spoken}
            accessibilityState={{ disabled: !!l.disabled, busy: l.key === 'restore' && restoring }}
          >
            <Text style={s.linkText} {...deckLabelProps}>{l.label}</Text>
          </PressableScale>
        ))}
      </View>
      <Text style={s.signoff} {...scaledTextProps}>The Society thanks you for your attention.</Text>
    </View>
  );
});

const s = StyleSheet.create({
  wrap: { paddingHorizontal: 22, paddingTop: 34, alignItems: 'center' },
  print: { fontFamily: fonts.body, fontSize: 12, lineHeight: 18, color: colors.fog, textAlign: 'center' },
  links: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', columnGap: 20, marginTop: 8 },
  link: { minHeight: 44, justifyContent: 'center' },
  linkText: {
    fontFamily: fonts.sub, fontSize: 11, letterSpacing: 1.5, color: colors.bone,
    textDecorationLine: 'underline', includeFontPadding: false,
  },
  signoff: { fontFamily: fonts.display, fontSize: 15, lineHeight: 20, color: colors.bone, textAlign: 'center', marginTop: 14 },
});
