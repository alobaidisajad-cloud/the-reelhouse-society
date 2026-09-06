/**
 * zz-badge.gen.test.tsx — the Auteur badge, four ways.
 *
 * A GENERATOR, not a test. Run: npx jest zz-badge.gen
 *
 * ONE of these is the app. `A` mounts the real `RankBadge` that shipped in
 * 3b9e279 — brass ramp, ink lettering. The other three are SKETCHES drawn in
 * this file, so nothing here can be mistaken for a record of what exists.
 *
 * Every candidate is drawn three times, because a badge is judged in a row and
 * not on a slab:
 *   1. large, alone, so the material can be seen;
 *   2. in the REAL byline — `p.byline` and `p.bylineName` imported from the
 *      app's own stylesheet, with the real avatar disc beside it;
 *   3. in the narrowest column at the largest text, which is where a badge
 *      stops fitting.
 *
 * The contrast figure under each is measured, not asserted: `theRankBadgeIsReadable`
 * computes them from the same tokens, and 4.5 is the floor for type this small.
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

import { RankBadge } from '@/src/components/RankBadge';
import { p } from '@/src/components/dispatch/paper/paperStyles';
import { colors, fonts } from '@/src/theme/theme';
import { BRASS, BRASS_STOPS, BRASS_WIDE_START, BRASS_WIDE_END, CROWN, CROWN_HEIGHT, RIM } from '@/src/theme/brass';
import { decorativeTextProps, scaledTextProps } from '@/src/constants/textScaling';

const OUT = process.env.PAPER_OUT ?? join(__dirname, '..', 'badge');

const sheets: Array<[string, React.ReactElement]> = [];
const add = (name: string, node: React.ReactElement) => sheets.push([name, node]);

/* ── The badge's shared metrics. Every candidate uses these, so what is being
      compared is the MATERIAL and nothing else. ─────────────────────────── */
const TEXT = {
  fontFamily: fonts.sub, fontSize: 8, letterSpacing: 1, includeFontPadding: false,
} as const;
const BOX = { borderRadius: 2, paddingHorizontal: 7, paddingVertical: 2, flexShrink: 0 } as const;
const FILL = { position: 'absolute' as const, left: 0, right: 0, top: 0, bottom: 0 };

/* ══ A · TODAY — BRASS RAMP, INK LETTERING ══════════════════════════════════
   The real component. Gold foil as the GROUND. */
const Today = () => <RankBadge rank="auteur" />;

/* ══ B · OXBLOOD + GOLD FOIL ════════════════════════════════════════════════
   The recommendation. Deep red leather, gold foil lettering, a gold rim — the
   idiom of a book spine or a theatre programme rather than a tier chip. The
   foil moves from the ground to the LETTERS, which is how foil is actually
   pressed into leather. Gold on this red measures 5.38:1. */
const Oxblood = () => (
  <View style={[BOX, { backgroundColor: colors.bloodReel, borderWidth: 0.5, borderColor: 'rgba(220,166,58,0.45)', overflow: 'hidden' }]}>
    <Text style={[TEXT, { color: colors.marqueeGold }]} numberOfLines={1} {...scaledTextProps}>★ AUTEUR</Text>
  </View>
);

/* ══ C · AN OXBLOOD RAMP + GOLD FOIL ════════════════════════════════════════
   The same idea given the house's own lit-plate construction: a red ramp with
   the crown, so it reads as lacquer rather than as flat card. Its lightest stop
   has to stay dark enough for gold to clear 4.5 — at #7A1512 it is 4.92:1. */
const RED_RAMP = ['#7A1512', '#6B1A0A', '#5A1408', '#3E0D05'] as const;
const OxbloodRamp = () => (
  <View style={[BOX, { overflow: 'hidden', borderWidth: 0.5, borderColor: 'rgba(220,166,58,0.45)' }]}>
    <LinearGradient colors={RED_RAMP} locations={BRASS_STOPS} start={BRASS_WIDE_START} end={BRASS_WIDE_END} style={FILL} />
    <LinearGradient colors={['rgba(240,232,176,0.16)', 'rgba(240,232,176,0.04)', 'transparent']}
      style={{ position: 'absolute', left: 0, right: 0, top: 0, height: CROWN_HEIGHT }} />
    <Text style={[TEXT, { color: colors.marqueeGold }]} numberOfLines={1} {...scaledTextProps}>★ AUTEUR</Text>
  </View>
);

/* ══ D · BRIGHT CRIMSON + PARCHMENT ═════════════════════════════════════════
   The literal reading of "make it crimson", drawn so it can be rejected on
   sight rather than in the abstract. `colors.crimson` is the palette's own
   "Auteur crimson", but gold on it is 2.85:1 and ink 3.18:1 — both fail — so
   the lettering has to go pale, and bright red with off-white letters is the
   grammar of a NEW tag. 4.74:1. */
const BrightCrimson = () => (
  <View style={[BOX, { backgroundColor: colors.crimson }]}>
    <Text style={[TEXT, { color: colors.parchment }]} numberOfLines={1} {...scaledTextProps}>★ AUTEUR</Text>
  </View>
);

const CANDIDATES: Array<[string, string, () => React.ReactElement, string]> = [
  ['a-today-brass', 'A · TODAY — brass ramp, ink lettering', Today, 'ink on brass · 4.57:1'],
  ['b-oxblood-foil', 'B · OXBLOOD + GOLD FOIL — the recommendation', Oxblood, 'gold on oxblood · 5.38:1'],
  ['c-oxblood-ramp', 'C · OXBLOOD RAMP + GOLD FOIL — lacquer', OxbloodRamp, 'gold on the lightest stop · 4.92:1'],
  ['d-bright-crimson', 'D · BRIGHT CRIMSON + PARCHMENT — the literal reading', BrightCrimson, 'parchment on crimson · 4.74:1'],
];

/* The label above each plate. Typewriter face, so the page reads as the house's
   own note to itself rather than as a caption bar. */
const Note = ({ children, dim }: { children: React.ReactNode; dim?: boolean }) => (
  <Text style={{
    fontFamily: fonts.sub, fontSize: 8, letterSpacing: 1.6,
    color: dim ? colors.fog : colors.sepia, includeFontPadding: false, marginBottom: 10,
  }} {...decorativeTextProps}>{children}</Text>
);

/**
 * The real byline, rebuilt from the app's own styles with one badge swapped in.
 *
 * `ring` and `ink` exist because the badge is not the whole decision. An Auteur
 * carries THREE marks — the ring round their disc, the colour of their name, and
 * the badge — and today all three are brass. Drawing a red badge inside a gold
 * ring would flatter neither option, so the package can be shown whole.
 */
const Row = ({ Badge, name, trailing, ring, ink }: {
  Badge: () => React.ReactElement; name: string; trailing: string;
  ring?: string; ink?: string;
}) => (
  <View style={p.byline}>
    <View style={[p.avatar, p.avatarAuteur, ring ? { borderColor: ring } : null]}>
      <Text style={p.avatarMark} {...decorativeTextProps}>{name.slice(0, 1).toUpperCase()}</Text>
    </View>
    <Text style={[p.bylineName, p.bylineNameAuteur, ink ? { color: ink } : null]}
      numberOfLines={1} {...scaledTextProps}>
      {name.toUpperCase()}
    </Text>
    <Badge />
    <Text style={p.bylineTrail} numberOfLines={1} {...scaledTextProps}>{`· ${trailing}`}</Text>
  </View>
);

for (const [slug, title, Badge, measured] of CANDIDATES) {
  add(slug, (
    <View style={[p.screen, { paddingHorizontal: 20, paddingTop: 40 }]}>
      <Note>{title}</Note>

      {/* 1 — the material, alone and large enough to judge. */}
      <View style={{ alignItems: 'flex-start', marginBottom: 6 }}><Badge /></View>
      <Note dim>{measured}</Note>

      <View style={[p.hair, { marginTop: 18, marginBottom: 18 }]} />

      {/* 2 — where it actually lives. */}
      <Note dim>IN THE BYLINE</Note>
      <Row Badge={Badge} name="Ana" trailing="61 CRITIQUES" />

      <View style={[p.hair, { marginTop: 12, marginBottom: 18 }]} />

      {/* 3 — the case that decides whether it fits at all. */}
      <Note dim>THIRTY CHARACTERS, THE NARROWEST COLUMN</Note>
      <View style={{ width: 257 }}>
        <Row Badge={Badge} name="Katharine-Wentworth-Ashgrovely" trailing="12 MIN · EDITED" />
      </View>

      <View style={[p.hair, { marginTop: 12, marginBottom: 18 }]} />

      {/* 4 — beside the rank below it, because the pair is the real design. */}
      <Note dim>WITH AN ARCHIVIST BENEATH IT</Note>
      <Row Badge={Badge} name="Ana" trailing="61 CRITIQUES" />
      <View style={p.byline}>
        <View style={[p.avatar, p.avatarArchivist]}>
          <Text style={p.avatarMark} {...decorativeTextProps}>D</Text>
        </View>
        <Text style={p.bylineName} numberOfLines={1} {...scaledTextProps}>DAN</Text>
        <RankBadge rank="archivist" />
        <Text style={p.bylineTrail} numberOfLines={1} {...scaledTextProps}>· 31 CRITIQUES</Text>
      </View>
    </View>
  ));
}

/* ══ ALL FOUR, STACKED ══════════════════════════════════════════════════════
   The comparison the separate plates cannot make: four candidates in one
   eyeline, which is the only way a material choice is ever actually decided. */
add('z-all-four', (
  <View style={[p.screen, { paddingHorizontal: 20, paddingTop: 40 }]}>
    <Note>THE FOUR, IN ONE EYELINE</Note>
    {CANDIDATES.map(([slug, title, Badge, measured]) => (
      <View key={slug} style={{ marginBottom: 22 }}>
        <Note dim>{title.replace(/ — .*$/, '')}</Note>
        <Row Badge={Badge} name="Ana" trailing="61 CRITIQUES" />
        <Note dim>{measured}</Note>
      </View>
    ))}
  </View>
));

/* ══ THE WHOLE PACKAGE ══════════════════════════════════════════════════════
   The badge is one of THREE marks an Auteur carries. Judging it alone is how a
   red badge ends up inside a gold ring beside a gold name — three statements of
   one fact, in two colour families.

   Left as shipped: brass ring, brass name, brass plate.
   Right as proposed: crimson ring (the palette reserves `crimson` for MARKS),
   `crimsonInk` for the name (the red it made for WORDS, 5.4:1), oxblood plate.

   An Archivist sits under each, unchanged, because the pair is what a reader
   actually sees and the middle rank must stay quiet in both. */
add('y-the-whole-package', (
  <View style={[p.screen, { paddingHorizontal: 20, paddingTop: 40 }]}>
    <Note>THE WHOLE PACKAGE — RING, NAME, BADGE</Note>

    <Note dim>AS SHIPPED — BRASS THROUGHOUT</Note>
    <Row Badge={Today} name="Ana" trailing="61 CRITIQUES" />
    <View style={p.byline}>
      <View style={[p.avatar, p.avatarArchivist]}>
        <Text style={p.avatarMark} {...decorativeTextProps}>D</Text>
      </View>
      <Text style={p.bylineName} numberOfLines={1} {...scaledTextProps}>DAN</Text>
      <RankBadge rank="archivist" />
      <Text style={p.bylineTrail} numberOfLines={1} {...scaledTextProps}>· 31 CRITIQUES</Text>
    </View>

    <View style={[p.hair, { marginTop: 22, marginBottom: 22 }]} />

    <Note dim>AS PROPOSED — CRIMSON RING, CRIMSON INK, OXBLOOD PLATE</Note>
    <Row Badge={Oxblood} name="Ana" trailing="61 CRITIQUES"
      ring={colors.crimson} ink={colors.crimsonInk} />
    <View style={p.byline}>
      <View style={[p.avatar, p.avatarArchivist]}>
        <Text style={p.avatarMark} {...decorativeTextProps}>D</Text>
      </View>
      <Text style={p.bylineName} numberOfLines={1} {...scaledTextProps}>DAN</Text>
      <RankBadge rank="archivist" />
      <Text style={p.bylineTrail} numberOfLines={1} {...scaledTextProps}>· 31 CRITIQUES</Text>
    </View>

    <View style={[p.hair, { marginTop: 22, marginBottom: 22 }]} />

    <Note dim>AND WITH THE LACQUERED PLATE INSTEAD</Note>
    <Row Badge={OxbloodRamp} name="Ana" trailing="61 CRITIQUES"
      ring={colors.crimson} ink={colors.crimsonInk} />

    <View style={[p.hair, { marginTop: 22, marginBottom: 22 }]} />

    {/* A whole column of them. One badge is a jewel; twenty in a row is a
        feed, and that is the only place this decision actually lands. */}
    <Note dim>TWENTY ROWS DEEP — WHERE IT ACTUALLY LANDS</Note>
    {[
      ['Ana', 'auteur'], ['Dan', 'archivist'], ['Sam', 'free'],
      ['Mira', 'auteur'], ['Kit', 'free'], ['Jun', 'archivist'],
    ].map(([who, rank], i) => (
      <View key={who} style={p.byline}>
        <View style={[p.avatar,
          rank === 'auteur' ? [p.avatarAuteur, { borderColor: colors.crimson }]
            : rank === 'archivist' ? p.avatarArchivist : null]}>
          <Text style={p.avatarMark} {...decorativeTextProps}>{who.slice(0, 1)}</Text>
        </View>
        <Text style={[p.bylineName, rank === 'auteur' && { color: colors.crimsonInk, opacity: 1 }]}
          numberOfLines={1} {...scaledTextProps}>{who.toUpperCase()}</Text>
        {rank === 'auteur' ? <Oxblood /> : rank === 'archivist' ? <RankBadge rank="archivist" /> : null}
        <Text style={p.bylineTrail} numberOfLines={1} {...scaledTextProps}>{`· ${(i + 3) * 11} CRITIQUES`}</Text>
      </View>
    ))}
  </View>
));

describe('badge proposals', () => {
  it('renders every candidate to html', () => {
    mkdirSync(OUT, { recursive: true });
    for (const [name, node] of sheets) {
      const { toJSON } = render(node);
      writeFileSync(join(OUT, `${name}.html`), toHtml(toJSON()), 'utf8');
    }
    expect(sheets.length).toBeGreaterThan(0);
  });
});
