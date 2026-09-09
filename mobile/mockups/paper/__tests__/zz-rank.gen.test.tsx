/**
 * zz-rank.gen.test.tsx — making the Auteur read as HIGHER, not just as different.
 *
 * A GENERATOR, not a test. Run: npx jest zz-rank.gen
 *
 * ── THE DIAGNOSIS, MEASURED ─────────────────────────────────────────────────
 * The shipped pair differs in hue and in amounts nobody can see: a 0.5pt rim
 * against a 1pt one at eight-point type, and a wash of 0.06 against 0.09. On
 * luminance the Auteur is already ahead — 0.2339 to 0.1919 on the word — so the
 * problem is not that it is dimmer.
 *
 * The problem is that the two marks differ in DEGREE. Hue is a code, not a
 * rank: nothing in a crimson box says "more" than a brass one unless you have
 * been taught it. Two boxes of the same size, shape, tilt and construction, in
 * two colours, are two CATEGORIES — not a ladder.
 *
 * A gold star inside the crimson was drawn and REJECTED — the house does not
 * want two metals in one mark, and it would have made the Auteur a third colour
 * where every other rank is one.
 *
 * So the candidates below all make them differ in KIND.
 *
 * ── AND ONE DEFECT FOUND ON THE WAY ─────────────────────────────────────────
 * The Archivist's word is sepia at `opacity: 0.82`, which composites to 4.35:1
 * — under the 4.5 that eight-point type needs. The contrast guard tests the
 * COLOUR and not the opacity, so it reports a pass on something that fails.
 * Every candidate here drops that opacity, which raises it to 6.24:1.
 */
import React from 'react';
import { View, Text } from 'react-native';
import { render } from '@testing-library/react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { toHtml } from '../../../src/components/profile/__tests__/zz-render.lib';

import { p } from '@/src/components/dispatch/paper/paperStyles';
import { colors, fonts } from '@/src/theme/theme';
import { decorativeTextProps, scaledTextProps } from '@/src/constants/textScaling';

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn() }),
  useFocusEffect: () => {},
}));
jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(), notificationAsync: jest.fn(), selectionAsync: jest.fn(),
}));

const OUT = process.env.PAPER_OUT ?? join(__dirname, '..', 'rank');
const sheets: [string, React.ReactElement][] = [];
const add = (n: string, node: React.ReactElement) => sheets.push([n, node]);

const WORD = {
  fontFamily: fonts.sub, fontSize: 7.5, letterSpacing: 1.8, includeFontPadding: false,
} as const;
const BOX = {
  paddingHorizontal: 7, paddingVertical: 2.5,
  transform: [{ rotate: '-3deg' }], marginHorizontal: 1, flexShrink: 0,
} as const;
const FILL = { position: 'absolute' as const, left: 0, right: 0, top: 0, bottom: 0 };

/* ══ AS SHIPPED ═════════════════════════════════════════════════════════════ */
const ShippedAuteur = () => (
  <View style={[BOX, { borderWidth: 1, borderColor: colors.crimson }]}>
    <LinearGradient colors={[colors.stampCrimsonHead, colors.stampGround]}
      start={{ x: 0.5, y: 0 }} end={{ x: 0.5, y: 1 }} style={FILL} />
    <Text style={[WORD, { color: colors.crimsonInk }]} {...scaledTextProps}>★ AUTEUR</Text>
  </View>
);
const ShippedArchivist = () => (
  <View style={[BOX, { borderWidth: 0.5, borderColor: colors.sepiaBorderStrong }]}>
    <LinearGradient colors={[colors.stampBrassHead, colors.stampGround]}
      start={{ x: 0.5, y: 0 }} end={{ x: 0.5, y: 1 }} style={FILL} />
    <Text style={[WORD, { color: colors.sepia, opacity: 0.82 }]} {...scaledTextProps}>✦ ARCHIVIST</Text>
  </View>
);

/* ══ B · THE ARCHIVIST GOES PLAIN ═══════════════════════════════════════════
   The other half of the same idea, and the one that costs nothing: take the
   wash OFF the Archivist. A hairline and a word on the page's own ink — ink on
   paper — against a plate that is printed on something. Kind, not degree.

   The opacity goes with it, which is what lifts 4.35:1 to 6.24:1. */
const PlainArchivist = () => (
  <View style={[BOX, { borderWidth: 0.5, borderColor: colors.sepiaBorderStrong }]}>
    <Text style={[WORD, { color: colors.sepia }]} {...scaledTextProps}>✦ ARCHIVIST</Text>
  </View>
);

/* ══ C · THE DOUBLE RULE ════════════════════════════════════════════════════
   The printer's own way of saying "a higher grade of certificate": a second
   hairline set inside the first. No new colour — both rules are the rank's own
   crimson, the outer at full strength and the inner as the lighter of the two,
   which is how a real double rule is struck.

   It is also the answer to the width problem the measurement turned up. The
   Archivist's mark is 83.9pt against the Auteur's 67.1 — ARCHIVIST is simply a
   longer word — and size is the first thing the eye ranks. A frame gives the
   shorter mark visual MASS, which is the only way to outrank a wider box
   without making it wider still. */
const DoubleRuleAuteur = () => (
  <View style={{
    borderWidth: 1, borderColor: colors.crimson, padding: 1.5,
    transform: [{ rotate: '-3deg' }], marginHorizontal: 1, flexShrink: 0,
  }}>
    <View style={{ borderWidth: 0.5, borderColor: 'rgba(226,86,79,0.5)', paddingHorizontal: 6, paddingVertical: 2 }}>
      <LinearGradient colors={[colors.stampCrimsonHead, colors.stampGround]}
        start={{ x: 0.5, y: 0 }} end={{ x: 0.5, y: 1 }} style={FILL} />
      <Text style={[WORD, { color: colors.crimsonInk }]} {...scaledTextProps}>★ AUTEUR</Text>
    </View>
  </View>
);

const Note = ({ children, dim }: { children: React.ReactNode; dim?: boolean }) => (
  <Text style={{
    fontFamily: fonts.sub, fontSize: 8, letterSpacing: 1.6,
    color: dim ? colors.fog : colors.sepia, includeFontPadding: false, marginBottom: 9,
  }} {...decorativeTextProps}>{children}</Text>
);

const Pair = ({ A, B, who }: { A: () => React.ReactElement; B: () => React.ReactElement; who: string }) => (
  <>
    <View style={p.byline}>
      <View style={[p.avatar, p.avatarAuteur, { borderColor: colors.crimson }]}>
        <Text style={p.avatarMark} {...decorativeTextProps}>A</Text>
      </View>
      <Text style={[p.bylineName, { color: colors.crimsonInk, opacity: 1 }]}
        numberOfLines={1} {...scaledTextProps}>ANA</Text>
      <A />
      <Text style={p.bylineTrail} numberOfLines={1} {...scaledTextProps}>· 61 CRITIQUES</Text>
    </View>
    <View style={p.byline}>
      <View style={[p.avatar, p.avatarArchivist]}>
        <Text style={p.avatarMark} {...decorativeTextProps}>D</Text>
      </View>
      <Text style={p.bylineName} numberOfLines={1} {...scaledTextProps}>DAN</Text>
      <B />
      <Text style={p.bylineTrail} numberOfLines={1} {...scaledTextProps}>· 31 CRITIQUES</Text>
    </View>
    <Note dim>{who}</Note>
  </>
);

add('r1-the-four-ways', (
  <View style={[p.screen, { paddingHorizontal: 20, paddingTop: 34 }]}>
    <Note>NO GOLD. THE DOUBLE RULE AND THE PLAIN ARCHIVIST, ON THEIR OWN.</Note>

    <Pair A={ShippedAuteur} B={ShippedArchivist}
      who="AS SHIPPED — TWO BOXES, TWO COLOURS, ONE SIZE" />
    <View style={[p.hair, { marginTop: 6, marginBottom: 18 }]} />

    <Pair A={ShippedAuteur} B={PlainArchivist}
      who="B ALONE · THE ARCHIVIST GOES PLAIN" />
    <View style={[p.hair, { marginTop: 6, marginBottom: 18 }]} />

    <Pair A={DoubleRuleAuteur} B={ShippedArchivist}
      who="C ALONE · THE AUTEUR TAKES A DOUBLE RULE" />
    <View style={[p.hair, { marginTop: 6, marginBottom: 18 }]} />

    <Pair A={DoubleRuleAuteur} B={PlainArchivist}
      who="B + C TOGETHER — INK ON PAPER, AGAINST A FRAMED PLATE" />
  </View>
));

/* The pair alone tells you little. Side by side at four times the size is where
   a frame either earns its two points of padding or does not. */
add('r3-up-close', (
  <View style={[p.screen, { paddingHorizontal: 20, paddingTop: 40 }]}>
    <Note>THE TWO MARKS, ENLARGED</Note>
    <Note dim>AS SHIPPED</Note>
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 26 }}>
      <View style={{ transform: [{ scale: 3 }], marginHorizontal: 60, marginVertical: 18 }}>
        <ShippedAuteur />
      </View>
    </View>
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 30 }}>
      <View style={{ transform: [{ scale: 3 }], marginHorizontal: 66, marginVertical: 18 }}>
        <ShippedArchivist />
      </View>
    </View>

    <View style={[p.hair, { marginBottom: 22 }]} />
    <Note dim>B + C</Note>
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 26 }}>
      <View style={{ transform: [{ scale: 3 }], marginHorizontal: 60, marginVertical: 20 }}>
        <DoubleRuleAuteur />
      </View>
    </View>
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
      <View style={{ transform: [{ scale: 3 }], marginHorizontal: 66, marginVertical: 18 }}>
        <PlainArchivist />
      </View>
    </View>
  </View>
));

add('r2-a-column-of-rows', (
  <View style={[p.screen, { paddingHorizontal: 20, paddingTop: 34 }]}>
    <Note>B + C, TWELVE ROWS DEEP</Note>
    <Note dim>ONE AUTEUR IN TWELVE IS THE REAL RATIO. RARITY IS HALF OF WHAT MAKES A MARK READ AS AN HONOUR.</Note>
    {[['Ana', 1], ['Dan', 0], ['Sam', 2], ['Kit', 2], ['Noor', 2], ['Jun', 0],
    ['Iris', 2], ['Theo', 2], ['Mira', 1], ['Lena', 0], ['Otto', 2], ['Vera', 2]]
      .map(([who, k], i) => (
        <View key={who as string} style={p.byline}>
          <View style={[p.avatar,
            k === 1 ? [p.avatarAuteur, { borderColor: colors.crimson }]
              : k === 0 ? p.avatarArchivist : null]}>
            <Text style={p.avatarMark} {...decorativeTextProps}>{(who as string).slice(0, 1)}</Text>
          </View>
          <Text style={[p.bylineName, k === 1 && { color: colors.crimsonInk, opacity: 1 }]}
            numberOfLines={1} {...scaledTextProps}>{(who as string).toUpperCase()}</Text>
          {k === 1 ? <DoubleRuleAuteur /> : k === 0 ? <PlainArchivist /> : null}
          <Text style={p.bylineTrail} numberOfLines={1} {...scaledTextProps}>{`· ${(i + 2) * 13} CRITIQUES`}</Text>
        </View>
      ))}
  </View>
));

describe('rank hierarchy', () => {
  it('renders the candidates', () => {
    mkdirSync(OUT, { recursive: true });
    for (const [name, node] of sheets) {
      const { toJSON } = render(node);
      writeFileSync(join(OUT, `${name}.html`), toHtml(toJSON()), 'utf8');
    }
    expect(sheets.length).toBe(3);
  });
});
