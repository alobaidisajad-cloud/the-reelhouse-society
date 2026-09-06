/**
 * zz-proposals.gen.test.tsx — the five decisions, drawn.
 *
 * A GENERATOR, not a test. Run: npx jest zz-proposals.gen
 *
 * Most of what is proposed here already EXISTS as a component — that is the
 * finding. `DossierDesk` has FILM, COVER and SERIES and no screen mounts it;
 * `EssayHead` draws a film credit, a cover and a series line that nothing can
 * set; the series page is built and unreachable. So these plates are mostly the
 * real thing, shown in the place it would go, rather than a picture of an idea.
 *
 * Where a proposal has no component yet — the rank badge, the saved mark — it is
 * drawn HERE and labelled as a sketch, so nothing in this file can be mistaken
 * for a record of the app.
 */
import React from 'react';
import { View, Text } from 'react-native';
import { render } from '@testing-library/react-native';
import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { toHtml } from '../../../src/components/profile/__tests__/zz-render.lib';
import { LOCAL_ART, POSTERS } from '../../../src/components/profile/__tests__/zz-art.gen';

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn() }),
  useFocusEffect: () => {},
}));
jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(), notificationAsync: jest.fn(), selectionAsync: jest.fn(),
}));
jest.mock('@/src/stores/auth', () => ({
  useAuthStore: (sel?: (s: unknown) => unknown) => {
    const state = { user: { id: 'u1', tier: 'auteur' }, isAuthenticated: true };
    return sel ? sel(state) : state;
  },
}));
jest.mock('@/src/utils/markdownSafety', () => ({
  capMarkdownForRender: (s: string) => s,
  onMarkdownLinkPress: () => false,
}));

import { EssayHead } from '@/src/components/dispatch/paper/PaperEssay';
import { EssayBody } from '@/src/components/dispatch/EssayBody';
import { DossierDesk } from '@/src/components/dispatch/paper/PaperDesk';
import { PaperSheet } from '@/src/components/dispatch/paper/PaperFrame';
import { PaperBack } from '@/src/components/dispatch/paper/PaperMore';
import { Byline } from '@/src/components/dispatch/paper/PaperPost';
import { p } from '@/src/components/dispatch/paper/paperStyles';
import { colors, fonts } from '@/src/theme/theme';
import { decorativeTextProps, scaledTextProps } from '@/src/constants/textScaling';



const OUT = process.env.PAPER_OUT ?? join(__dirname, '..', 'proposals');

const ANA = { name: 'Ana', memberNo: 17, tier: 'auteur' as const, avatar: null };
const DAN = { name: 'Dan', memberNo: 402, tier: 'archivist' as const, avatar: null };
const SAM = { name: 'Sam', memberNo: 1204, tier: 'free' as const, avatar: null };

const TOKYO = {
  id: 18148, title: 'Tokyo Story', year: 1953, director: 'Ozu',
  posterPath: Object.keys(POSTERS)[0] ?? null,
  backdropPath: Object.keys(POSTERS)[1] ?? null,
};

const sheets: Array<[string, React.ReactElement]> = [];
const add = (name: string, node: React.ReactElement) => sheets.push([name, node]);

const ESSAY = [
  'Ozu keeps the camera at the height of somebody kneeling, and he keeps it there after the room has emptied.',
  '## THE THREE REFUSALS',
  'He will not move it, he will not cut early, and he will not tell you what to feel about either.',
  '> The house outlives the family that argued in it.',
  'A shot in *Tokyo Story* runs eleven seconds past its own ending.',
].join('\n\n');

/* ══ A · THE PREVIEW ═══════════════════════════════════════════════════════
   Today the preview sets your essay in Courier Prime 15/24 in `bone`, with
   headings at 24pt. The reader sets it in Spectral 16.5/28 in `parchment` with
   headings at 11pt and a raised initial. This is the reader's own EssayBody —
   what the preview would become. */
add('p1-preview-becomes-the-reader', (
  <View style={p.screen}>
    <PaperBack label="LIVE PREVIEW" />
    <PaperSheet>
      <EssayHead title="What the Camera Refuses to Do" author={ANA}
        readTime="9 MIN" filed="AUGUST 26" />
      <EssayBody text={ESSAY} />
    </PaperSheet>
  </View>
));

/* ══ B · THE RANK, ON THE BYLINE ═══════════════════════════════════════════
   SKETCH. The feed already prints `✦ ARCHIVIST` and `★ AUTEUR`; the Dispatch
   prints neither. Drawn three ways so the choice is a choice: the mark alone,
   the mark with its word, and today's crimson tint for comparison. */
const RankMark = ({ tier }: { tier: 'archivist' | 'auteur' }) => (
  <Text
    style={{
      fontFamily: fonts.sub, fontSize: 8.5, letterSpacing: 1.2,
      color: tier === 'auteur' ? colors.sepia : colors.bone,
      includeFontPadding: false,
    }}
    {...decorativeTextProps}
  >
    {tier === 'auteur' ? '★' : '✦'}
  </Text>
);

const RankWord = ({ tier }: { tier: 'archivist' | 'auteur' }) => (
  <Text
    style={{
      fontFamily: fonts.sub, fontSize: 7.5, letterSpacing: 1.6,
      color: tier === 'auteur' ? colors.sepia : colors.bone,
      includeFontPadding: false,
    }}
    {...decorativeTextProps}
  >
    {tier === 'auteur' ? '★ AUTEUR' : '✦ ARCHIVIST'}
  </Text>
);

/**
 * The byline's own pieces, composed here so the mark can sit where it belongs —
 * between the house number and the facts. The real `Byline` renders the name and
 * the trailing facts as two boxes with nothing between them, which is precisely
 * the change this decision is about.
 */
const FakeByline = ({ author, mark, trailing }: {
  author: { name: string; memberNo: number; tier: string };
  mark?: React.ReactNode; trailing: string;
}) => (
  <View style={[p.byline, { marginBottom: 10 }]}>
    <View style={p.avatar}>
      <Text style={p.avatarMark} {...decorativeTextProps}>{author.name.slice(0,1).toUpperCase()}</Text>
    </View>
    <Text style={[p.bylineName, author.tier === 'auteur' && { color: colors.crimsonInk, opacity: 1 }]}
      numberOfLines={1} {...scaledTextProps}>
      {`${author.name.toUpperCase()} · No. ${author.name.slice(0,1).toUpperCase()}`}
    </Text>
    {mark}
    <Text style={p.bylineTrail} numberOfLines={1} {...scaledTextProps}>{`· ${trailing}`}</Text>
  </View>
);

const Row = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <View style={{ marginBottom: 22 }}>
    <Text style={{ fontFamily: fonts.sub, fontSize: 7.5, letterSpacing: 2,
      color: colors.sepia, marginBottom: 8 }} {...decorativeTextProps}>{label}</Text>
    {children}
  </View>
);

add('p2-rank-on-the-byline', (
  <View style={[p.screen, { paddingHorizontal: 20, paddingTop: 40 }]}>
    <Row label="TODAY — AN AUTEUR IS TINTED, AN ARCHIVIST IS NOTHING">
      <Byline author={ANA} trailing="31 CRITIQUES" />
      <Byline author={DAN} trailing="12 CRITIQUES" />
      <Byline author={SAM} trailing="4 CRITIQUES" />
    </Row>

    {/* The mark goes between the NUMBER and the facts, not after them. Drawn
        beside the real Byline first, it trailed "31 CRITIQUES" and read as
        belonging to the critique count — so these rows compose the byline's
        own pieces to put the mark where it would actually sit. */}
    <Row label="ONE — THE MARK, BESIDE THE NUMBER">
      <FakeByline author={ANA} mark={<RankMark tier="auteur" />} trailing="31 CRITIQUES" />
      <FakeByline author={DAN} mark={<RankMark tier="archivist" />} trailing="12 CRITIQUES" />
      <FakeByline author={SAM} trailing="4 CRITIQUES" />
    </Row>

    <Row label="TWO — THE MARK AND ITS WORD, AS THE FEED PRINTS IT">
      <FakeByline author={ANA} mark={<RankWord tier="auteur" />} trailing="31 CRITIQUES" />
      <FakeByline author={DAN} mark={<RankWord tier="archivist" />} trailing="12 CRITIQUES" />
      <FakeByline author={SAM} trailing="4 CRITIQUES" />
    </Row>
  </View>
));

/* ══ C · THE DRAFT SAYS SO ═════════════════════════════════════════════════
   SKETCH. The draft saves on a debounce and flushes when the app backgrounds,
   and the writer is never told either happened. */
add('p3-the-draft-says-so', (
  <View style={[p.screen, { paddingHorizontal: 20, paddingTop: 40 }]}>
    <Row label="TODAY — THE FOOT OF THE WRITING ROOM">
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 18 }}>
        <Text style={{ fontFamily: fonts.sub, fontSize: 8, letterSpacing: 1.4, color: colors.fog }}
          {...scaledTextProps}>2,140 WORDS · 10 MIN</Text>
      </View>
    </Row>

    <Row label="PROPOSED — THE SAME RAIL, WITH THE MARK THAT FADES">
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 18 }}>
        <Text style={{ fontFamily: fonts.sub, fontSize: 8, letterSpacing: 1.4, color: colors.fog }}
          {...scaledTextProps}>2,140 WORDS · 10 MIN</Text>
        <Text style={{ fontFamily: fonts.sub, fontSize: 8, letterSpacing: 1.6, color: colors.sepia }}
          {...decorativeTextProps}>✓ SAVED</Text>
      </View>
    </Row>

    <Row label="AND WHEN A DRAFT IS WAITING FOR YOU">
      <View style={{ borderLeftWidth: 1.5, borderLeftColor: colors.sepiaBorder, paddingLeft: 12 }}>
        <Text style={{ fontFamily: fonts.sub, fontSize: 8, letterSpacing: 1.6, color: colors.sepia,
          marginBottom: 4 }} {...decorativeTextProps}>YOUR DRAFT, AS YOU LEFT IT</Text>
        <Text style={{ fontFamily: fonts.bodyItalic, fontSize: 12.5, lineHeight: 20, color: colors.bone }}
          {...scaledTextProps}>Begun 26 August · 2,140 words</Text>
      </View>
    </Row>
  </View>
));

/* ══ D · THE DESK THAT ALREADY EXISTS ══════════════════════════════════════
   Not a sketch. `DossierDesk` is built, drawn here as it stands, and mounted by
   nothing — FILM, COVER and SERIES are the three tools the app's writing room
   does not have. */
add('p4-the-desk-already-built', (
  <DossierDesk onBack={() => {}} onFile={() => {}} onFilm={() => {}} onCover={() => {}}
    onSeries={() => {}}
    title="What the Camera Refuses to Do" words={2140}
    series="Part II of Ozu, in four parts"
    body="Ozu keeps the camera at the height of somebody kneeling, and he keeps it there after the room has emptied. He will not move it, he will not cut early, and he will not tell you what to feel about either." />
));

/* ══ E · WHAT A FILM AND A SERIES BUY THE READER ═══════════════════════════
   Both are the real EssayHead. The left is every dossier the app can file
   today; the right is the same essay with the two things nothing can set. */
add('p5-a-dossier-today', (
  <View style={p.screen}>
    <PaperBack label="DOSSIER" />
    <PaperSheet>
      <EssayHead title="What the Camera Refuses to Do" author={ANA}
        readTime="9 MIN" filed="AUGUST 26" />
      <EssayBody text={ESSAY} />
    </PaperSheet>
  </View>
));

add('p6-a-dossier-with-its-film-and-series', (
  <View style={p.screen}>
    <PaperBack label="DOSSIER" />
    <PaperSheet>
      <EssayHead title="What the Camera Refuses to Do" author={ANA}
        readTime="9 MIN" filed="AUGUST 26"
        series="Part II of Ozu, in four parts"
        film={TOKYO} />
      <EssayBody text={ESSAY} />
    </PaperSheet>
  </View>
));

describe('proposal mockups', () => {
  it('renders every proposal to html', () => {
    mkdirSync(OUT, { recursive: true });
    for (const [name, node] of sheets) {
      const r = render(node);
      writeFileSync(join(OUT, `${name}.html`), toHtml(r.toJSON(), { posters: POSTERS, local: LOCAL_ART }), 'utf8');
      r.unmount();
    }
    expect(sheets.length).toBeGreaterThan(0);
  });
});
