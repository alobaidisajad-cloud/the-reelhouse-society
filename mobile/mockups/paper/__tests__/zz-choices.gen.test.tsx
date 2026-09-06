/**
 * zz-choices.gen.test.tsx — two choices, drawn: the Auteur mark, and the room a
 * dossier is written in.
 *
 * A GENERATOR, not a test. Run: npx jest zz-choices.gen
 *
 * ── WHY THE LAST SET WAS WRONG ──────────────────────────────────────────────
 * The first badge sketches were built on `bloodReel` — the palette's DEEP STAMP
 * red, a brown-leaning pigment kept for destructive acts. The Auteur's colour is
 * `crimson`, which the theme names outright: "Auteur crimson — the single bright
 * red for dark surfaces". So none of them were actually the Auteur's colour, and
 * a red chip is not this house's idiom anyway.
 *
 * Every mark below uses `crimson` (#B42D2D) for MARKS and `crimsonInk` (#E2564F)
 * for WORDS — the split the palette already made, because crimson as text
 * measured 2.49:1 on an Auteur's byline and crimsonInk clears 5.4:1.
 *
 * And they are drawn from the house's own vocabulary rather than from app
 * convention: the letterpress stamp it already tilts on a filing, the dashed
 * seal ring of the passport, the hairline rules that separate everything on the
 * page. A rounded filled pill is the one shape this app has never used.
 *
 * NOTHING HERE IS SHIPPED except where a plate says so. These are sketches.
 */
import React from 'react';
import { View, Text } from 'react-native';
import { render } from '@testing-library/react-native';
import Svg, { Circle, Text as SvgText } from 'react-native-svg';
import { LinearGradient } from 'expo-linear-gradient';
import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { toHtml } from '../../../src/components/profile/__tests__/zz-render.lib';

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn() }),
  useFocusEffect: () => {},
}));
jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(), notificationAsync: jest.fn(), selectionAsync: jest.fn(),
}));

import { RankBadge } from '@/src/components/RankBadge';
import { p } from '@/src/components/dispatch/paper/paperStyles';
import { colors, fonts } from '@/src/theme/theme';
import { decorativeTextProps, scaledTextProps, displayTextProps } from '@/src/constants/textScaling';

const OUT = process.env.PAPER_OUT ?? join(__dirname, '..', 'choices');

const sheets: Array<[string, React.ReactElement]> = [];
const add = (name: string, node: React.ReactElement) => sheets.push([name, node]);

/* Shared metrics. Only the MATERIAL changes between candidates. */
const TEXT = {
  fontFamily: fonts.sub, fontSize: 8, letterSpacing: 1, includeFontPadding: false,
} as const;

/* ═══════════════════════════════════════════════════════════════════════════
   THE SIX MARKS
   ═══════════════════════════════════════════════════════════════════════════ */

/** 1 · THE CENSOR STAMP — the house's own crimson plate, tilted.
 *  `stampCrimson` already exists for WITHHELD: a crimson hairline, a ten-percent
 *  wash, crimsonInk letters. It is the only crimson plate this app has ever
 *  drawn, so an Auteur wearing it is the house repeating itself, not inventing. */
const CensorStamp = () => (
  <View style={{
    borderWidth: 1, borderColor: colors.crimson, backgroundColor: colors.crimsonFaint,
    paddingHorizontal: 7, paddingVertical: 2, borderRadius: 1,
    transform: [{ rotate: '-2deg' }], flexShrink: 0,
  }}>
    <Text style={[TEXT, { color: colors.crimsonInk }]} numberOfLines={1} {...scaledTextProps}>★ AUTEUR</Text>
  </View>
);

/** 2 · THE RULE — no box at all. The word in crimsonInk over a crimson hairline,
 *  which is how every other thing on this page is separated. The quietest, and
 *  the only one that could sit on twenty consecutive rows without shouting. */
const Rule = () => (
  <View style={{ flexShrink: 0, alignItems: 'center' }}>
    <Text style={[TEXT, { color: colors.crimsonInk }]} numberOfLines={1} {...scaledTextProps}>★ AUTEUR</Text>
    <View style={{ height: 1, alignSelf: 'stretch', backgroundColor: colors.crimson, marginTop: 2 }} />
  </View>
);

/** 3 · THE SEAL — the passport's dashed ring, shrunk to byline height and turned
 *  crimson. No word: a seal is recognised, not read, and the word lives on the
 *  profile where somebody is actually reading about the member. */
const Seal = ({ size = 18 }: { size?: number }) => {
  const c = size / 2;
  return (
    <View style={{ width: size, height: size, flexShrink: 0, transform: [{ rotate: '-8deg' }] }}>
      <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        {/* FILLED, not outlined. The first draft drew the passport's dashed ring
            around an empty middle, and at eighteen points that is a dot — the
            star inside it was smaller than the gap between two dashes. Wax is a
            blob of colour with a die pressed into it, so the disc carries the
            colour and the star is struck OUT of it in parchment. */}
        <Circle cx={c} cy={c} r={c * 0.95} fill={colors.crimson} />
        <Circle cx={c} cy={c} r={c * 0.95} fill="none" stroke={colors.crimsonInk}
          strokeWidth={0.8} strokeDasharray="2.2 1.2" opacity={0.9} />
        <SvgText x={c} y={c * 1.44} textAnchor="middle" fontFamily={fonts.display}
          fontSize={size * 0.72} fill={colors.parchment}>★</SvgText>
      </Svg>
    </View>
  );
};

/** 4 · THE BRACKETED WORD — typographic, no fill, no box. Two crimson rules and
 *  the word between them, the way a newspaper sets a standing head. */
const Bracketed = () => (
  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, flexShrink: 0 }}>
    <View style={{ width: 6, height: 1, backgroundColor: colors.crimson }} />
    <Text style={[TEXT, { color: colors.crimsonInk }]} numberOfLines={1} {...scaledTextProps}>★ AUTEUR</Text>
    <View style={{ width: 6, height: 1, backgroundColor: colors.crimson }} />
  </View>
);

/** 5 · THE CRIMSON PLATE — the literal reading, in the RIGHT red this time.
 *  Solid `crimson` with parchment letters, measured 4.74:1. Bolder than the
 *  others and the only one that is a filled shape. */
const CrimsonPlate = () => (
  <View style={{
    backgroundColor: colors.crimson, paddingHorizontal: 7, paddingVertical: 2,
    borderRadius: 1, flexShrink: 0,
  }}>
    <Text style={[TEXT, { color: colors.parchment }]} numberOfLines={1} {...scaledTextProps}>★ AUTEUR</Text>
  </View>
);

/** 6 · THE MARGIN MARK — a crimson vertical rule against the word, echoing the
 *  kind rule that already runs down the left of every filing on this page. */
const MarginMark = () => (
  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, flexShrink: 0 }}>
    <View style={{ width: 2, alignSelf: 'stretch', minHeight: 11, backgroundColor: colors.crimson }} />
    <Text style={[TEXT, { color: colors.crimsonInk }]} numberOfLines={1} {...scaledTextProps}>★ AUTEUR</Text>
  </View>
);

const MARKS: Array<[string, string, () => React.ReactElement, string]> = [
  ['m1-censor-stamp', '1 · THE CENSOR STAMP', CensorStamp, 'the house’s own crimson plate, tilted · crimsonInk 5.4:1'],
  ['m2-the-rule', '2 · THE RULE', Rule, 'no box — a word over a hairline · crimsonInk 5.4:1'],
  ['m3-the-seal', '3 · THE SEAL', () => <Seal />, 'the passport’s ring, in crimson · no word to read'],
  ['m4-bracketed', '4 · THE BRACKETED WORD', Bracketed, 'a standing head · crimsonInk 5.4:1'],
  ['m5-crimson-plate', '5 · THE CRIMSON PLATE', CrimsonPlate, 'solid Auteur crimson, parchment letters · 4.74:1'],
  ['m6-margin-mark', '6 · THE MARGIN MARK', MarginMark, 'the kind rule, borrowed · crimsonInk 5.4:1'],
];

const Note = ({ children, dim }: { children: React.ReactNode; dim?: boolean }) => (
  <Text style={{
    fontFamily: fonts.sub, fontSize: 8, letterSpacing: 1.6,
    color: dim ? colors.fog : colors.sepia, includeFontPadding: false, marginBottom: 9,
  }} {...decorativeTextProps}>{children}</Text>
);

/** The real byline, with the Auteur's ring and name back in crimson. */
const Row = ({ Mark, name, trailing, plain }: {
  Mark?: () => React.ReactElement; name: string; trailing: string; plain?: boolean;
}) => (
  <View style={p.byline}>
    <View style={[p.avatar, plain ? null : [p.avatarAuteur, { borderColor: colors.crimson }]]}>
      <Text style={p.avatarMark} {...decorativeTextProps}>{name.slice(0, 1).toUpperCase()}</Text>
    </View>
    <Text style={[p.bylineName, !plain && { color: colors.crimsonInk, opacity: 1 }]}
      numberOfLines={1} {...scaledTextProps}>{name.toUpperCase()}</Text>
    {Mark ? <Mark /> : null}
    <Text style={p.bylineTrail} numberOfLines={1} {...scaledTextProps}>{`· ${trailing}`}</Text>
  </View>
);

for (const [slug, title, Mark, measured] of MARKS) {
  add(slug, (
    <View style={[p.screen, { paddingHorizontal: 20, paddingTop: 36 }]}>
      <Note>{title}</Note>
      <View style={{ alignItems: 'flex-start', marginBottom: 8 }}><Mark /></View>
      <Note dim>{measured}</Note>

      <View style={[p.hair, { marginTop: 16, marginBottom: 16 }]} />
      <Note dim>IN THE BYLINE</Note>
      <Row Mark={Mark} name="Ana" trailing="61 CRITIQUES" />

      <View style={[p.hair, { marginTop: 12, marginBottom: 16 }]} />
      <Note dim>THIRTY CHARACTERS, THE NARROWEST COLUMN</Note>
      <View style={{ width: 257 }}>
        <Row Mark={Mark} name="Katharine-Wentworth-Ashgrovely" trailing="12 MIN" />
      </View>

      <View style={[p.hair, { marginTop: 12, marginBottom: 16 }]} />
      <Note dim>A COLUMN OF ROWS — WHERE IT LANDS</Note>
      {[['Ana', 1], ['Dan', 0], ['Sam', 2], ['Mira', 1], ['Kit', 2], ['Jun', 0]].map(([who, kind], i) => (
        <View key={who as string} style={p.byline}>
          <View style={[p.avatar,
            kind === 1 ? [p.avatarAuteur, { borderColor: colors.crimson }]
              : kind === 0 ? p.avatarArchivist : null]}>
            <Text style={p.avatarMark} {...decorativeTextProps}>{(who as string).slice(0, 1)}</Text>
          </View>
          <Text style={[p.bylineName, kind === 1 && { color: colors.crimsonInk, opacity: 1 }]}
            numberOfLines={1} {...scaledTextProps}>{(who as string).toUpperCase()}</Text>
          {kind === 1 ? <Mark /> : kind === 0 ? <RankBadge rank="archivist" /> : null}
          <Text style={p.bylineTrail} numberOfLines={1} {...scaledTextProps}>{`· ${(i + 3) * 11} CRITIQUES`}</Text>
        </View>
      ))}
    </View>
  ));
}

/** All six together — the only comparison that decides a material. */
add('m0-all-six', (
  <View style={[p.screen, { paddingHorizontal: 20, paddingTop: 36 }]}>
    <Note>THE SIX, IN ONE EYELINE</Note>
    {MARKS.map(([slug, title, Mark, measured]) => (
      <View key={slug} style={{ marginBottom: 16 }}>
        <Note dim>{title}</Note>
        <Row Mark={Mark} name="Ana" trailing="61 CRITIQUES" />
      </View>
    ))}
    <View style={[p.hair, { marginTop: 4, marginBottom: 14 }]} />
    <Note dim>AND WHAT SHIPPED, FOR COMPARISON</Note>
    <View style={p.byline}>
      <View style={[p.avatar, p.avatarAuteur]}>
        <Text style={p.avatarMark} {...decorativeTextProps}>A</Text>
      </View>
      <Text style={[p.bylineName, p.bylineNameAuteur]} numberOfLines={1} {...scaledTextProps}>ANA</Text>
      <RankBadge rank="auteur" />
      <Text style={p.bylineTrail} numberOfLines={1} {...scaledTextProps}>· 61 CRITIQUES</Text>
    </View>
  </View>
));

/* ═══════════════════════════════════════════════════════════════════════════
   THE WRITING ROOM
   ───────────────────────────────────────────────────────────────────────────
   What exists today: a title, a body, and a rail with FILM, COVER and a word
   count. No bold, no italic, no pull quote, no drop cap, no section break, no
   way to set a still — while the READER already renders every one of those, and
   while the app's own `EditorialDesk` gives a film LOG a drop cap, a pull quote
   and a still picker.

   So a dossier — the long form, the thing an Auteur pays for — is written with
   fewer tools than a film log. These are four ways to close that, and they are
   not alternatives to each other so much as four different amounts of it.
   ═══════════════════════════════════════════════════════════════════════════ */

/** A tool on a rail: a mark and a word, the way the existing rail draws FILM. */
const Tool = ({ mark, label, on }: { mark: string; label: string; on?: boolean }) => (
  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, paddingVertical: 4 }}>
    <Text style={{
      fontFamily: fonts.display, fontSize: 12, lineHeight: 14,
      color: on ? colors.sepia : colors.bone, includeFontPadding: false,
    }} {...decorativeTextProps}>{mark}</Text>
    <Text style={[p.rl, on ? { color: colors.sepia } : null]} {...scaledTextProps}>{label}</Text>
  </View>
);

const Caret = () => <Text style={p.caret} {...decorativeTextProps}>|</Text>;

const DESK_BODY = {
  fontFamily: fonts.body, fontSize: 14.5, lineHeight: 24, color: colors.parchment,
} as const;

/** W1 · THE RAIL, FILLED — the smallest change that closes the gap. */
add('w1-the-rail-filled', (
  <View style={p.screen}>
    <View style={{ paddingHorizontal: 20, paddingTop: 34, paddingBottom: 10 }}>
      <Note>W1 · THE RAIL, FILLED</Note>
      <Note dim>THE SMALLEST CHANGE THAT CLOSES THE GAP — TOOLS THE READER ALREADY RENDERS</Note>
    </View>
    <View style={[p.deskDoc, { paddingTop: 16 }]}>
      <Text style={{ fontFamily: fonts.display, fontSize: 21, lineHeight: 27, color: colors.parchmentBright }}
        {...displayTextProps}>The Long Silence in Ozu</Text>
      <Text style={{ fontFamily: fonts.sub, fontSize: 8.5, letterSpacing: 1.6, color: colors.sepia, marginTop: 6 }}
        {...scaledTextProps}>PART II OF OZU, IN FOUR PARTS</Text>
      <View style={[p.hair, { marginTop: 12, marginBottom: 16 }]} />
      <Text style={DESK_BODY} {...scaledTextProps}>
        Ozu keeps the camera at the height of somebody kneeling, and he keeps it there after the room has emptied.<Caret />
      </Text>
    </View>
    <View style={[p.rail, { gap: 14, flexWrap: 'wrap' }]}>
      <Tool mark="B" label="BOLD" />
      <Tool mark="I" label="ITALIC" />
      <Tool mark="❝" label="QUOTE" />
      <Tool mark="§" label="BREAK" />
      <Tool mark="A" label="INITIAL" />
      <View style={{ flex: 1 }} />
      <Text style={p.rl} {...scaledTextProps}>1,240 WORDS · 6 MIN</Text>
    </View>
  </View>
));

/** W2 · THE MARGIN — tools as an editor's marks down the side, not a toolbar.
 *  The page already has a 44pt ordering margin; this is the same column, used. */
add('w2-the-margin', (
  <View style={p.screen}>
    <View style={{ paddingHorizontal: 20, paddingTop: 34, paddingBottom: 10 }}>
      <Note>W2 · THE MARGIN</Note>
      <Note dim>AN EDITOR'S MARKS DOWN THE SIDE — THE PAGE ALREADY HAS THIS COLUMN</Note>
    </View>
    <View style={{ flex: 1, flexDirection: 'row', marginHorizontal: 12, backgroundColor: 'rgba(8,6,4,0.98)',
      borderLeftWidth: 1.5, borderRightWidth: 1.5, borderColor: colors.sepiaBorder }}>
      <View style={{ width: 44, alignItems: 'center', paddingTop: 22, gap: 16,
        borderRightWidth: 1, borderRightColor: 'rgba(184,137,26,0.16)' }}>
        {['B', 'I', '❝', '§', 'A'].map((m) => (
          <Text key={m} style={{ fontFamily: fonts.display, fontSize: 13, color: colors.bone,
            includeFontPadding: false }} {...decorativeTextProps}>{m}</Text>
        ))}
      </View>
      <View style={{ flex: 1, minWidth: 0, paddingHorizontal: 18, paddingTop: 18 }}>
        <Text style={{ fontFamily: fonts.display, fontSize: 21, lineHeight: 27, color: colors.parchmentBright }}
          {...displayTextProps}>The Long Silence in Ozu</Text>
        <View style={[p.hair, { marginTop: 12, marginBottom: 14 }]} />
        <Text style={DESK_BODY} {...scaledTextProps}>
          Ozu keeps the camera at the height of somebody kneeling, and he keeps it there after the room has emptied.<Caret />
        </Text>
      </View>
    </View>
    <View style={p.rail}>
      <Tool mark="▣" label="FILM" />
      <Tool mark="▤" label="COVER" />
      <View style={{ flex: 1 }} />
      <Text style={p.rl} {...scaledTextProps}>1,240 WORDS · 6 MIN</Text>
    </View>
  </View>
));

/** W3 · THE RITUAL — the room announces itself before you write in it.
 *  A masthead, the date, the edition, and a rule; then the sheet. The point is
 *  that filing a dossier should not feel like opening a text box. */
add('w3-the-ritual', (
  <View style={p.screen}>
    <View style={{ paddingHorizontal: 20, paddingTop: 34, paddingBottom: 10 }}>
      <Note>W3 · THE RITUAL</Note>
      <Note dim>THE ROOM ANNOUNCES ITSELF — WRITING A DOSSIER IS NOT OPENING A TEXT BOX</Note>
    </View>
    <View style={[p.deskDoc, { paddingTop: 26 }]}>
      <View style={{ alignItems: 'center', marginBottom: 22 }}>
        <Text style={{ fontFamily: fonts.display, fontSize: 15, letterSpacing: 1.5, color: colors.sepia }}
          {...displayTextProps}>THE DISPATCH</Text>
        <View style={{ height: 1, alignSelf: 'stretch', backgroundColor: colors.sepia, opacity: 0.5, marginVertical: 7 }} />
        <Text style={{ fontFamily: fonts.sub, fontSize: 7.5, letterSpacing: 2.2, color: colors.fog }}
          {...decorativeTextProps}>THE WRITING ROOM · VOL. 103 · No. 240</Text>
        <Text style={{ fontFamily: fonts.sub, fontSize: 7.5, letterSpacing: 2.2, color: colors.fog, marginTop: 4 }}
          {...decorativeTextProps}>ANA · No. 17 · WEDNESDAY, 28 AUGUST</Text>
      </View>
      <View style={{ height: 1, backgroundColor: 'rgba(184,137,26,0.25)', marginBottom: 20 }} />
      <Text style={{ fontFamily: fonts.display, fontSize: 21, lineHeight: 27, color: colors.parchmentBright }}
        {...displayTextProps}>The Long Silence in Ozu</Text>
      <View style={[p.hair, { marginTop: 12, marginBottom: 16 }]} />
      <Text style={DESK_BODY} {...scaledTextProps}>
        Ozu keeps the camera at the height of somebody kneeling, and he keeps it there after the room has emptied.<Caret />
      </Text>
    </View>
    <View style={p.rail}>
      <Tool mark="B" label="BOLD" /><Tool mark="I" label="ITALIC" /><Tool mark="❝" label="QUOTE" />
      <View style={{ flex: 1 }} />
      <Text style={p.rl} {...scaledTextProps}>1,240 WORDS</Text>
    </View>
  </View>
));

/** W4 · WRITE AND READ — the preview IS the reader, side by side with the desk.
 *  Today the preview sets your essay in a different face at a different size to
 *  the page it will appear on, so it tells you nothing about how it will read. */
add('w4-write-and-read', (
  <View style={p.screen}>
    <View style={{ paddingHorizontal: 20, paddingTop: 34, paddingBottom: 10 }}>
      <Note>W4 · WRITE, THEN READ IT AS THE HOUSE WILL</Note>
      <Note dim>THE PREVIEW IS THE READER — SAME FACE, SAME SIZE, SAME LEADING</Note>
    </View>
    <View style={[p.deskDoc, { paddingTop: 16, flex: 0, height: 210 }]}>
      <Text style={{ fontFamily: fonts.sub, fontSize: 7.5, letterSpacing: 2.2, color: colors.sepia, marginBottom: 10 }}
        {...decorativeTextProps}>THE DESK</Text>
      <Text style={DESK_BODY} {...scaledTextProps}>
        Ozu keeps the camera at the height of somebody kneeling, and he keeps it there after the room has emptied.<Caret />
      </Text>
    </View>
    <View style={{ height: 14 }} />
    <View style={[p.deskDoc, { paddingTop: 16, flex: 1 }]}>
      <Text style={{ fontFamily: fonts.sub, fontSize: 7.5, letterSpacing: 2.2, color: colors.sepia, marginBottom: 12 }}
        {...decorativeTextProps}>AS IT WILL BE READ</Text>
      <Text style={{ fontFamily: fonts.display, fontSize: 21, lineHeight: 27, color: colors.parchmentBright }}
        {...displayTextProps}>The Long Silence in Ozu</Text>
      <View style={[p.hair, { marginTop: 10, marginBottom: 14 }]} />
      <Text style={{ fontFamily: fonts.serif, fontSize: 16.5, lineHeight: 28, color: colors.parchmentBright }}
        {...scaledTextProps}>
        <Text style={{ fontFamily: fonts.display, fontSize: 34, lineHeight: 28, color: colors.sepia }}>O</Text>
        zu keeps the camera at the height of somebody kneeling, and he keeps it there after the room has emptied.
      </Text>
    </View>
    <View style={p.rail}>
      <Tool mark="✎" label="DESK" on />
      <Tool mark="▤" label="READ" />
      <View style={{ flex: 1 }} />
      <Text style={p.rl} {...scaledTextProps}>1,240 WORDS · 6 MIN</Text>
    </View>
  </View>
));

/** W0 · TODAY — the real DossierDesk's shape, so the four have something to be
 *  compared against. Drawn here rather than mounted because the desk needs live
 *  handlers; the styles are the app's own. */
add('w0-today', (
  <View style={p.screen}>
    <View style={{ paddingHorizontal: 20, paddingTop: 34, paddingBottom: 10 }}>
      <Note>W0 · TODAY</Note>
      <Note dim>A TITLE, A BODY, AND A RAIL WITH FILM, COVER AND A WORD COUNT</Note>
    </View>
    <View style={[p.deskDoc, { paddingTop: 16 }]}>
      <Text style={{ fontFamily: fonts.display, fontSize: 21, lineHeight: 27, color: colors.parchmentBright }}
        {...displayTextProps}>The Long Silence in Ozu</Text>
      <Text style={{ fontFamily: fonts.sub, fontSize: 8.5, letterSpacing: 1.6, color: colors.sepia, marginTop: 6 }}
        {...scaledTextProps}>+ PART OF A SERIES</Text>
      <View style={[p.hair, { marginTop: 12, marginBottom: 16 }]} />
      <Text style={DESK_BODY} {...scaledTextProps}>
        Ozu keeps the camera at the height of somebody kneeling, and he keeps it there after the room has emptied.<Caret />
      </Text>
    </View>
    <View style={p.rail}>
      <Tool mark="▣" label="FILM" />
      <Tool mark="▤" label="COVER" />
      <View style={{ flex: 1 }} />
      <Text style={p.rl} {...scaledTextProps}>1,240 WORDS · 6 MIN</Text>
    </View>
  </View>
));

/* ═══════════════════════════════════════════════════════════════════════════
   THE RECOMMENDATION, IN ALL FOUR PLACES IT LIVES
   ───────────────────────────────────────────────────────────────────────────
   THE CRIMSON LACQUER PLATE. The house's own lit-plate construction — the four
   stops and the crown it already uses for brass — in the Auteur's own crimson,
   with parchment letters.

   Why this one, of the six:

   · It is the Auteur's ACTUAL colour, which is the whole complaint about the
     brass version.
   · It is the house's own premium material, not a new one. Brass is what the
     HOUSE is made of — the Concierge disc, the stamps, every rule. Crimson
     lacquer is the same construction in the colour that belongs to this rank.
   · It keeps the HIERARCHY right. The Archivist's mark is a flat brass wash;
     this one is a lit solid. Filled beats tinted at a glance, in any language.
     Every unfilled candidate — the rule, the brackets, the margin mark —
     inverts that: the lesser rank would carry the heavier shape.
   · It survives every context. A tinted word and a hairline depend on a paper
     ground to read as typography; on the home pulse card and in a search row
     they read as an underline or as a stray bar. A plate is a plate anywhere.
   · Parchment on crimson measures 4.74:1 at the ramp's LIGHTEST stop and
     improves as it darkens — so unlike gold, it clears the floor at every
     point of the gradient rather than only in the middle.

   And it is NOT the censor stamp, which was the closest rival: `stampCrimson`
   is what a WITHHELD filing wears, and dressing the house's highest rank in the
   costume of a censored post is the exact collision this whole exercise set out
   to remove.
   ═══════════════════════════════════════════════════════════════════════════ */
const CRIMSON_RAMP = [colors.crimson, '#A32828', '#8E2222', '#6E1A1A'] as const;
const CRIMSON_STOPS = [0, 0.34, 0.62, 1] as const;

const Lacquer = ({ scale = 1 }: { scale?: number }) => (
  <View style={{
    borderRadius: 2, paddingHorizontal: 7, paddingVertical: 2,
    overflow: 'hidden', flexShrink: 0,
    borderWidth: 0.5, borderColor: 'rgba(226,86,79,0.45)',
  }}>
    <LinearGradient colors={CRIMSON_RAMP} locations={CRIMSON_STOPS}
      start={{ x: 0.5, y: 0 }} end={{ x: 0.5, y: 1 }}
      style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 }} />
    <LinearGradient colors={['rgba(240,232,176,0.18)', 'rgba(240,232,176,0.05)', 'transparent']}
      style={{ position: 'absolute', left: 0, right: 0, top: 0, height: '48%' }} />
    <Text style={[TEXT, { fontSize: 8 * scale, color: colors.parchment }]}
      numberOfLines={1} {...decorativeTextProps}>★ AUTEUR</Text>
  </View>
);

/** The archive feed's ledger row, from its own measurements. */
const LedgerRow = ({ auteur }: { auteur?: boolean }) => (
  <View>
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingBottom: 10 }}>
      <View style={{
        width: 28, height: 28, borderRadius: 14, backgroundColor: colors.soot,
        alignItems: 'center', justifyContent: 'center', borderWidth: 1,
        borderColor: auteur ? colors.crimson : colors.sepiaBorder, overflow: 'hidden',
      }}>
        <Text style={{ fontFamily: fonts.display, fontSize: 12, color: colors.parchment,
          includeFontPadding: false }} {...decorativeTextProps}>{auteur ? 'A' : 'D'}</Text>
      </View>
      <Text style={{
        fontFamily: fonts.sub, fontSize: 11, letterSpacing: 1, includeFontPadding: false,
        color: auteur ? colors.crimsonInk : colors.sepia, flexShrink: 1,
      }} numberOfLines={1} {...scaledTextProps}>@{auteur ? 'ANA' : 'DAN'}</Text>
      {auteur ? <Lacquer /> : <RankBadge rank="archivist" />}
      <Text style={{ fontFamily: fonts.sub, fontSize: 8, letterSpacing: 1.5, color: colors.fog,
        marginLeft: 'auto', includeFontPadding: false }} {...scaledTextProps}>2H AGO</Text>
    </View>
    <LinearGradient
      colors={auteur ? ['rgba(180,45,45,0.55)', 'rgba(180,45,45,0.02)']
        : ['rgba(184,137,26,0.55)', 'rgba(184,137,26,0.02)']}
      start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={{ height: 1 }} />
  </View>
);

/** A search result row: name, subtitle, the mark under them. */
const SearchRow = ({ auteur }: { auteur?: boolean }) => (
  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 9 }}>
    <View style={{
      width: 34, height: 34, borderRadius: 17, backgroundColor: colors.soot,
      alignItems: 'center', justifyContent: 'center', borderWidth: 1,
      borderColor: auteur ? colors.crimson : colors.sepiaBorder,
    }}>
      <Text style={{ fontFamily: fonts.display, fontSize: 13, color: colors.parchment,
        includeFontPadding: false }} {...decorativeTextProps}>{auteur ? 'A' : 'D'}</Text>
    </View>
    <View style={{ flex: 1, minWidth: 0 }}>
      <Text style={{ fontFamily: fonts.body, fontSize: 13.5, color: colors.parchment }}
        numberOfLines={1} {...scaledTextProps}>{auteur ? 'ana' : 'dan'}</Text>
      <View style={{ alignSelf: 'flex-start', marginTop: 3 }}>
        {auteur ? <Lacquer /> : <RankBadge rank="archivist" />}
      </View>
    </View>
  </View>
);

add('f1-final-everywhere', (
  <View style={[p.screen, { paddingHorizontal: 20, paddingTop: 34 }]}>
    <Note>THE CRIMSON LACQUER PLATE — IN ALL FOUR PLACES IT LIVES</Note>

    <Note dim>1 · THE DISPATCH BYLINE</Note>
    <Row Mark={() => <Lacquer />} name="Ana" trailing="61 CRITIQUES" />
    <View style={p.byline}>
      <View style={[p.avatar, p.avatarArchivist]}>
        <Text style={p.avatarMark} {...decorativeTextProps}>D</Text>
      </View>
      <Text style={p.bylineName} numberOfLines={1} {...scaledTextProps}>DAN</Text>
      <RankBadge rank="archivist" />
      <Text style={p.bylineTrail} numberOfLines={1} {...scaledTextProps}>· 31 CRITIQUES</Text>
    </View>

    <View style={[p.hair, { marginTop: 16, marginBottom: 16 }]} />
    <Note dim>2 · THE ARCHIVE FEED — A LEDGER ROW AND ITS TIER RULE</Note>
    <LedgerRow auteur />
    <View style={{ height: 12 }} />
    <LedgerRow />

    <View style={[p.hair, { marginTop: 16, marginBottom: 16 }]} />
    <Note dim>3 · SEARCH</Note>
    <SearchRow auteur />
    <SearchRow />

    <View style={[p.hair, { marginTop: 16, marginBottom: 16 }]} />
    <Note dim>4 · AT THE LARGEST TEXT A MEMBER CAN SET</Note>
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
      <Lacquer scale={1.35} />
      <Text style={{ fontFamily: fonts.sub, fontSize: 8, letterSpacing: 1.4, color: colors.fog }}
        {...decorativeTextProps}>· PARCHMENT ON CRIMSON · 4.74:1 AT THE LIGHTEST STOP</Text>
    </View>
  </View>
));

add('f2-final-in-the-feed', (
  <View style={[p.screen, { paddingHorizontal: 20, paddingTop: 34 }]}>
    <Note>A COLUMN OF ROWS — THE ONLY TEST THAT MATTERS</Note>
    <Note dim>THE TOP RANK IS RARE, SO THE RED IS RARE. THAT IS WHAT MAKES IT READ AS AN HONOUR.</Note>
    {[
      ['Ana', 1], ['Dan', 0], ['Sam', 2], ['Kit', 2], ['Mira', 1],
      ['Jun', 0], ['Noor', 2], ['Iris', 2], ['Theo', 0], ['Lena', 2],
    ].map(([who, kind], i) => (
      <View key={who as string} style={p.byline}>
        <View style={[p.avatar,
          kind === 1 ? [p.avatarAuteur, { borderColor: colors.crimson }]
            : kind === 0 ? p.avatarArchivist : null]}>
          <Text style={p.avatarMark} {...decorativeTextProps}>{(who as string).slice(0, 1)}</Text>
        </View>
        <Text style={[p.bylineName, kind === 1 && { color: colors.crimsonInk, opacity: 1 }]}
          numberOfLines={1} {...scaledTextProps}>{(who as string).toUpperCase()}</Text>
        {kind === 1 ? <Lacquer /> : kind === 0 ? <RankBadge rank="archivist" /> : null}
        <Text style={p.bylineTrail} numberOfLines={1} {...scaledTextProps}>{`· ${(i + 2) * 13} CRITIQUES`}</Text>
      </View>
    ))}
    <View style={[p.hair, { marginTop: 16, marginBottom: 14 }]} />
    <Note dim>AND THE THIRTY-CHARACTER NAME, NARROWEST COLUMN</Note>
    <View style={{ width: 257 }}>
      <Row Mark={() => <Lacquer />} name="Katharine-Wentworth-Ashgrovely" trailing="12 MIN" />
    </View>
  </View>
));

/* ═══════════════════════════════════════════════════════════════════════════
   THE ONE THE APP ALREADY OWNS
   ───────────────────────────────────────────────────────────────────────────
   `profileStyles.tierStamp` — the rank, stamped on the corner of the print at a
   hand's angle. Tilted −3.5°, a near-black ground, a hairline border, 7.5pt
   caps tracked 1.8. Sepia for an Archivist, `tierStampRuby` turns the border and
   the word CRIMSON for an Auteur.

   Its own comment reads: "This is where rank lives now — the badge that used to
   hang under the avatar and the pill that sat beside the name were two labels
   for one fact." So the house has already chosen a rank mark, already chosen
   crimson for the Auteur, and the feed simply never got the memo.

   ONE CORRECTION to it, and only one: the profile paints the word in
   `colors.crimson`, which on that near-black ground measures 3.16:1 — over the
   app's 3:1 floor but under the 4.5 that 8pt type wants. `crimsonInk` exists in
   the palette for exactly this ("words that must be crimson use this, at
   5.4:1"), so the word takes it. Sepia on the same ground is already 6.24:1.
   ═══════════════════════════════════════════════════════════════════════════ */
const Stamped = ({ auteur, scale = 1 }: { auteur?: boolean; scale?: number }) => (
  <View style={{
    paddingHorizontal: 7, paddingVertical: 2.5,
    borderWidth: 1, borderColor: auteur ? colors.crimson : colors.sepia,
    backgroundColor: 'rgba(10,9,6,0.92)',
    transform: [{ rotate: '-3deg' }],
    // A rotated box is WIDER than the box layout reserved for it. Measured on
    // the page: an 18pt-tall plate at 3 degrees grows about half a point each
    // side, so a point of margin keeps its corners out of the name beside it.
    marginHorizontal: 1,
    flexShrink: 0,
  }}>
    <Text style={{
      fontFamily: fonts.sub, fontSize: 7.5 * scale, letterSpacing: 1.8,
      includeFontPadding: false, color: auteur ? colors.crimsonInk : colors.sepia,
    }} numberOfLines={1} {...decorativeTextProps}>{auteur ? '★ AUTEUR' : '✦ ARCHIVIST'}</Text>
  </View>
);

/** Both finalists, in a byline and then in a column. */
add('g1-stamp-vs-lacquer', (
  <View style={[p.screen, { paddingHorizontal: 20, paddingTop: 34 }]}>
    <Note>THE TWO FINALISTS</Note>

    <Note dim>A · THE HOUSE'S OWN RANK STAMP — ALREADY ON THE PROFILE</Note>
    <Row Mark={() => <Stamped auteur />} name="Ana" trailing="61 CRITIQUES" />
    <View style={p.byline}>
      <View style={[p.avatar, p.avatarArchivist]}>
        <Text style={p.avatarMark} {...decorativeTextProps}>D</Text>
      </View>
      <Text style={p.bylineName} numberOfLines={1} {...scaledTextProps}>DAN</Text>
      <Stamped />
      <Text style={p.bylineTrail} numberOfLines={1} {...scaledTextProps}>· 31 CRITIQUES</Text>
    </View>

    <View style={[p.hair, { marginTop: 18, marginBottom: 18 }]} />

    <Note dim>B · THE CRIMSON LACQUER PLATE</Note>
    <Row Mark={() => <Lacquer />} name="Ana" trailing="61 CRITIQUES" />
    <View style={p.byline}>
      <View style={[p.avatar, p.avatarArchivist]}>
        <Text style={p.avatarMark} {...decorativeTextProps}>D</Text>
      </View>
      <Text style={p.bylineName} numberOfLines={1} {...scaledTextProps}>DAN</Text>
      <RankBadge rank="archivist" />
      <Text style={p.bylineTrail} numberOfLines={1} {...scaledTextProps}>· 31 CRITIQUES</Text>
    </View>

    <View style={[p.hair, { marginTop: 18, marginBottom: 18 }]} />
    <Note dim>THE STAMP, TEN ROWS DEEP</Note>
    {[['Ana', 1], ['Dan', 0], ['Sam', 2], ['Kit', 2], ['Mira', 1], ['Jun', 0], ['Noor', 2]].map(([who, kind], i) => (
      <View key={who as string} style={p.byline}>
        <View style={[p.avatar,
          kind === 1 ? [p.avatarAuteur, { borderColor: colors.crimson }]
            : kind === 0 ? p.avatarArchivist : null]}>
          <Text style={p.avatarMark} {...decorativeTextProps}>{(who as string).slice(0, 1)}</Text>
        </View>
        <Text style={[p.bylineName, kind === 1 && { color: colors.crimsonInk, opacity: 1 }]}
          numberOfLines={1} {...scaledTextProps}>{(who as string).toUpperCase()}</Text>
        {kind === 1 ? <Stamped auteur /> : kind === 0 ? <Stamped /> : null}
        <Text style={p.bylineTrail} numberOfLines={1} {...scaledTextProps}>{`· ${(i + 2) * 13} CRITIQUES`}</Text>
      </View>
    ))}
  </View>
));

add('g2-stamp-everywhere', (
  <View style={[p.screen, { paddingHorizontal: 20, paddingTop: 34 }]}>
    <Note>THE RANK STAMP, IN EVERY PLACE IT LIVES</Note>

    <Note dim>1 · THE PROFILE — WHERE IT ALREADY IS</Note>
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 6 }}>
      <View style={{ width: 64, height: 78, backgroundColor: 'rgba(20,16,11,0.9)',
        borderWidth: 1, borderColor: 'rgba(232,223,208,0.22)', alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ fontFamily: fonts.display, fontSize: 26, color: colors.parchment }}
          {...decorativeTextProps}>A</Text>
      </View>
      <View style={{ marginLeft: -22, marginBottom: -34 }}><Stamped auteur /></View>
    </View>

    <View style={[p.hair, { marginTop: 16, marginBottom: 14 }]} />
    <Note dim>2 · THE DISPATCH BYLINE</Note>
    <Row Mark={() => <Stamped auteur />} name="Ana" trailing="61 CRITIQUES" />

    <View style={[p.hair, { marginTop: 12, marginBottom: 14 }]} />
    <Note dim>3 · THE ARCHIVE FEED</Note>
    <View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingBottom: 10 }}>
        <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: colors.soot,
          alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.crimson }}>
          <Text style={{ fontFamily: fonts.display, fontSize: 12, color: colors.parchment,
            includeFontPadding: false }} {...decorativeTextProps}>A</Text>
        </View>
        <Text style={{ fontFamily: fonts.sub, fontSize: 11, letterSpacing: 1, color: colors.crimsonInk,
          includeFontPadding: false, flexShrink: 1 }} numberOfLines={1} {...scaledTextProps}>@ANA</Text>
        <Stamped auteur />
        <Text style={{ fontFamily: fonts.sub, fontSize: 8, letterSpacing: 1.5, color: colors.fog,
          marginLeft: 'auto', includeFontPadding: false }} {...scaledTextProps}>2H AGO</Text>
      </View>
      <LinearGradient colors={['rgba(180,45,45,0.55)', 'rgba(180,45,45,0.02)']}
        start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={{ height: 1 }} />
    </View>

    <View style={[p.hair, { marginTop: 16, marginBottom: 14 }]} />
    <Note dim>4 · SEARCH  ·  5 · THE MEMBER REGISTRY</Note>
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8 }}>
      <View style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: colors.soot,
        alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.crimson }}>
        <Text style={{ fontFamily: fonts.display, fontSize: 13, color: colors.parchment,
          includeFontPadding: false }} {...decorativeTextProps}>A</Text>
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={{ fontFamily: fonts.body, fontSize: 13.5, color: colors.parchment }}
          numberOfLines={1} {...scaledTextProps}>ana</Text>
        <View style={{ alignSelf: 'flex-start', marginTop: 4 }}><Stamped auteur /></View>
      </View>
    </View>

    <View style={[p.hair, { marginTop: 14, marginBottom: 14 }]} />
    <Note dim>6 · AT THE LARGEST TEXT A MEMBER CAN SET</Note>
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
      <Stamped auteur scale={1.35} />
      <Stamped scale={1.35} />
    </View>
    <View style={{ height: 10 }} />
    <Note dim>CRIMSONINK 5.4:1 · SEPIA 6.24:1 · BOTH CLEAR AA</Note>
  </View>
));

/* ═══════════════════════════════════════════════════════════════════════════
   TWO REFINEMENTS, BECAUSE THE PLAIN STAMP INVERTS THE HIERARCHY
   ───────────────────────────────────────────────────────────────────────────
   Drawn side by side, the profile's stamp has one fault the profile can never
   show: it only ever draws ONE. In a feed the two ranks sit together, and a
   BRASS hairline is brighter than a crimson one on near-black — so the lesser
   rank reads louder than the greater. Rank hierarchy inverted by luminance.

   A′ — THE IMPRESSION. One construction, two strengths. The Auteur's stamp is
   struck at full pressure; the Archivist's is a lighter impression — a
   half-tone border and a dimmer word. That is what a lesser stamp IS in
   printing, so the hierarchy is carried by the medium rather than by a second
   shape.

   C — THE INKED STAMP. A′ plus texture: a whisper of the rank's own colour
   inside the box and a graded ground, so it reads as ink pressed into card
   rather than as an outline. The wash is 6% — far below the 10% `stampCrimson`
   uses for WITHHELD, so it never becomes that mark.
   ═══════════════════════════════════════════════════════════════════════════ */
const Impression = ({ auteur, scale = 1 }: { auteur?: boolean; scale?: number }) => (
  <View style={{
    paddingHorizontal: 7, paddingVertical: 2.5,
    borderWidth: auteur ? 1 : 0.5,
    borderColor: auteur ? colors.crimson : 'rgba(184,137,26,0.55)',
    backgroundColor: 'rgba(10,9,6,0.92)',
    transform: [{ rotate: '-3deg' }], marginHorizontal: 1, flexShrink: 0,
  }}>
    <Text style={{
      fontFamily: fonts.sub, fontSize: 7.5 * scale, letterSpacing: 1.8,
      includeFontPadding: false,
      color: auteur ? colors.crimsonInk : colors.sepia,
      opacity: auteur ? 1 : 0.78,
    }} numberOfLines={1} {...decorativeTextProps}>{auteur ? '★ AUTEUR' : '✦ ARCHIVIST'}</Text>
  </View>
);

const Inked = ({ auteur, scale = 1 }: { auteur?: boolean; scale?: number }) => (
  <View style={{
    paddingHorizontal: 7, paddingVertical: 2.5,
    borderWidth: auteur ? 1 : 0.5,
    borderColor: auteur ? colors.crimson : 'rgba(184,137,26,0.55)',
    overflow: 'hidden',
    transform: [{ rotate: '-3deg' }], marginHorizontal: 1, flexShrink: 0,
  }}>
    <LinearGradient
      colors={auteur
        ? ['rgba(180,45,45,0.16)', 'rgba(180,45,45,0.06)', 'rgba(10,9,6,0.96)']
        : ['rgba(184,137,26,0.10)', 'rgba(184,137,26,0.03)', 'rgba(10,9,6,0.96)']}
      start={{ x: 0.5, y: 0 }} end={{ x: 0.5, y: 1 }}
      style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 }} />
    <Text style={{
      fontFamily: fonts.sub, fontSize: 7.5 * scale, letterSpacing: 1.8,
      includeFontPadding: false,
      color: auteur ? colors.crimsonInk : colors.sepia,
      opacity: auteur ? 1 : 0.82,
    }} numberOfLines={1} {...decorativeTextProps}>{auteur ? '★ AUTEUR' : '✦ ARCHIVIST'}</Text>
  </View>
);

const pairRow = (Mark: (p: { auteur?: boolean }) => React.ReactElement, who: string, kind: number, n: number) => (
  <View key={who} style={p.byline}>
    <View style={[p.avatar,
      kind === 1 ? [p.avatarAuteur, { borderColor: colors.crimson }]
        : kind === 0 ? p.avatarArchivist : null]}>
      <Text style={p.avatarMark} {...decorativeTextProps}>{who.slice(0, 1)}</Text>
    </View>
    <Text style={[p.bylineName, kind === 1 && { color: colors.crimsonInk, opacity: 1 }]}
      numberOfLines={1} {...scaledTextProps}>{who.toUpperCase()}</Text>
    {kind === 1 ? <Mark auteur /> : kind === 0 ? <Mark /> : null}
    <Text style={p.bylineTrail} numberOfLines={1} {...scaledTextProps}>{`· ${n} CRITIQUES`}</Text>
  </View>
);

const CAST: Array<[string, number]> = [
  ['Ana', 1], ['Dan', 0], ['Sam', 2], ['Kit', 2], ['Mira', 1], ['Jun', 0], ['Noor', 2],
];

add('h1-refinements', (
  <View style={[p.screen, { paddingHorizontal: 20, paddingTop: 34 }]}>
    <Note>TWO REFINEMENTS — THE PLAIN STAMP LET THE LESSER RANK READ LOUDER</Note>

    <Note dim>A · THE PLAIN STAMP — BRASS OUTSHOUTS CRIMSON</Note>
    {CAST.slice(0, 4).map(([w, k], i) => pairRow(Stamped, w, k, (i + 2) * 13))}

    <View style={[p.hair, { marginTop: 16, marginBottom: 16 }]} />
    <Note dim>A′ · THE IMPRESSION — FULL PRESSURE, AND A LIGHTER ONE</Note>
    {CAST.map(([w, k], i) => pairRow(Impression, w, k, (i + 2) * 13))}

    <View style={[p.hair, { marginTop: 16, marginBottom: 16 }]} />
    <Note dim>C · THE INKED STAMP — THE SAME, WITH INK IN IT</Note>
    {CAST.map(([w, k], i) => pairRow(Inked, w, k, (i + 2) * 13))}
  </View>
));

add('h2-inked-everywhere', (
  <View style={[p.screen, { paddingHorizontal: 20, paddingTop: 34 }]}>
    <Note>THE INKED STAMP — EVERY PLACE A RANK IS DRAWN</Note>

    <Note dim>1 · THE DISPATCH BYLINE</Note>
    {CAST.slice(0, 3).map(([w, k], i) => pairRow(Inked, w, k, (i + 2) * 13))}

    <View style={[p.hair, { marginTop: 14, marginBottom: 14 }]} />
    <Note dim>2 · THE ARCHIVE FEED, WITH ITS TIER RULE</Note>
    <View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingBottom: 10 }}>
        <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: colors.soot,
          alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.crimson }}>
          <Text style={{ fontFamily: fonts.display, fontSize: 12, color: colors.parchment,
            includeFontPadding: false }} {...decorativeTextProps}>A</Text>
        </View>
        <Text style={{ fontFamily: fonts.sub, fontSize: 11, letterSpacing: 1, color: colors.crimsonInk,
          includeFontPadding: false, flexShrink: 1 }} numberOfLines={1} {...scaledTextProps}>@ANA</Text>
        <Inked auteur />
        <Text style={{ fontFamily: fonts.sub, fontSize: 8, letterSpacing: 1.5, color: colors.fog,
          marginLeft: 'auto', includeFontPadding: false }} {...scaledTextProps}>2H AGO</Text>
      </View>
      <LinearGradient colors={['rgba(180,45,45,0.55)', 'rgba(180,45,45,0.02)']}
        start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={{ height: 1 }} />
    </View>

    <View style={[p.hair, { marginTop: 16, marginBottom: 14 }]} />
    <Note dim>3 · SEARCH  ·  4 · THE MEMBER REGISTRY</Note>
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8 }}>
      <View style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: colors.soot,
        alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.crimson }}>
        <Text style={{ fontFamily: fonts.display, fontSize: 13, color: colors.parchment,
          includeFontPadding: false }} {...decorativeTextProps}>A</Text>
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={{ fontFamily: fonts.body, fontSize: 13.5, color: colors.parchment }}
          numberOfLines={1} {...scaledTextProps}>ana</Text>
        <View style={{ alignSelf: 'flex-start', marginTop: 4 }}><Inked auteur /></View>
      </View>
    </View>

    <View style={[p.hair, { marginTop: 14, marginBottom: 14 }]} />
    <Note dim>5 · THE PROFILE — WHERE IT ALREADY LIVES</Note>
    <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 4 }}>
      <View style={{ width: 60, height: 74, backgroundColor: 'rgba(20,16,11,0.9)',
        borderWidth: 1, borderColor: 'rgba(232,223,208,0.22)', alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ fontFamily: fonts.display, fontSize: 24, color: colors.parchment }}
          {...decorativeTextProps}>A</Text>
      </View>
      <View style={{ marginLeft: -26, marginBottom: 8 }}><Inked auteur /></View>
    </View>

    <View style={[p.hair, { marginTop: 16, marginBottom: 14 }]} />
    <Note dim>6 · THE LARGEST TEXT A MEMBER CAN SET</Note>
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
      <Inked auteur scale={1.35} /><Inked scale={1.35} />
    </View>
    <View style={{ height: 8 }} />
    <Note dim>CRIMSONINK 5.4:1 · SEPIA 6.24:1 · BOTH CLEAR AA</Note>
  </View>
));

describe('choices', () => {
  it('renders every candidate to html', () => {
    mkdirSync(OUT, { recursive: true });
    for (const [name, node] of sheets) {
      const { toJSON } = render(node);
      writeFileSync(join(OUT, `${name}.html`), toHtml(toJSON()), 'utf8');
    }
    expect(sheets.length).toBeGreaterThan(6);
  });
});
