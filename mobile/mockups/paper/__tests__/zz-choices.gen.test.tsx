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
