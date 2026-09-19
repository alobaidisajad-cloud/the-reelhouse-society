/**
 * FoundingCertificate — a seat for life, while seats remain.
 *
 * A certificate, so the house signs it with its own mark: the official logo,
 * lit the way the sign-in door lights it (SocietySeal), never a stand-in star.
 *
 * Every figure is the true one. The seat count is read from the database
 * (`is_founding`), the price from the store, and the pitch — "less than a single
 * year of the Auteur" — is made only when the prices on screen make it true
 * (societyPricing.foundingPitch). The certificate retires itself when the last
 * seat goes; a founder sees their own certificate instead.
 */
import { memo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

import PressableScale from '@/src/components/PressableScale';
import { SocietySeal } from '@/src/components/auth/SocietySeal';
import { colors, fonts } from '@/src/theme/theme';
import { deckLabelProps, displayTextProps, scaledTextProps } from '@/src/constants/textScaling';
import { UNSPOKEN } from '@/src/components/dispatch/paper/paperMetrics';
import { SEATS_LINE, type FoundingPitch } from './societyPricing';

export const FoundingCertificate = memo(function FoundingCertificate({
  founder, pitch, busy, onClaim,
}: {
  /** The member already holds a seat: the certificate is theirs, not for sale. */
  founder: boolean;
  pitch: FoundingPitch;
  busy: boolean;
  onClaim: () => void;
}) {
  return (
    <View style={s.cert}>
      <View style={s.frameDash} pointerEvents="none" />
      <View style={s.frameInner} pointerEvents="none" />
      <View style={s.seal} {...UNSPOKEN}><SocietySeal size={64} /></View>

      {founder ? (
        <View accessible accessibilityLabel="Founding member. Seat secured. You are one of the original hundred, and your Auteur rank is permanent.">
          <Text style={s.key} {...deckLabelProps}>FOUNDING MEMBER</Text>
          <Text style={s.title} {...displayTextProps}>Seat Secured.</Text>
          <Text style={s.body} {...scaledTextProps}>You are one of the original hundred. Your Auteur rank is permanent, and the ledger says so.</Text>
        </View>
      ) : (
        <>
          <View accessible accessibilityRole="header" accessibilityLabel={`Founding members. A seat for life. ${pitch.body} ${pitch.amount}, once. Limited to the first hundred members.`}>
            <Text style={s.key} {...deckLabelProps} {...UNSPOKEN}>FOUNDING MEMBERS</Text>
            <Text style={s.title} {...displayTextProps} {...UNSPOKEN}>A Seat for Life.</Text>
            <Text style={s.body} {...scaledTextProps} {...UNSPOKEN}>{pitch.body}</Text>
            <View style={s.priceRow} {...UNSPOKEN}>
              <Text style={s.amount} {...displayTextProps} maxFontSizeMultiplier={1.1} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6}>{pitch.amount}</Text>
              <Text style={s.once} {...deckLabelProps}>ONCE</Text>
            </View>
            <Text style={s.seats} {...deckLabelProps} {...UNSPOKEN}>{SEATS_LINE}</Text>
          </View>
          <PressableScale
            style={s.btn}
            disabled={busy}
            onPress={onClaim}
            haptic="medium"
            pressedScale={0.98}
            hitSlop={null}
            accessibilityRole="button"
            accessibilityLabel={busy ? 'Processing purchase' : `Claim a founding seat, ${pitch.amount} once`}
            accessibilityState={{ disabled: busy, busy }}
          >
            <LinearGradient colors={[colors.marqueeGold, colors.sepia]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFillObject} />
            <Text style={s.btnText} {...deckLabelProps}>{busy ? 'PROCESSING…' : 'CLAIM A FOUNDING SEAT'}</Text>
          </PressableScale>
        </>
      )}
    </View>
  );
});

const s = StyleSheet.create({
  cert: {
    marginHorizontal: 16, marginTop: 40,
    borderWidth: 1, borderColor: colors.sepiaBorderBold,
    backgroundColor: colors.frame,
    paddingHorizontal: 22, paddingTop: 26, paddingBottom: 22,
    alignItems: 'center',
  },
  // The certificate's printed border: a dashed rule and a hairline inside it.
  // A dashed border is drawn only when every side matches, so all four do.
  frameDash: { position: 'absolute', top: 5, left: 5, right: 5, bottom: 5, borderWidth: 1, borderStyle: 'dashed', borderColor: colors.sepiaBorder },
  frameInner: { position: 'absolute', top: 9, left: 9, right: 9, bottom: 9, borderWidth: 0.5, borderColor: colors.sepiaBorder },
  seal: { width: 64, height: 64, marginBottom: 6 },
  key: { fontFamily: fonts.sub, fontSize: 11, letterSpacing: 3, color: colors.sepia, textAlign: 'center', marginTop: 10, includeFontPadding: false },
  title: { fontFamily: fonts.display, fontSize: 32, lineHeight: 38, color: colors.silverScreen, textAlign: 'center', marginTop: 6 },
  body: { fontFamily: fonts.body, fontSize: 14, lineHeight: 21, color: colors.bone, textAlign: 'center', marginTop: 10 },
  priceRow: { flexDirection: 'row', justifyContent: 'center', alignItems: 'baseline', gap: 8, marginTop: 14 },
  amount: { fontFamily: fonts.display, fontSize: 44, lineHeight: 52, color: colors.marqueeGold, flexShrink: 1 },
  once: { fontFamily: fonts.sub, fontSize: 13, letterSpacing: 1.5, color: colors.bone, includeFontPadding: false },
  seats: { fontFamily: fonts.sub, fontSize: 12, letterSpacing: 1.5, color: colors.parchment, textAlign: 'center', marginTop: 10, includeFontPadding: false },
  btn: { alignSelf: 'stretch', minHeight: 52, marginTop: 18, alignItems: 'center', justifyContent: 'center', overflow: 'hidden', paddingHorizontal: 12 },
  btnText: { fontFamily: fonts.sub, fontSize: 13, letterSpacing: 2.5, color: colors.ink, includeFontPadding: false },
});
