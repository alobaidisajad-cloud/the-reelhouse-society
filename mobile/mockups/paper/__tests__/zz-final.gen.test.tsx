/**
 * zz-final.gen.test.tsx — the final look. One design, no alternatives.
 *
 * A GENERATOR, not a test. Run: npx jest zz-final.gen
 *
 * ── THE MARK ────────────────────────────────────────────────────────────────
 * The house's own rank stamp — `profileStyles.tierStamp`, which already carries
 * the comment "this is where rank lives now" — corrected on the two faults the
 * profile could never reveal, because the profile only ever draws ONE:
 *
 *   1. IT INVERTED THE HIERARCHY. Both ranks sit together in a feed, and a
 *      brass hairline is brighter than a crimson one on near-black, so the
 *      lesser rank read louder. The Auteur is struck at full pressure now and
 *      the Archivist as a lighter impression — which is what a lesser stamp IS
 *      in printing. The medium carries the rank, not a second shape.
 *   2. ITS WORD FAILED CONTRAST. `colors.crimson` on that ground is 3.16:1 —
 *      over the app's 3:1 floor, under the 4.5 that 8pt type wants. `crimsonInk`
 *      exists for precisely this, at 5.4:1. Sepia is already 6.24:1.
 *
 * Plus the texture: six percent of the rank's own ink inside the box over a
 * graded ground, so it reads as a stamp pressed into card rather than an
 * outline. Six stays well under the ten `stampCrimson` uses for WITHHELD.
 *
 * ── IT IS THE SAME MARK IN EVERY PLACE ──────────────────────────────────────
 * One component, one construction, one size. The only thing that ever differs
 * is WHICH rank it says. Nothing gets a per-screen variant — that is what
 * produced three golds and four dresses in the first place.
 */
import React from 'react';
import { View, Text } from 'react-native';
import { render } from '@testing-library/react-native';
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

import { p } from '@/src/components/dispatch/paper/paperStyles';
import { colors, fonts } from '@/src/theme/theme';
import { decorativeTextProps, scaledTextProps, displayTextProps } from '@/src/constants/textScaling';

const OUT = process.env.PAPER_OUT ?? join(__dirname, '..', 'final');
const sheets: Array<[string, React.ReactElement]> = [];
const add = (n: string, node: React.ReactElement) => sheets.push([n, node]);

/* ══ THE MARK ═══════════════════════════════════════════════════════════════ */
const Mark = ({ rank, scale = 1 }: { rank: 'auteur' | 'archivist' | null; scale?: number }) => {
  if (!rank) return null;
  const a = rank === 'auteur';
  return (
    <View style={{
      paddingHorizontal: 7, paddingVertical: 2.5,
      borderWidth: a ? 1 : 0.5,
      borderColor: a ? colors.crimson : 'rgba(184,137,26,0.55)',
      /* ── NO RADIUS, AND THEREFORE NO CLIPPING ──────────────────────────
         A letterpress stamp has square corners, so there is no radius — and
         with no radius the absolutely-positioned gradient, pinned to all four
         edges of the padding box, already fills exactly the area it should.
         There is nothing left to clip, so `overflow: 'hidden'` comes off.

         That matters beyond tidiness: `overflow: hidden` combined with a
         `transform` is the one construction here that renders differently on
         Android, and there is no Android device to prove otherwise on. The
         safest fix was not to test around it but to stop needing it. */
      transform: [{ rotate: '-3deg' }],
      /* A rotated box PAINTS wider than the box layout reserved for it.
         Measured on the rendered page: 0.65–1.13pt across, so ~0.6pt a side,
         and it grows with the type. A point each side covers it to the 1.35
         ceiling with room left. */
      marginHorizontal: 1, flexShrink: 0,
    }}>
      <LinearGradient
        colors={a ? ['rgba(180,45,45,0.16)', 'rgba(180,45,45,0.06)', 'rgba(10,9,6,0.96)']
          : ['rgba(184,137,26,0.10)', 'rgba(184,137,26,0.03)', 'rgba(10,9,6,0.96)']}
        start={{ x: 0.5, y: 0 }} end={{ x: 0.5, y: 1 }}
        style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 }} />
      <Text style={{
        fontFamily: fonts.sub, fontSize: 7.5 * scale, letterSpacing: 1.8,
        includeFontPadding: false, color: a ? colors.crimsonInk : colors.sepia,
        opacity: a ? 1 : 0.82,
      }} numberOfLines={1} {...decorativeTextProps}>
        {a ? '★ AUTEUR' : '✦ ARCHIVIST'}
      </Text>
    </View>
  );
};

const Note = ({ children, dim }: { children: React.ReactNode; dim?: boolean }) => (
  <Text style={{
    fontFamily: fonts.sub, fontSize: 8, letterSpacing: 1.6,
    color: dim ? colors.fog : colors.sepia, includeFontPadding: false, marginBottom: 9,
  }} {...decorativeTextProps}>{children}</Text>
);

const ring = (k: number) => k === 1 ? [p.avatarAuteur, { borderColor: colors.crimson }]
  : k === 0 ? p.avatarArchivist : null;
const rankOf = (k: number) => k === 1 ? 'auteur' as const : k === 0 ? 'archivist' as const : null;

const Byline = ({ who, kind, trailing }: { who: string; kind: number; trailing: string }) => (
  <View style={p.byline}>
    <View style={[p.avatar, ring(kind)]}>
      <Text style={p.avatarMark} {...decorativeTextProps}>{who.slice(0, 1).toUpperCase()}</Text>
    </View>
    <Text style={[p.bylineName, kind === 1 && { color: colors.crimsonInk, opacity: 1 }]}
      numberOfLines={1} {...scaledTextProps}>{who.toUpperCase()}</Text>
    <Mark rank={rankOf(kind)} />
    <Text style={p.bylineTrail} numberOfLines={1} {...scaledTextProps}>{`· ${trailing}`}</Text>
  </View>
);

/* ══ 1 · THE MARK IN ALL NINE PLACES ════════════════════════════════════════ */
add('a1-the-mark-everywhere', (
  <View style={[p.screen, { paddingHorizontal: 20, paddingTop: 34 }]}>
    <Note>THE SAME MARK, EVERY PLACE A RANK IS DRAWN</Note>

    <Note dim>1 · THE DISPATCH BYLINE</Note>
    <Byline who="Ana" kind={1} trailing="61 CRITIQUES" />
    <Byline who="Dan" kind={0} trailing="31 CRITIQUES" />
    <Byline who="Sam" kind={2} trailing="12 CRITIQUES" />

    <View style={[p.hair, { marginTop: 14, marginBottom: 14 }]} />
    <Note dim>2 · THE ARCHIVE FEED — LEDGER ROW AND ITS TIER RULE</Note>
    {[1, 0].map((k) => (
      <View key={k} style={{ marginBottom: 10 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingBottom: 9 }}>
          <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: colors.soot,
            alignItems: 'center', justifyContent: 'center', borderWidth: 1,
            borderColor: k === 1 ? colors.crimson : colors.champagne }}>
            <Text style={{ fontFamily: fonts.display, fontSize: 12, color: colors.parchment,
              includeFontPadding: false }} {...decorativeTextProps}>{k === 1 ? 'A' : 'D'}</Text>
          </View>
          <Text style={{ fontFamily: fonts.sub, fontSize: 11, letterSpacing: 1, includeFontPadding: false,
            color: k === 1 ? colors.crimsonInk : colors.sepia, flexShrink: 1 }}
            numberOfLines={1} {...scaledTextProps}>@{k === 1 ? 'ANA' : 'DAN'}</Text>
          <Mark rank={rankOf(k)} />
          <Text style={{ fontFamily: fonts.sub, fontSize: 8, letterSpacing: 1.5, color: colors.fog,
            marginLeft: 'auto', includeFontPadding: false }} {...scaledTextProps}>2H AGO</Text>
        </View>
        <LinearGradient
          colors={k === 1 ? ['rgba(180,45,45,0.55)', 'rgba(180,45,45,0.02)']
            : ['rgba(184,137,26,0.55)', 'rgba(184,137,26,0.02)']}
          start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={{ height: 1 }} />
      </View>
    ))}

    <View style={[p.hair, { marginTop: 10, marginBottom: 14 }]} />
    <Note dim>3 · THE HOME PULSE  ·  4 · SEARCH  ·  5 · THE MEMBER REGISTRY</Note>
    {[1, 0].map((k) => (
      <View key={k} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 7 }}>
        <View style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: colors.soot,
          alignItems: 'center', justifyContent: 'center', borderWidth: 1,
          borderColor: k === 1 ? colors.crimson : colors.champagne }}>
          <Text style={{ fontFamily: fonts.display, fontSize: 13, color: colors.parchment,
            includeFontPadding: false }} {...decorativeTextProps}>{k === 1 ? 'A' : 'D'}</Text>
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={{ fontFamily: fonts.body, fontSize: 13.5, color: colors.parchment }}
            numberOfLines={1} {...scaledTextProps}>{k === 1 ? 'ana' : 'dan'}</Text>
          <View style={{ alignSelf: 'flex-start', marginTop: 4 }}><Mark rank={rankOf(k)} /></View>
        </View>
      </View>
    ))}

    <View style={[p.hair, { marginTop: 12, marginBottom: 14 }]} />
    <Note dim>6 · THE PROFILE — STAMPED ON THE CORNER OF THE PRINT</Note>
    <View style={{ flexDirection: 'row', alignItems: 'flex-end' }}>
      <View style={{ width: 62, height: 76, backgroundColor: 'rgba(20,16,11,0.9)', borderWidth: 1,
        borderColor: 'rgba(232,223,208,0.22)', alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ fontFamily: fonts.display, fontSize: 25, color: colors.parchment }}
          {...decorativeTextProps}>A</Text>
      </View>
      <View style={{ marginLeft: -28, marginBottom: 9 }}><Mark rank="auteur" /></View>
    </View>

    <View style={[p.hair, { marginTop: 16, marginBottom: 14 }]} />
    <Note dim>7 · THE LARGEST TEXT A MEMBER CAN SET</Note>
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
      <Mark rank="auteur" scale={1.35} /><Mark rank="archivist" scale={1.35} />
    </View>
    <View style={{ height: 10 }} />
    <Note dim>CRIMSONINK 5.4:1 · SEPIA 6.24:1 · BOTH CLEAR AA</Note>
  </View>
));

/* ══ 2 · A FEED, WHICH IS WHERE IT LANDS ════════════════════════════════════ */
add('a2-in-the-feed', (
  <View style={[p.screen, { paddingHorizontal: 20, paddingTop: 34 }]}>
    <Note>TWELVE ROWS — THE TOP RANK IS RARE, SO THE RED IS RARE</Note>
    {[['Ana', 1], ['Dan', 0], ['Sam', 2], ['Kit', 2], ['Noor', 2], ['Mira', 1],
    ['Jun', 0], ['Iris', 2], ['Theo', 2], ['Lena', 0], ['Otto', 2], ['Vera', 2]]
      .map(([w, k], i) => <Byline key={w as string} who={w as string} kind={k as number}
        trailing={`${(i + 2) * 13} CRITIQUES`} />)}
    <View style={[p.hair, { marginTop: 14, marginBottom: 14 }]} />
    <Note dim>THIRTY CHARACTERS, THE NARROWEST COLUMN — THE MARK NEVER SHRINKS</Note>
    <View style={{ width: 257 }}>
      <Byline who="Katharine-Wentworth-Ashgrovely" kind={1} trailing="12 MIN" />
    </View>
  </View>
));

/* ══════════════════════════════════════════════════════════════════════════
   THE WRITING ROOM
   ──────────────────────────────────────────────────────────────────────────
   The room is already well built — a proper header, a discard confirmation,
   a draft that survives the evening, a character fence that REFUSES rather than
   truncating. Four things are wrong, and only four:

     · six unlabelled icons. Bold and Italic read; Type, Quote, Minus and Link2
       do not say heading, block quote, section break, link.
     · the placeholder says "Use Markdown for formatting" — a wall to anyone who
       does not know what that is, and redundant to anyone who does. Press
       Heading and `##` appears in your text with no explanation.
     · the preview lies. Courier 15/24 in bone, where the page is Spectral
       16.5/28 in parchment with a raised initial.
     · a dossier cannot carry a film, a cover or a series, though the reader
       draws all three and the store already accepts every field.

   The fix is one idea: SEPARATE WHAT THE PIECE IS FROM HOW THE WORDS ARE SET.
   The sheet's head holds the title, the series and the film — what you are
   filing. The rail holds the text tools — how it reads. The foot holds the
   count. Three places, three jobs, nothing to learn.
   ══════════════════════════════════════════════════════════════════════════ */
const Tool = ({ glyph, label }: { glyph: string; label: string }) => (
  <View style={{ alignItems: 'center', gap: 3, minWidth: 42 }}>
    <Text style={{ fontFamily: fonts.display, fontSize: 13, lineHeight: 15, color: colors.bone,
      includeFontPadding: false }} {...decorativeTextProps}>{glyph}</Text>
    <Text style={{ fontFamily: fonts.sub, fontSize: 6.5, letterSpacing: 1.2, color: colors.fog,
      includeFontPadding: false }} {...decorativeTextProps}>{label}</Text>
  </View>
);

const Slot = ({ label, value, set }: { label: string; value?: string; set?: boolean }) => (
  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 5 }}>
    <Text style={{ fontFamily: fonts.sub, fontSize: 7, letterSpacing: 1.8, color: colors.sepia,
      width: 46, includeFontPadding: false }} {...decorativeTextProps}>{label}</Text>
    <Text style={{ fontFamily: fonts.sub, fontSize: 8.5, letterSpacing: 1.2,
      color: set ? colors.parchment : colors.fog, includeFontPadding: false, flex: 1 }}
      numberOfLines={1} {...scaledTextProps}>{value}</Text>
  </View>
);

const Head = () => (
  <View style={{ alignItems: 'center', paddingBottom: 14 }}>
    <Text style={{ fontFamily: fonts.display, fontSize: 14, letterSpacing: 1.4, color: colors.sepia }}
      {...displayTextProps}>THE DISPATCH</Text>
    <View style={{ height: 1, alignSelf: 'stretch', backgroundColor: colors.sepia, opacity: 0.45,
      marginTop: 7, marginBottom: 7 }} />
    <Text style={{ fontFamily: fonts.sub, fontSize: 7, letterSpacing: 2, color: colors.fog }}
      {...decorativeTextProps}>THE WRITING ROOM · ANA · No. 17 · 28 AUGUST</Text>
  </View>
);

const Rail = () => (
  <View style={[p.rail, { gap: 0, justifyContent: 'space-between', paddingVertical: 9 }]}>
    <Tool glyph="B" label="BOLD" />
    <Tool glyph="I" label="ITALIC" />
    <Tool glyph="H" label="HEADING" />
    <Tool glyph="❝" label="QUOTE" />
    <Tool glyph="§" label="BREAK" />
    <Tool glyph="⚯" label="LINK" />
  </View>
);

const Foot = () => (
  <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16,
    paddingVertical: 9, borderTopWidth: 1, borderTopColor: 'rgba(184,137,26,0.16)',
    backgroundColor: 'rgba(10,7,3,0.94)' }}>
    <Text style={p.rl} {...scaledTextProps}>1,240 WORDS · 6 MIN</Text>
    <View style={{ flex: 1 }} />
    <Text style={[p.rl, { color: colors.fog }]} {...scaledTextProps}>DRAFT SAVED</Text>
  </View>
);

const Header = ({ right }: { right: string }) => (
  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingTop: 52, paddingBottom: 12 }}>
    <Text style={{ fontFamily: fonts.sub, fontSize: 8.5, letterSpacing: 1.6, color: colors.fog }}
      {...decorativeTextProps}>CANCEL</Text>
    <Text style={{ fontFamily: fonts.sub, fontSize: 8.5, letterSpacing: 2, color: colors.bone }}
      {...decorativeTextProps}>THE WRITING ROOM</Text>
    <Text style={{ fontFamily: fonts.sub, fontSize: 8.5, letterSpacing: 1.6, color: colors.sepia }}
      {...decorativeTextProps}>{right}</Text>
  </View>
);

/* R1 — the room as it opens. The blank page is the hard part, so the sheet
   arrives already addressed: the house, the edition, and your own name on it. */
add('b1-the-room-opens', (
  <View style={p.screen}>
    <Header right="PREVIEW" />
    <View style={[p.deskDoc, { paddingTop: 20 }]}>
      <Head />
      <Text style={{ fontFamily: fonts.display, fontSize: 21, lineHeight: 27, color: colors.fog }}
        {...displayTextProps}>A title for this dossier</Text>
      <View style={{ marginTop: 10, marginBottom: 4 }}>
        <Slot label="FILM" value="Name the film this is about" />
        <Slot label="SERIES" value="Part of a series?" />
        <Slot label="COVER" value="Choose a still" />
      </View>
      <View style={[p.hair, { marginTop: 10, marginBottom: 16 }]} />
      <Text style={{ fontFamily: fonts.body, fontSize: 14.5, lineHeight: 24, color: colors.ash }}
        {...scaledTextProps}>Begin. The house is listening.</Text>
    </View>
    <Rail />
    <Foot />
  </View>
));

/* R2 — mid-sentence, everything set. */
add('b2-the-room-at-work', (
  <View style={p.screen}>
    <Header right="PREVIEW" />
    <View style={[p.deskDoc, { paddingTop: 20 }]}>
      <Head />
      <Text style={{ fontFamily: fonts.display, fontSize: 21, lineHeight: 27, color: colors.parchmentBright }}
        {...displayTextProps}>The Long Silence in Ozu</Text>
      <View style={{ marginTop: 10, marginBottom: 4 }}>
        <Slot label="FILM" value="TOKYO STORY · 1953" set />
        <Slot label="SERIES" value="OZU, IN FOUR PARTS · II" set />
        <Slot label="COVER" value="SET" set />
      </View>
      <View style={[p.hair, { marginTop: 10, marginBottom: 16 }]} />
      <Text style={{ fontFamily: fonts.body, fontSize: 14.5, lineHeight: 24, color: colors.parchment }}
        {...scaledTextProps}>
        Ozu keeps the camera at the height of somebody kneeling, and he keeps it there after the room has emptied.<Text style={p.caret} {...decorativeTextProps}>|</Text>
      </Text>
    </View>
    <Rail />
    <Foot />
  </View>
));

/* R3 — the preview IS the reader. Same face, same size, same leading, same
   raised initial. What you see is the page. */
add('b3-the-preview-is-the-reader', (
  <View style={p.screen}>
    <Header right="EDIT" />
    <View style={[p.deskDoc, { paddingTop: 20 }]}>
      <Text style={{ fontFamily: fonts.sub, fontSize: 7, letterSpacing: 2, color: colors.sepia,
        marginBottom: 14 }} {...decorativeTextProps}>AS THE HOUSE WILL SET IT</Text>
      <Text style={{ fontFamily: fonts.display, fontSize: 21, lineHeight: 27, color: colors.parchmentBright }}
        {...displayTextProps}>The Long Silence in Ozu</Text>
      <Text style={{ fontFamily: fonts.sub, fontSize: 8, letterSpacing: 1.6, color: colors.sepia,
        marginTop: 7 }} {...scaledTextProps}>PART II OF OZU, IN FOUR PARTS</Text>
      <View style={{ marginTop: 10, marginBottom: 4 }}>
        <Byline who="Ana" kind={1} trailing="6 MIN" />
      </View>
      <View style={[p.hair, { marginTop: 4, marginBottom: 16 }]} />
      <Text style={{ fontFamily: fonts.serif, fontSize: 16.5, lineHeight: 28, color: colors.parchmentBright }}
        {...scaledTextProps}>
        <Text style={{ fontFamily: fonts.display, fontSize: 34, lineHeight: 28, color: colors.sepia }}>O</Text>
        zu keeps the camera at the height of somebody kneeling, and he keeps it there after the room has emptied.
      </Text>
      <Text style={{ fontFamily: fonts.sub, fontSize: 11, letterSpacing: 1.8, color: colors.sepia,
        marginTop: 24, marginBottom: 2 }} {...scaledTextProps}>THE THREE REFUSALS</Text>
      <Text style={{ fontFamily: fonts.serif, fontSize: 16.5, lineHeight: 28, color: colors.parchmentBright }}
        {...scaledTextProps}>
        He will not move it, he will not cut early, and he will not tell you what to feel.
      </Text>
    </View>
    <Foot />
  </View>
));

describe('final', () => {
  it('renders the final look', () => {
    mkdirSync(OUT, { recursive: true });
    for (const [name, node] of sheets) {
      const { toJSON } = render(node);
      writeFileSync(join(OUT, `${name}.html`), toHtml(toJSON()), 'utf8');
    }
    expect(sheets.length).toBe(5);
  });
});
