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
      {/* ── IT SCALES ────────────────────────────────────────────────────
          `scaledTextProps`, not `decorativeTextProps`. A rank is a LABEL a
          member reads, and freezing it small on a page where everything else
          grows is exactly the accessibility miss this app keeps catching.

          The first draft of this drawing used the decorative prop, so the
          plates showed a mark that never grew while the plan described one
          that did — the picture and the plan were two different products.
          With the real prop the converter stamps this element's own ceiling,
          so the type-size switch above moves it and the fit can be MEASURED
          rather than asserted. */}
      <Text style={{
        fontFamily: fonts.sub, fontSize: 7.5 * scale, letterSpacing: 1.8,
        includeFontPadding: false, color: a ? colors.crimsonInk : colors.sepia,
        opacity: a ? 1 : 0.82,
      }} numberOfLines={1} {...scaledTextProps}>
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
    {/* ── 6 · THE EVENTS ROW — RING AND NAME, AND DELIBERATELY NO MARK ────
        This row draws its actor inside ONE truncating sentence: the name is a
        nested Text inside "ANA  certified your filing". A stamp cannot go
        there — a View inside a Text is not something React Native lays out
        reliably — so the decision is forced rather than aesthetic.

        What it DOES take is the name colour every other surface gives an
        Auteur. It had the tier ring already and nothing else, which is how it
        would have quietly drifted: the ring would have turned crimson with the
        stylesheet and the name would have stayed parchment. */}
    <Note dim>6 · THE DISPATCH EVENTS — RING AND NAME, NO MARK (SEE WHY, IN THE FILE)</Note>
    {[1, 0, 2].map((k, i) => (
      <View key={k} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 6 }}>
        <Text style={{ fontFamily: fonts.sub, fontSize: 8.5, letterSpacing: 0.8, color: colors.sepia,
          width: 32, includeFontPadding: false }} {...decorativeTextProps}>{`0${9 + i}:14`}</Text>
        <View style={[p.avatar, ring(k)]}>
          <Text style={p.avatarMark} {...decorativeTextProps}>{['A', 'D', 'S'][i]}</Text>
        </View>
        <Text style={{ flex: 1, minWidth: 0, fontFamily: fonts.sub, fontSize: 8.5, letterSpacing: 1.2,
          color: colors.fog, includeFontPadding: false }} numberOfLines={1} {...scaledTextProps}>
          <Text style={{ color: k === 1 ? colors.crimsonInk : colors.parchment }}>
            {['ANA', 'DAN', 'SAM'][i]}
          </Text>
          {'  certified your filing'}
        </Text>
      </View>
    ))}

    <View style={[p.hair, { marginTop: 12, marginBottom: 14 }]} />
    <Note dim>7 · THE PROFILE — STAMPED ON THE CORNER OF THE PRINT</Note>
    <View style={{ flexDirection: 'row', alignItems: 'flex-end' }}>
      <View style={{ width: 62, height: 76, backgroundColor: 'rgba(20,16,11,0.9)', borderWidth: 1,
        borderColor: 'rgba(232,223,208,0.22)', alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ fontFamily: fonts.display, fontSize: 25, color: colors.parchment }}
          {...decorativeTextProps}>A</Text>
      </View>
      <View style={{ marginLeft: -28, marginBottom: 9 }}><Mark rank="auteur" /></View>
    </View>

    <View style={[p.hair, { marginTop: 16, marginBottom: 14 }]} />
    <Note dim>8 · THE LARGEST TEXT A MEMBER CAN SET</Note>
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
        {...displayTextProps}>A title for this essay</Text>
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

/* ══════════════════════════════════════════════════════════════════════════
   C · THE MEMBERSHIP CARD — THE PROMISE, DELETED RATHER THAN REWRITTEN
   ──────────────────────────────────────────────────────────────────────────
   The Auteur tier is sold with `Gold Foil "Auteur" Badge` in its feature list.
   Change the mark to crimson and that line is a lie on the paywall.
   Rewriting it to say "crimson" only moves the lie one colour along: the copy
   and the component would still be two places that have to agree, and the next
   person to retune the mark will not think to open the membership file.

   So the line is DELETED, and the card WEARS the mark instead. A card that
   shows the badge cannot promise the wrong one. The bullet was describing
   something the card can simply be.

   It sits under the tier's label, where the eye already lands on the way to the
   price — and the Cinephile card shows nothing there, which is the truest thing
   the layout can say about an unranked member.
   ══════════════════════════════════════════════════════════════════════════ */
const TierCard = ({ rank, name, label, price, period, features, cta }: {
  rank: 'auteur' | 'archivist' | null; name: string; label: string;
  price: string; period: string; features: string[]; cta: string;
}) => {
  const a = rank === 'auteur';
  return (
    <View style={{
      flex: 1, minWidth: 0, paddingHorizontal: 12, paddingTop: 16, paddingBottom: 14,
      borderWidth: 1, borderColor: a ? colors.crimsonBorder : 'rgba(184,137,26,0.35)',
      backgroundColor: a ? 'rgba(30,12,12,0.98)' : 'rgba(30,24,14,0.98)',
    }}>
      <Text style={{ fontFamily: fonts.display, fontSize: 15, lineHeight: 20, textAlign: 'center',
        color: a ? colors.crimsonInk : colors.parchment }} {...displayTextProps}>{name}</Text>
      <Text style={{ fontFamily: fonts.sub, fontSize: 7, letterSpacing: 1.8, textAlign: 'center',
        marginTop: 5, color: a ? colors.crimson : colors.sepia }} {...decorativeTextProps}>{label}</Text>

      {/* THE MARK, WORN NOT DESCRIBED. */}
      <View style={{ alignItems: 'center', marginTop: 10, minHeight: 22, justifyContent: 'center' }}>
        <Mark rank={rank} />
      </View>

      <View style={{ alignItems: 'center', marginTop: 12, marginBottom: 12 }}>
        <Text style={{ fontFamily: fonts.display, fontSize: 22, color: colors.parchmentBright }}
          {...displayTextProps}>{price}</Text>
        <Text style={{ fontFamily: fonts.sub, fontSize: 6.5, letterSpacing: 1.6, color: colors.fog,
          marginTop: 3 }} {...decorativeTextProps}>{period}</Text>
      </View>

      {features.map((f) => (
        <View key={f} style={{ flexDirection: 'row', gap: 6, marginBottom: 7 }}>
          <Text style={{ fontFamily: fonts.sub, fontSize: 7, lineHeight: 12,
            color: a ? colors.crimson : colors.sepia }} {...decorativeTextProps}>{a ? '★' : '·'}</Text>
          <Text style={{ fontFamily: fonts.sub, fontSize: 7.5, lineHeight: 12, letterSpacing: 0.4,
            color: colors.bone, flex: 1 }} {...scaledTextProps}>{f}</Text>
        </View>
      ))}

      <View style={{ flex: 1 }} />
      <View style={{ borderWidth: 1, borderColor: a ? colors.crimson : colors.sepia,
        paddingVertical: 7, alignItems: 'center', marginTop: 10 }}>
        <Text style={{ fontFamily: fonts.sub, fontSize: 7.5, letterSpacing: 1.6,
          color: a ? colors.crimsonInk : colors.sepia }} {...decorativeTextProps}>{cta}</Text>
      </View>
    </View>
  );
};

add('c1-the-membership-card', (
  <View style={[p.screen, { paddingHorizontal: 14, paddingTop: 34 }]}>
    <Note>THE CARD WEARS THE MARK — IT NO LONGER DESCRIBES IT</Note>
    <Note dim>THE `GOLD FOIL BADGE` LINE IS GONE. A CARD THAT SHOWS THE MARK CANNOT PROMISE THE WRONG ONE.</Note>
    <View style={{ flexDirection: 'row', gap: 10, flex: 1, marginTop: 6 }}>
      <TierCard rank="archivist" name={'The\nArchivist'} label="PREMIUM TOOLS" price="1.99" period="/ MO"
        cta="BECOME AN ARCHIVIST"
        features={['The Physical Archive', 'The Vault', 'The Gilded Frame', 'The Lounge']} />
      <TierCard rank="auteur" name="The Auteur" label="ULTIMATE PATRONAGE" price="4.99" period="/ MO"
        cta="BECOME AN AUTEUR"
        features={['Publish Essays to The Dispatch', 'Curatorial Control', 'Poster Glow Profile',
          'Early Access to New Features']} />
    </View>
  </View>
));

/* ══════════════════════════════════════════════════════════════════════════
   D · THE SERIES SHEET — THE ONE GENUINELY NEW PIECE
   ──────────────────────────────────────────────────────────────────────────
   A series is not a table. `series_id`, `series_title` and `part_number` are
   three columns on the filing itself, and the database already holds them
   together:

     CONSTRAINT series_whole CHECK (series_id IS NULL
       OR (series_title IS NOT NULL AND part_number IS NOT NULL
           AND kind = 'dossier'))

   So a series cannot be half-set, and cannot be set on anything but a dossier —
   the failure mode is a refused write, not a corrupt row. Nothing to migrate.

   The sheet therefore only has to do two things: let a member rejoin a series
   they have already begun, or begin one. Both come from a single query of their
   own dossiers grouped by series, so the list is always true.

   THE PART NUMBER IS SHOWN, NOT ASSUMED. `dispatch_posts_series` is an INDEX,
   not a unique constraint, so two parts CAN share a number — it would not be
   refused, it would just read "II, II" on the series page. The next number is
   filled in for you and left editable, which is the only way a member who is
   filing Part III after writing Part IV can say so.
   ══════════════════════════════════════════════════════════════════════════ */
const SeriesRow = ({ title, parts, next, chosen }: {
  title: string; parts: string; next: string; chosen?: boolean;
}) => (
  <View style={{
    flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 11,
    borderBottomWidth: 1, borderBottomColor: 'rgba(184,137,26,0.16)',
  }}>
    <Text style={{ fontFamily: fonts.sub, fontSize: 9, color: chosen ? colors.sepia : 'transparent',
      width: 12, includeFontPadding: false }} {...decorativeTextProps}>✦</Text>
    <View style={{ flex: 1, minWidth: 0 }}>
      <Text style={{ fontFamily: fonts.display, fontSize: 13, lineHeight: 17,
        color: chosen ? colors.parchmentBright : colors.parchment }}
        numberOfLines={1} {...displayTextProps}>{title}</Text>
      <Text style={{ fontFamily: fonts.sub, fontSize: 7, letterSpacing: 1.4, color: colors.fog,
        marginTop: 3, includeFontPadding: false }} {...decorativeTextProps}>{parts}</Text>
    </View>
    <Text style={{ fontFamily: fonts.sub, fontSize: 7.5, letterSpacing: 1.6, color: colors.sepia,
      includeFontPadding: false }} {...decorativeTextProps}>{next}</Text>
  </View>
);

add('d1-the-series-sheet', (
  <View style={[p.screen, { justifyContent: 'flex-end' }]}>
    <View style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0,
      backgroundColor: 'rgba(4,3,2,0.72)' }} />
    <View style={{ backgroundColor: 'rgba(8,6,4,0.99)', borderTopWidth: 1.5,
      borderTopColor: colors.sepiaBorder, paddingHorizontal: 20, paddingTop: 18, paddingBottom: 30 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        marginBottom: 4 }}>
        <Text style={{ fontFamily: fonts.sub, fontSize: 8.5, letterSpacing: 2, color: colors.bone }}
          {...decorativeTextProps}>PART OF A SERIES</Text>
        <Text style={{ fontFamily: fonts.sub, fontSize: 8.5, letterSpacing: 1.6, color: colors.fog }}
          {...decorativeTextProps}>NOT A SERIES</Text>
      </View>
      <Text style={{ fontFamily: fonts.body, fontSize: 11.5, lineHeight: 18, color: colors.fog,
        marginBottom: 14 }} {...scaledTextProps}>
        A series is read in order. Choose one you have begun, or begin one.
      </Text>

      <SeriesRow title="Ozu, in Four Parts" parts="THREE FILED · I, II, III" next="NEXT: IV" chosen />
      <SeriesRow title="The Long Take" parts="ONE FILED · I" next="NEXT: II" />
      <SeriesRow title="What the Wire Missed" parts="SIX FILED · I–VI" next="NEXT: VII" />

      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 13,
        borderBottomWidth: 1, borderBottomColor: 'rgba(184,137,26,0.16)' }}>
        <Text style={{ fontFamily: fonts.sub, fontSize: 9, color: colors.sepia, width: 12,
          includeFontPadding: false }} {...decorativeTextProps}>+</Text>
        <Text style={{ fontFamily: fonts.sub, fontSize: 9, letterSpacing: 1.6, color: colors.sepia }}
          {...scaledTextProps}>BEGIN A NEW SERIES</Text>
      </View>

      {/* The chosen series, and the number it will carry — filled in, and
          editable, because the member is the one who knows the order. */}
      <View style={{ marginTop: 16, borderWidth: 1, borderColor: 'rgba(184,137,26,0.30)',
        paddingHorizontal: 12, paddingVertical: 11 }}>
        <Text style={{ fontFamily: fonts.sub, fontSize: 7, letterSpacing: 1.8, color: colors.sepia,
          marginBottom: 6 }} {...decorativeTextProps}>THIS ESSAY WILL BE FILED AS</Text>
        <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8 }}>
          <Text style={{ fontFamily: fonts.display, fontSize: 15, color: colors.parchmentBright,
            flex: 1 }} numberOfLines={1} {...displayTextProps}>Ozu, in Four Parts</Text>
          <Text style={{ fontFamily: fonts.sub, fontSize: 8, letterSpacing: 1.6, color: colors.fog }}
            {...decorativeTextProps}>PART</Text>
          <Text style={{ fontFamily: fonts.display, fontSize: 17, color: colors.sepia }}
            {...displayTextProps}>IV</Text>
        </View>
      </View>

      <View style={{ borderWidth: 1, borderColor: colors.sepia, paddingVertical: 10,
        alignItems: 'center', marginTop: 14 }}>
        <Text style={{ fontFamily: fonts.sub, fontSize: 8.5, letterSpacing: 2, color: colors.sepia }}
          {...decorativeTextProps}>SET THE SERIES</Text>
      </View>
    </View>
  </View>
));

describe('final', () => {
  it('renders the final look', () => {
    mkdirSync(OUT, { recursive: true });
    for (const [name, node] of sheets) {
      const { toJSON } = render(node);
      writeFileSync(join(OUT, `${name}.html`), toHtml(toJSON()), 'utf8');
    }
    expect(sheets.length).toBe(7);
  });
});
