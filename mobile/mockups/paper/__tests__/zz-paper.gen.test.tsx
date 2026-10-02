/**
 * A GENERATOR, not a test. Mounts the REAL components — including the app's own
 * TopNavBar — and converts the resolved React Native tree to HTML, so the mockup
 * is the page rather than a drawing of it.
 *
 * Run: npx jest zz-paper.gen
 */
import React from 'react';
import { View, Text, ScrollView } from 'react-native';
import { render } from '@testing-library/react-native';
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { toHtml } from '../../../src/components/profile/__tests__/zz-render.lib';
import { LOCAL_ART, POSTERS as REPO_POSTERS } from '../../../src/components/profile/__tests__/zz-art.gen';
import { FIXTURES, HEIGHT_AT } from '../../paths';

import { PaperPost as RawPaperPost, type PaperAuthor } from '@/src/components/dispatch/paper/PaperPost';
import { PaperBallot as RawPaperBallot } from '@/src/components/dispatch/paper/PaperBallot';
import { PaperComposer } from '@/src/components/dispatch/paper/PaperComposer';
import {
  PaperChrome, PaperMasthead, PaperEmpty, PaperSkeletons,
  PaperSheet, DayDivider, Ornament, RunningHead,
} from '@/src/components/dispatch/paper/PaperFrame';
import {
  CritiqueSpine, CritiqueHead, PaperCritiqueRow, CritiqueFooter,
  CritiqueComposer, PostDock as RawPostDock, type Critique,
} from '@/src/components/dispatch/paper/PaperCritiques';
import {
  PaperPicker, PaperDoor, PaperRules, PaperArchive, ArchiveFilm, PaperRoom,
  PaperCase, LoungeCard, PaperBack, NewFilings, NEW_FILINGS_ROOM,
  DossierShareCard, StoryFrame,
} from '@/src/components/dispatch/paper/PaperMore';
import {
  EssayHead, EssayOpening, EssayPara, EssayBreak, EssayNext, SeriesList,
} from '@/src/components/dispatch/paper/PaperEssay';
import { partOf } from '@/src/components/dispatch/paper/paperText';
/** The path a real dossier takes — the markdown renderer, not hand-built paragraphs. */
import { EssayBody } from '@/src/components/dispatch/EssayBody';
import {
  WireDesk, BallotDesk, DossierDesk, FilmFinder, ShareSheet,
} from '@/src/components/dispatch/paper/PaperDesk';
import { ConciergeCard } from '@/src/components/layout/ConciergeButton';
import { TopNavBar } from '@/src/components/layout/TopNavBar';
import { navTopPadding, NAV_ROW_MIN_H, NAV_BOTTOM_PADDING } from '@/src/components/layout/navMetrics';
import { p } from '@/src/components/dispatch/paper/paperStyles';
import { columnWidth } from '@/src/components/dispatch/paper/paperMetrics';

/** Nothing is pressed in a still; required props say so out loud. */
const NOOP = () => {};

// A MEMBER'S page, not a stranger's: a mark with no handler is drawn disabled
// ("Members only", dimmed), so every draw gets handlers (`a7-end-signed-out` alone
// shows the signed-out state, with its own props).
const PaperPost = (props: React.ComponentProps<typeof RawPaperPost>) => (
  <RawPaperPost onCertify={NOOP} onSave={NOOP} {...props} />
);
const PaperBallot = (props: React.ComponentProps<typeof RawPaperBallot>) => (
  <RawPaperBallot onCertify={NOOP} onSave={NOOP} onVote={NOOP} {...props} />
);
const PostDock = (props: React.ComponentProps<typeof RawPostDock>) => (
  <RawPostDock onCertify={NOOP} onSave={NOOP} {...props} />
);

/** Where the sheets land: `mockups/paper/out/` in the repo unless PAPER_OUT says. */
const OUT = process.env.PAPER_OUT ?? join(__dirname, '..', 'out');

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
jest.mock('@/src/stores/notificationStore', () => ({
  useNotificationStore: (sel?: (s: unknown) => unknown) => {
    const state = { unreadCount: 3, notifications: [] };
    return sel ? sel(state) : state;
  },
}));
jest.mock('react-native-safe-area-context', () => {
  const R = require('react');
  const { View: V } = require('react-native');
  return {
    SafeAreaProvider: ({ children, style }: any) => R.createElement(V, { style: [{ flex: 1 }, style] }, children),
    useSafeAreaInsets: () => ({ top: 59, bottom: 34, left: 0, right: 0 }),
    useSafeAreaFrame: () => ({ x: 0, y: 0, ...require('@/mockups/paths').PHONE }),
  };
});

/** The floating header draws OVER content, so the page reserves its height —
 *  from the app's own constants, exactly as topPad does. */
const NavSpace = () => (
  <View style={{ height: navTopPadding(59) + NAV_ROW_MIN_H + NAV_BOTTOM_PADDING }} />
);

const TODAY = new Date(2026, 7, 28);

const W: number = require('@/mockups/paths').PHONE.width;
const COL = columnWidth(W);

// OPTIONAL art (missing, plates draw empty): mockups/fixtures, unless PAPER_ART says.
const ART = process.env.PAPER_ART ?? FIXTURES;

/** An artwork file, or `fallback`; `empty` says whether that fallback draws nothing. */
const readArt = <T,>(file: string, fallback: T, empty: boolean): T => {
  try {
    return JSON.parse(readFileSync(join(ART, file), 'utf8')) as T;
  } catch {
     
    console.warn(
      empty
        ? `[paper] ${file} not found — those plates render empty.`
        : `[paper] ${file} not found — using the repo's own artwork instead.`,
    );
    return fallback;
  }
};

// The posters, from the repo (zz-art.gen's data URIs) unless PAPER_ART holds a file.
const POSTERS = readArt<Record<string, { title: string; data: string }>>('posters.json', REPO_POSTERS, false);
const ODYSSEY = readArt<Record<string, string>>('odyssey-art.json', {}, true);

const IMAGES: Record<string, { title: string; data: string }> = { ...POSTERS };
for (const [path, data] of Object.entries(ODYSSEY)) IMAGES[path] = { title: '', data };

/** Two source titles name the wrong picture (checked against the artwork). */
const RELABEL: Record<string, string> = {
  Persona: 'Cache',
  'Wings of Desire': 'All Quiet on the Western Front',
};
for (const v of Object.values(POSTERS)) {
  if (RELABEL[v.title]) v.title = RELABEL[v.title];
}

// The house's real mark, for the card that leaves the app: from the repository's
// public/ (beside mobile/), never from one machine's disk.
const LOGO_KEY = '/reelhouselogo.jpg';
IMAGES[LOGO_KEY] = {
  title: '',
  data: 'data:image/png;base64,' + readFileSync(
    join(__dirname, '..', '..', '..', '..', 'public', 'reelhouse-logo-transparent.png'),
  ).toString('base64'),
};

const STILL_PATHS = Object.keys(ODYSSEY);
const artPath = (title: string): string | null => {
  const hit = Object.entries(POSTERS).find(([, v]) => v.title === title);
  return hit ? hit[0] : null;
};
const still = (i: number) => STILL_PATHS[i % STILL_PATHS.length];

const ANA: PaperAuthor = { name: 'Ana', memberNo: 17, tier: 'auteur', avatar: artPath('Maggie Cheung') };
const MIRA: PaperAuthor = { name: 'Mira', memberNo: 88, tier: 'archivist', avatar: artPath('Setsuko Hara') };
const DAN: PaperAuthor = { name: 'Dan', memberNo: 402, tier: 'free' };
const SAM: PaperAuthor = { name: 'Sam', memberNo: 1204, tier: 'free', avatar: artPath('Toshiro Mifune') };
const SAJAD: PaperAuthor = { name: 'Sajad', memberNo: 214, tier: 'free' };

const film = (title: string, year: number, director: string, backdrop?: number) => ({
  title, year, director, posterPath: artPath(title),
  backdropPath: backdrop == null ? null : still(backdrop),
});

const STALKER = film('Stalker', 1979, 'Tarkovsky', 11);
/** A still that spells out no other film's title (19 is a title card). */
const TOKYO = film('Tokyo Story', 1953, 'Ozu', 7);
const COME = film('Come and See', 1985, 'Klimov');
const CACHE = film('Cache', 2005, 'Haneke', 3);
const GODFATHER = film('The Godfather Part II', 1974, 'Coppola', 22);
const CHUNGKING = film('Chungking Express', 1994, 'Wong Kar-wai');
/** TMDB withdraws ids: the credit must still name the film. */
const LOST = { title: 'A Film TMDB Withdrew', year: 1971, director: null, posterPath: null };

/** The longest a take may be, so the worst case is drawn rather than imagined. */
const LONGEST =
  'Stalker is not slow, it is patient, and there is a difference nobody making films ' +
  'today seems to understand any more: the camera waits because the men are waiting, ' +
  'and when it finally moves you feel it in your chest rather than in your eyes.';

const out: [string, React.ReactElement][] = [];
const add = (name: string, el: React.ReactElement) => out.push([name, el]);

// ══ A · THE PAPER ═══════════════════════════════════════════════════════════
// An iPad in portrait (supportsTablet is on): the paper caps at PAPER_MAX and centres.
const TAB = 834;
const TAB_COL = columnWidth(TAB);

// The narrow widths, 320 (iOS's floor) and 360 (Android's commonest), drawn with the
// WORST content the app allows: the longest take, a long name, an edited dossier.
const SE = 320;
const SE_COL = columnWidth(SE);
const AND = 360;
const AND_COL = columnWidth(AND);

const LONGNAME: PaperAuthor = { name: 'Archivist-Name', memberNo: 10248, tier: 'archivist', avatar: artPath('Setsuko Hara') };

// What a member can type: nothing bounds an unbroken RUN (a pasted link, a compound,
// a held key), and React Native does not break a word wider than its box.
add('t4-unbreakable', (
  <View style={p.screen}>
    <TopNavBar />
    <NavSpace />
    <PaperChrome onArchive={() => {}} section="ALL" />
    <PaperSheet>
      <RunningHead date={TODAY} dayLabel="WEDNESDAY, AUGUST 28" sort="LATEST" />
      <PaperPost kind="wire" order="23:41" orderIs="hour" author={ANA} measureWidth={COL}
        source="bfi.org.uk"
        body="Full programme at https://www.bfi.org.uk/news/napoleon-restoration-tour-2026-full-city-listing" />
      <PaperPost kind="take" order="21:04" orderIs="hour" author={SAM} measureWidth={COL}
        body="Rindfleischetikettierungsueberwachungsaufgabenuebertragungsgesetz is a real word and a better film title than most" />
      <PaperPost kind="seeking" order="19:30" orderIs="hour" author={SAJAD} measureWidth={COL}
        body="something like 東京物語 — 小津安二郎の映画をもっと見たい" commentCount={4} />
    </PaperSheet>
  </View>
));

add('t2-iphone-se', (
  <View style={p.screen}>
    <TopNavBar />
    <NavSpace />
    <PaperChrome onArchive={() => {}} section="ALL" />
    <PaperSheet>
      <RunningHead date={TODAY} dayLabel="WEDNESDAY, AUGUST 28" sort="LATEST" />
      <PaperPost kind="dossier" order="14:20" orderIs="hour" author={LONGNAME} measureWidth={SE_COL} film={TOKYO}
        body="The Long Silence in Ozu" series={partOf(2, 'Ozu, in four parts').printed}
        readTime="12 MIN" edited certifyCount={61} commentCount={14} />
      <PaperPost kind="take" order="19:02" orderIs="hour" author={MIRA} measureWidth={SE_COL} film={STALKER}
        body={LONGEST} certifyCount={2140} commentCount={61} certified />
      {/* A seeking's larger face on the narrowest column, with the longest take's text. */}
      <PaperPost kind="seeking" order="17:44" orderIs="hour" author={SAJAD} measureWidth={SE_COL}
        body={LONGEST} commentCount={9} />
    </PaperSheet>
  </View>
));

add('t3-android-360', (
  <View style={p.screen}>
    <TopNavBar />
    <NavSpace />
    <PaperChrome onArchive={() => {}} section="ALL" />
    <PaperSheet>
      <RunningHead date={TODAY} dayLabel="WEDNESDAY, AUGUST 28" sort="LATEST" />
      <PaperPost kind="dossier" order="14:20" orderIs="hour" author={LONGNAME} measureWidth={AND_COL} film={TOKYO}
        body="The Long Silence in Ozu" series={partOf(2, 'Ozu, in four parts').printed}
        readTime="12 MIN" edited certifyCount={61} commentCount={14} />
      <PaperPost kind="seeking" order="20:15" orderIs="hour" author={SAJAD} measureWidth={AND_COL}
        body="something to watch after a funeral. No irony, no uplift. I have three hours."
        certifyCount={47} commentCount={22} />
    </PaperSheet>
  </View>
));

// The byline's worst case: a 30-character name (the ceiling), the wider AUTEUR badge,
// the trailing facts, the narrowest column. The badge never shrinks; the name gives way.
const MAX_AUTEUR: PaperAuthor = {
  name: 'Katharine-Wentworth-Ashgrovely', memberNo: 10248, tier: 'auteur', avatar: null,
};

add('t7-byline-worst-case', (
  <View style={p.screen}>
    <TopNavBar />
    <NavSpace />
    <PaperChrome onArchive={() => {}} section="ALL" />
    <PaperSheet>
      <RunningHead date={TODAY} dayLabel="WEDNESDAY, AUGUST 28" sort="LATEST" />
      <PaperPost kind="dossier" order="14:20" orderIs="hour" author={MAX_AUTEUR} measureWidth={AND_COL} film={TOKYO}
        body="The Long Silence in Ozu" series={partOf(2, 'Ozu, in four parts').printed}
        readTime="12 MIN" edited certifyCount={61} commentCount={14} />
      <PaperPost kind="take" order="2.1K" orderIs="count" author={MAX_AUTEUR} measureWidth={AND_COL}
        body={LONGEST} certifyCount={2140} commentCount={61} certified />
      {/* The other badge at the same width, so the two can be compared without
          switching plates — an Archivist is the common case and the one that
          decides whether the feed reads as a wall of medals. */}
      <PaperPost kind="seeking" order="88" orderIs="count" author={LONGNAME} measureWidth={AND_COL}
        body="Where do I start with Ozu? I have two evenings and no idea which door to open."
        certifyCount={88} commentCount={31} />
    </PaperSheet>
  </View>
));

add('t1-tablet', (
  <View style={p.screen}>
    <TopNavBar />
    <NavSpace />
    <PaperChrome onArchive={() => {}} section="ALL" />
    <PaperSheet>
      <RunningHead date={TODAY} dayLabel="WEDNESDAY, AUGUST 28" sort="LATEST" />
      <PaperPost kind="take" order="21:40" orderIs="hour" author={DAN} measureWidth={TAB_COL}
        body="tbh Odyssey was bad" film={LOST} commentCount={31} certifyCount={4} />
      <PaperPost kind="take" order="19:02" orderIs="hour" author={MIRA} measureWidth={TAB_COL} film={TOKYO}
        body={LONGEST} certifyCount={214} commentCount={31} saved />
      <PaperPost kind="seeking" order="20:15" orderIs="hour" author={SAJAD} measureWidth={TAB_COL}
        body="any good horror movies? nothing with gore" commentCount={12} />
    </PaperSheet>
  </View>
));

add('a1-paper-latest', (
  <View style={p.screen}>
    <TopNavBar />
    <NavSpace />
    <PaperChrome onArchive={() => {}} section="ALL" />
    <PaperSheet>
      <RunningHead date={TODAY} dayLabel="WEDNESDAY, AUGUST 28" sort="LATEST" />
      <PaperPost kind="take" order="21:40" orderIs="hour" author={DAN} measureWidth={COL}
        body="tbh Odyssey was bad" film={LOST} commentCount={31} certifyCount={4} />
      <PaperPost kind="seeking" order="20:15" orderIs="hour" author={SAJAD} measureWidth={COL}
        body="any good horror movies? nothing with gore" commentCount={12} />
      <PaperPost kind="take" order="19:02" orderIs="hour" author={MIRA} measureWidth={COL} film={TOKYO}
        body="Tokyo Story is the only film that has ever made me telephone my mother the same night."
        certifyCount={214} commentCount={31} saved />
      <DayDivider label="TUESDAY, AUGUST 26" />
      <PaperPost kind="wire" order="23:41" orderIs="hour" author={ANA} measureWidth={COL} film={GODFATHER}
        headline="BFI" source="bfi.org.uk"
        body="The restored NAPOLEON will tour eleven cities before it reaches any streaming service."
        certifyCount={31} commentCount={9} />
    </PaperSheet>
  </View>
));

add('a2-paper-certified', (
  <View style={p.screen}>
    <TopNavBar />
    <NavSpace />
    <PaperChrome onArchive={() => {}} section="ALL" />
    <PaperSheet>
      <RunningHead date={TODAY} dayLabel="WEDNESDAY, AUGUST 28" sort="CERTIFIED" />
      <PaperPost kind="take" order="2.1K" orderIs="count" author={ANA} measureWidth={COL} film={STALKER} still
        body={LONGEST} certifyCount={2140} commentCount={61} certified />
      <PaperPost kind="take" order="214" orderIs="count" author={MIRA} measureWidth={COL} film={TOKYO}
        body="Tokyo Story is the only film that has ever made me telephone my mother the same night."
        certifyCount={214} commentCount={31} saved />
      <PaperPost kind="take" order="—" orderIs="count" author={DAN} measureWidth={COL} film={LOST}
        body="tbh Odyssey was bad" commentCount={31} />
      <PaperPost kind="seeking" order="—" orderIs="count" author={SAJAD} measureWidth={COL}
        body="any good horror movies? nothing with gore" commentCount={12} />
    </PaperSheet>
  </View>
));

add('a3-day-one', (
  <View style={p.screen}>
    <TopNavBar />
    <NavSpace />
    {/* The index prints on day one too. The frame a member learns in their first
        minute should not appear and disappear — and with nothing filed, every
        department being empty is the honest thing to show. */}
    <PaperChrome onArchive={() => {}} section="ALL" />
    <PaperSheet top>
      <PaperMasthead date={TODAY} dateLabel="AUGUST 28" />
      <Ornament />
      <PaperEmpty title="Nothing has been filed yet."
        body="Ask what to watch. Say the thing nobody else will. Bring the news."
        action="FILE THE FIRST" quiet="OR JUST LOOK AROUND"
        /* a screenshot: nothing to do, said out loud rather than left out */
        onAction={() => {}} />
    </PaperSheet>
  </View>
));

add('a4-empty-seeking', (
  <View style={p.screen}>
    <TopNavBar />
    <NavSpace />
    <PaperChrome onArchive={() => {}} section="SEEKING" />
    <PaperSheet>
      {/* No section head: the index above already names SEEKING, in its violet. */}
      <RunningHead date={TODAY} dayLabel="WEDNESDAY, AUGUST 28" sort="LATEST" />
      <PaperEmpty title="No one is asking."
        body="Tell the house what you need tonight. Someone always knows."
        action="ASK THE HOUSE"
        /* a screenshot: nothing to do, said out loud rather than left out */
        onAction={() => {}} />
    </PaperSheet>
  </View>
));

add('a5-empty-ballots-free', (
  <View style={p.screen}>
    <TopNavBar />
    <NavSpace />
    <PaperChrome onArchive={() => {}} section="BALLOTS" />
    <PaperSheet>
      <RunningHead date={TODAY} dayLabel="WEDNESDAY, AUGUST 28" sort="LATEST" />
      <PaperEmpty title="No ballot is open."
        body="Auteurs call the votes. When one opens, the whole house marks it."
        quiet="WHAT AN AUTEUR CAN DO →" />
    </PaperSheet>
  </View>
));

add('a6-skeletons', (
  <View style={p.screen}>
    <TopNavBar />
    <NavSpace />
    <PaperChrome onArchive={() => {}} section="TAKES" />
    <PaperSheet>
      <RunningHead date={TODAY} dayLabel="WEDNESDAY, AUGUST 28" sort="LATEST" />
      <PaperSkeletons section="TAKES" />
    </PaperSheet>
  </View>
));

add('a7-end-signed-out', (
  <View style={p.screen}>
    <TopNavBar />
    <NavSpace />
    <PaperChrome onArchive={() => {}} section="ALL" />
    <PaperSheet>
      <RunningHead date={TODAY} dayLabel="WEDNESDAY, AUGUST 28" sort="LATEST" />
      <PaperPost kind="take" order="08:12" orderIs="hour" author={SAM} measureWidth={COL} film={CHUNGKING}
        body="Chungking Express gets better every year and I no longer trust anyone who disagrees."
        certifyCount={88} commentCount={12} />
      <PaperEmpty title="The house is open to read."
        body="Filing is for members." action="JOIN THE SOCIETY" end
        /* a screenshot: nothing to do, said out loud rather than left out */
        onAction={() => {}} />
    </PaperSheet>
  </View>
));

/**
 * ══ THE BOOKMARK ═══════════════════════════════════════════════════════════
 * Not a new kind of page — the SAME paper, filtered to what you kept. That is
 * the whole design, and every decision follows from it:
 *
 *  · The index stays. With thirty saved filings you want them by kind, and the
 *    six departments already do exactly that job. A second filter would have
 *    been a second thing to learn for a job the first one already does.
 *
 *  · The running head names the page instead of the edition, because this is
 *    not an edition. The bookmark beside it lights — and that lit bookmark is
 *    the way back out. You entered by tapping a toggle; you leave by tapping
 *    it again. No back arrow for a page that has no parent.
 *
 *  · The margin carries WHEN YOU SAVED IT, because that is what orders the
 *    page, which is the rule the margin has followed since the first draft.
 *    The dividers group by the day you saved, so "I kept that last week" is
 *    how you find it — which is how anyone actually looks for a saved thing.
 *
 *  · Every filing here prints SAVED, lit. Tapping it unsaves, and the entry
 *    leaves the page it no longer belongs on.
 */
add('e1-saved', (
  <View style={p.screen}>
    <TopNavBar />
    <NavSpace />
    <PaperChrome onArchive={() => {}} section="ALL" />
    <PaperSheet>
      <RunningHead date={TODAY} dayLabel="" sort="LATEST" saved title="SAVED · 34" />
      <DayDivider label="WEDNESDAY, AUGUST 28" />
      <PaperPost kind="take" order="21:12" orderIs="hour" author={MIRA} measureWidth={COL} film={TOKYO}
        body="Tokyo Story is the only film that has ever made me telephone my mother the same night."
        certifyCount={214} commentCount={31} saved />
      <PaperPost kind="dossier" order="16:40" orderIs="hour" author={ANA} measureWidth={COL} film={TOKYO}
        body="The Long Silence in Ozu" series={partOf(2, 'Ozu, in four parts').printed}
        readTime="12 MIN" certifyCount={61} commentCount={14} saved />
      <DayDivider label="SATURDAY, AUGUST 23" />
      <PaperPost kind="seeking" order="09:58" orderIs="hour" author={SAJAD} measureWidth={COL}
        body="something to watch after a funeral. No irony, no uplift. I have three hours."
        certifyCount={47} commentCount={22} saved />
    </PaperSheet>
  </View>
));

add('e2-saved-empty', (
  <View style={p.screen}>
    <TopNavBar />
    <NavSpace />
    <PaperChrome onArchive={() => {}} section="ALL" />
    <PaperSheet>
      <RunningHead date={TODAY} dayLabel="" sort="LATEST" saved title="SAVED" />
      {/* No button. There is no act to perform on a page of things you have not
          kept yet — the act is a bookmark on a filing, somewhere else. Offering
          a control here would be offering a door that opens onto this room. */}
      <PaperEmpty title="Nothing is kept."
        body="The bookmark on any filing keeps it here."
        quiet="NO ONE IS TOLD WHAT YOU KEEP" />
    </PaperSheet>
  </View>
));

// ══ B · THE FORMS ═══════════════════════════════════════════════════════════
add('b1-seeking-answered', (
  <View style={p.screen}>
    <PaperSheet top>
      <PaperPost kind="seeking" order="20:15" orderIs="hour" author={SAJAD} measureWidth={COL}
        body="something to watch after a funeral. No irony, no uplift. I have three hours."
        answer={{ film: COME, body: 'Two hours and twenty minutes, and you will not want company afterwards. That is the point.', author: MIRA }}
        answered certifyCount={47} commentCount={22} />
    </PaperSheet>
  </View>
));

const OPTS = [
  { ...film('The Third Man', 1949, 'Carol Reed'), votes: 194 },
  { ...film('Stalker', 1979, 'Tarkovsky'), votes: 128 },
  { ...film('12 Angry Men', 1957, 'Lumet'), votes: 90 },
];

add('b2-ballot-open', (
  <View style={p.screen}>
    <PaperSheet top>
      <PaperBallot question="Which do we project tonight?" author={ANA}
        options={OPTS} closesLabel="closes in 2 days" certifyCount={8} commentCount={22} />
    </PaperSheet>
  </View>
));

add('b3-ballot-voted', (
  <View style={p.screen}>
    <PaperSheet top>
      <PaperBallot question="Which do we project tonight?" author={ANA}
        options={OPTS} myVote={0} closesLabel="closes in 2 days" certifyCount={8} commentCount={22} />
    </PaperSheet>
  </View>
));

add('b4-ballot-closed', (
  <View style={p.screen}>
    <PaperSheet top>
      <PaperBallot question="Which do we project tonight?" author={ANA}
        options={OPTS} myVote={0} closed closesLabel="" certifyCount={8} commentCount={22} />
    </PaperSheet>
  </View>
));

add('b5-dossier', (
  <View style={p.screen}>
    <PaperSheet top>
      {/* A credit that agrees with its headline (an essay on Ozu, on an Ozu film). */}
      <PaperPost kind="dossier" order="14:20" orderIs="hour" author={ANA} measureWidth={COL} still film={TOKYO}
        body="The Long Silence in Ozu" series={partOf(2, 'Ozu, in four parts').printed}
        readTime="12 MIN" certifyCount={61} commentCount={14} certified />
    </PaperSheet>
  </View>
));

add('b6-states', (
  <View style={p.screen}>
    <PaperSheet top>
      <PaperPost kind="take" order="21:40" orderIs="hour" author={ANA} measureWidth={COL} film={CACHE}
        body="—" spoiler="This discusses the ending of Cache" certifyCount={9} commentCount={3} />
      <PaperPost kind="take" order="18:03" orderIs="hour" author={DAN} measureWidth={COL} withheld
        body="Every Marvel film since 2019 has been the same film with different weather." />
      {/* Both tombstones: withdrawn by its author, struck by the house. Never one sentence. */}
      <PaperPost kind="take" order="—" orderIs="count" author={null} measureWidth={COL} ended="author"
        body="" commentCount={200} />
      <PaperPost kind="take" order="—" orderIs="count" author={null} measureWidth={COL} ended="house"
        body="" commentCount={41} />
      <PaperPost kind="take" order="09:11" orderIs="hour" author={MIRA} measureWidth={COL} edited film={CHUNGKING}
        body="Chungking Express gets better every year." certifyCount={9} />
    </PaperSheet>
  </View>
));

// ══ C · CRITIQUES AT SCALE ══════════════════════════════════════════════════
const CRITS: Critique[] = [
  { id: '1', author: SAM, body: 'Barry Lyndon says hello. That film is nothing but warmth held at arm\u2019s length, and it is the warmest thing he ever shot.', certifyCount: 148, certified: true, age: '40 MIN' },
  { id: '2', author: MIRA, body: 'Cold is not the same as unfeeling.', certifyCount: 31, age: '1 HR' },
  { id: '3', author: null, body: 'The maze was built in a car park in Hertfordshire and it still frightens me.', certifyCount: 12, age: '2 HR' },
];

add('c1-critiques-scale', (
  <View style={p.screen}>
    <CritiqueSpine kind="TAKE" opening={LONGEST} count={5218} />
    <PaperSheet>
      <CritiqueHead count={5218} order="CERTIFIED" />
      {CRITS.map((c, i) => <PaperCritiqueRow key={c.id} c={c} top={i === 0} />)}
      <CritiqueFooter shown={30} total={5218} onMore={NOOP} />
    </PaperSheet>
    <PostDock certifyCount={2140} commentCount={5218} certified />
  </View>
));

add('c2-critiques-composing', (
  <View style={p.screen}>
    <CritiqueSpine kind="TAKE" opening={LONGEST} count={5218} />
    <PaperSheet>
      <CritiqueHead count={5218} order="NEWEST" />
      <PaperCritiqueRow c={{ id: 'mine', author: ANA, body: 'Filed a moment ago, sitting at the top of NEWEST where I can see it.', certifyCount: 0, age: 'NOW', mine: true }} />
      {CRITS.slice(0, 2).map((c) => <PaperCritiqueRow key={c.id} c={c} />)}
    </PaperSheet>
    <CritiqueComposer me={ANA} />
  </View>
));

add('c3-answers-seeking', (
  <View style={p.screen}>
    <CritiqueSpine kind="SEEKING" opening="something to watch after a funeral. No irony, no uplift. I have three hours." count={22} />
    <PaperSheet>
      <CritiqueHead count={22} order="CERTIFIED" />
      <PaperCritiqueRow canTake top c={{ id: 'a1', author: MIRA, film: COME, body: 'Two hours twenty, and you will not want company afterwards. That is the point.', certifyCount: 61, certified: true, age: '3 HR' }} />
      <PaperCritiqueRow canTake c={{ id: 'a2', author: SAM, film: STALKER, body: 'Not what you asked for. Put it on anyway.', certifyCount: 8, age: '4 HR' }} />
      <CritiqueFooter shown={22} total={22} onMore={NOOP} />
    </PaperSheet>
    <PostDock certifyCount={47} commentCount={22} />
  </View>
));

// ══ F · EVERYTHING ELSE THE PAGE TOUCHES ════════════════════════════════════
add('f1-picker', (
  <View style={p.screen}>
    <TopNavBar />
    <NavSpace />
    <PaperChrome onArchive={() => {}} section="ALL" />
    <PaperSheet>
      <RunningHead date={TODAY} dayLabel="WEDNESDAY, AUGUST 28" sort="LATEST" />
      <PaperPost kind="take" order="21:40" orderIs="hour" author={DAN} measureWidth={COL}
        body="tbh Odyssey was bad" film={LOST} commentCount={31} certifyCount={4} />
      <PaperPost kind="seeking" order="20:15" orderIs="hour" author={SAJAD} measureWidth={COL}
        body="any good horror movies? nothing with gore" commentCount={12} />
    </PaperSheet>
    {/* The scrim is the page still being there, dimmed — you are choosing a form
        for the paper you can see behind it, not leaving for a different app. */}
    <View style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, backgroundColor: 'rgba(6,5,3,0.72)' }} />
    <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0 }}>
      {/* `onRules`, as the app passes it: an optional prop left off is a screen it lacks. */}
      <PaperPicker onRules={() => {}} />
    </View>
  </View>
));

// The door is a screen on the way to the writing room, not the feed's empty state: a new
// member READS from the first minute; the door stands only between them and FILING.
add('f2-door', (
  <View style={p.screen}>
    <PaperBack label="THE DISPATCH" />
    <View style={{ flex: 1, justifyContent: 'center' }}>
      <PaperDoor films={3} filmsNeeded={5} days={1} daysNeeded={2} />
    </View>
  </View>
));

/**
 * The rules page scrolls in the app (its clauses outrun a screen at any size),
 * so the plate is a scroll view too: the top of a page, not a page cut off.
 */
add('f3-house-rules', (
  <View style={p.screen}>
    <PaperBack label="THE HOUSE RULES" />
    <ScrollView contentContainerStyle={{ flexGrow: 1 }}>
      <PaperSheet><PaperRules /></PaperSheet>
    </ScrollView>
  </View>
));

// The archive BEFORE a film is chosen: the list of films the house has written about
// (`f4-archive` draws the result).
add('f4b-archive-search', (
  <View style={p.screen}>
    <PaperBack label="THE ARCHIVE" />
    <PaperSheet>
      <PaperArchive query="tarkov" film={null}>
        <ArchiveFilm film={STALKER} filings={41} />
        <ArchiveFilm film={film('Solaris', 1972, 'Tarkovsky')} filings={12} />
        <ArchiveFilm film={film('Mirror', 1975, 'Tarkovsky')} filings={3} />
        <ArchiveFilm film={film('Andrei Rublev', 1966, 'Tarkovsky')} filings={1} />
      </PaperArchive>
    </PaperSheet>
  </View>
));

add('f4-archive', (
  <View style={p.screen}>
    <PaperBack label="THE ARCHIVE" />
    <PaperSheet>
      <PaperArchive query="Stalker" film={STALKER} count={41} span="2019–2026">
        <PaperPost kind="take" order="2.1K" orderIs="count" author={ANA} measureWidth={COL}
          body={LONGEST} certifyCount={2140} commentCount={61} certified />
          <PaperPost kind="seeking" order="88" orderIs="count" author={SAM} measureWidth={COL}
          body="Is Stalker the one to start Tarkovsky on, or the one to end on?"
          certifyCount={88} commentCount={31} />
      </PaperArchive>
    </PaperSheet>
  </View>
));

add('f5-member-room', (
  <View style={p.screen}>
    {/* The bar names whose room this is. The house NUMBER is not repeated here —
        the room's own head prints it, one line under the name, and a screen
        that says `No. 17` twice in its top forty points is a screen shouting a
        serial at you. */}
    <PaperBack label="ANA" />
    <PaperSheet>
      {/* The way out to the member file, as the app passes it. */}
      <PaperRoom author={ANA} filed={128} certified={4102} onFile={() => {}} />
      {/* The month AND the year. A room runs back through everything a member
          has ever filed, so `AUGUST` alone names two different Augusts once the
          house is two years old. */}
      <DayDivider label="AUGUST 2026" />
      <PaperPost noByline kind="take" order="28" orderIs="day" author={ANA} measureWidth={COL} film={STALKER}
        body={LONGEST} certifyCount={2140} commentCount={61} certified />
      <PaperPost noByline kind="dossier" order="24" orderIs="day" author={ANA} measureWidth={COL} film={TOKYO}
        body="The Long Silence in Ozu" series={partOf(2, 'Ozu, in four parts').printed}
        readTime="12 MIN" certifyCount={61} commentCount={14} />
      <PaperPost noByline kind="wire" order="21" orderIs="day" author={ANA} measureWidth={COL} film={GODFATHER}
        source="bfi.org.uk"
        body="The restored NAPOLEON will tour eleven cities before it reaches any streaming service."
        certifyCount={31} commentCount={9} />
    </PaperSheet>
  </View>
));

add('f6-docket', (
  <View style={p.screen}>
    <PaperBack label="REPORTED · 7" />
    <PaperSheet>
      <PaperCase reports={9} reasons="Abuse · Off the film" kind="take" author={DAN} age="2 HR"
        body="Anyone who rates this above a two has never sat through a real film and I include the people who made it." />
      <PaperCase reports={5} reasons="Unmarked spoiler" kind="take" author={SAM} age="6 HR"
        body="The whole thing turns on the fact that he was dead the entire time, which everyone pretends not to have guessed." />
    </PaperSheet>
  </View>
));

/* The essay a card has to survive: 25,000 characters is the ceiling, so the
   opening below is deliberately longer than the card can hold. If the cut is
   working, this ends on a full stop and prints THE ESSAY CONTINUES. */
const OZU_OPENING =
  'There is a shot in Tokyo Story that lasts eleven seconds after everyone has ' +
  'left the frame, and for years I thought it was a mistake of the print. It is ' +
  'not. Ozu holds the room because the room is what the film is about — the house ' +
  'outlives the family that argued in it, and he wants you to feel the outliving ' +
  'rather than be told about it. The silence is not empty; it is the sound of a ' +
  'house at four in the afternoon, which is a sound most of us have heard and ' +
  'none of us have ever been asked to notice.';

add('f7-share-card', (
  <View style={[p.screen, { justifyContent: 'center', paddingHorizontal: 16 }]}>
    <DossierShareCard title="The Long Silence in Ozu" author={ANA}
      filed="24 AUGUST 2026" logo={LOGO_KEY} opening={OZU_OPENING} />
  </View>
));

// The same card at three proportions, each with the opening its measure supports.
add('r1-ratio-4x5', (
  <View style={[p.screen, { justifyContent: 'center', paddingHorizontal: 16 }]}>
    <DossierShareCard title="The Long Silence in Ozu" author={ANA}
      filed="24 AUGUST 2026" logo={LOGO_KEY} opening={OZU_OPENING} ratio={4 / 5} />
  </View>
));

add('r2-ratio-1x1', (
  <View style={[p.screen, { justifyContent: 'center', paddingHorizontal: 16 }]}>
    <DossierShareCard title="The Long Silence in Ozu" author={ANA}
      filed="24 AUGUST 2026" logo={LOGO_KEY} opening={OZU_OPENING} ratio={1} max={150} />
  </View>
));

add('r3-ratio-5x4', (
  <View style={[p.screen, { justifyContent: 'center', paddingHorizontal: 16 }]}>
    <DossierShareCard title="The Long Silence in Ozu" author={ANA}
      filed="24 AUGUST 2026" logo={LOGO_KEY} opening={OZU_OPENING} ratio={5 / 4} max={120} />
  </View>
));

/* The other end of the range: a long title that must shrink rather than break,
   and an opening short enough to fit whole — so the continuation mark must NOT
   appear. A card that claims an essay runs on when it does not is a card that
   lies about the writing. */
add('f7b-share-card-short', (
  <View style={[p.screen, { justifyContent: 'center', paddingHorizontal: 16 }]}>
    <DossierShareCard
      title="What the Camera Refuses to Do, and Why That Refusal Is the Whole Argument"
      author={MIRA} filed="11 AUGUST 2026" logo={LOGO_KEY}
      opening="Every frame Bresson cut is still in the film. You feel their absence the way you feel a missing stair." />
  </View>
));

// The share card against inputs chosen to BREAK it: the title ceiling, a script Rye
// cannot draw, no sentence end near the cut, a departed author. All real rows.
const S = (n: string, el: React.ReactNode) =>
  add(n, <View style={[p.screen, { justifyContent: 'center', paddingHorizontal: 16 }]}>{el}</View>);

/* The title ceiling is 200 characters. This is 197. */
const MAX_TITLE =
  'On the Long Silence in the Films of Yasujiro Ozu, and Why the Room Left Empty ' +
  'After Everyone Has Walked Out of It Is the Only Subject He Ever Really Had, ' +
  'Considered Across Four Decades of Work';

/* 380 characters without a single full stop — the fallback path, where the cut
   has no sentence to end on and must trim at a word instead. */
const NO_BREAK =
  'What Ozu understood, and what almost nobody working now seems willing to sit ' +
  'still long enough to find out, is that a room goes on existing after the people ' +
  'in it have gone, and that the camera which stays behind to watch it is not being ' +
  'slow or indulgent or difficult but is simply refusing to pretend otherwise';

S('s1-tiny', (
  <DossierShareCard title="Ozu" author={DAN} filed="3 MARCH 2026"
    logo={LOGO_KEY} opening="He never moved the camera. That was the argument." />
));

S('s2-max-title', (
  <DossierShareCard title={MAX_TITLE} author={ANA} filed="24 AUGUST 2026"
    logo={LOGO_KEY} opening={OZU_OPENING} />
));

S('s3-no-break', (
  <DossierShareCard title="A Room After Everyone Has Gone" author={MIRA}
    filed="1 JULY 2026" logo={LOGO_KEY} opening={NO_BREAK} />
));

S('s4-japanese', (
  <DossierShareCard title="東京物語について、あるいは空いた部屋" author={ANA}
    filed="24 AUGUST 2026" logo={LOGO_KEY} opening={OZU_OPENING} />
));

/* No photograph, and a four-figure member number. */
S('s5-no-avatar', (
  <DossierShareCard title="Leaving the Room Last" author={SAJAD}
    filed="18 JUNE 2026" logo={LOGO_KEY} opening={OZU_OPENING} />
));

/* The author closed their account. The essay survives; the name does not. */
S('s6-departed', (
  <DossierShareCard title="What the Camera Refuses to Do" author={null}
    filed="2 FEBRUARY 2026" logo={LOGO_KEY} opening={OZU_OPENING} />
));

/* The three states a lounge card outlives its filing into. A card is a COPY
   sitting in somebody else's room; when the filing ends, the copy has to end
   with it, or the withdrawal is a fiction. */
add('f8b-lounge-states', (
  <View style={[p.screen, { justifyContent: 'flex-end', paddingHorizontal: 16, paddingBottom: 34, gap: 10 }]}>
    <Text style={{ fontFamily: 'SpecialElite_400Regular', fontSize: 7.5, letterSpacing: 1.6, color: '#9E9488', marginBottom: 2 }}>
      WHEN THE FILING IS GONE, OR ITS AUTHOR IS
    </Text>
    <LoungeCard kind="take" author={null} certifyCount={88} commentCount={12}
      body="Every frame Bresson cut is still in the film. You feel their absence the way you feel a missing stair." />
    <LoungeCard kind="dossier" author={ANA} certifyCount={0} commentCount={0} ended="author"
      title="The Long Silence in Ozu" body="" />
    <LoungeCard kind="take" author={SAM} certifyCount={0} commentCount={0} ended="house" body="" />
  </View>
));

/* ── THE CARD WHERE IT ACTUALLY LIVES ────────────────────────────────────────
   Every judgement of the lounge card so far has been made with it alone on a
   ground, which is the one place it will never appear. In a room it sits among
   other people's messages, under a name, in a column it has to hold its own in
   without shouting over the conversation around it. */
const Said = ({ who, text, mine }: { who: string; text: string; mine?: boolean }) => (
  <View style={{ alignSelf: mine ? 'flex-end' : 'flex-start', maxWidth: '82%', marginBottom: 10 }}>
    {!mine && (
      <Text style={{ fontFamily: 'SpecialElite_400Regular', fontSize: 7.5, letterSpacing: 1.4,
        color: '#9E9488', marginBottom: 4 }}>{who}</Text>
    )}
    <View style={{
      backgroundColor: mine ? 'rgba(184,137,26,0.12)' : 'rgba(28,24,18,0.72)',
      borderRadius: 3, paddingVertical: 9, paddingHorizontal: 12,
      borderWidth: 1, borderColor: mine ? 'rgba(184,137,26,0.24)' : 'rgba(184,137,26,0.10)',
    }}>
      {/* A token, not a hex: the colour audit cannot tell a fixture from the design. */}
      <Text style={{ fontFamily: 'CourierPrime_400Regular', fontSize: 12.5, lineHeight: 19,
        color: '#E8DFD0' }}>{text}</Text>
    </View>
  </View>
);

add('f8c-lounge-in-room', (
  <View style={[p.screen, { justifyContent: 'flex-end', paddingHorizontal: 16, paddingBottom: 34 }]}>
    {/* Names only over a message, as over a post: no serial on every line said. */}
    <Said who="DAN" text="did anyone actually finish the Ozu run or was that just me" />
    <Said who="MIRA" text="i got three in. the fourth broke me" />
    <View style={{ alignSelf: 'flex-start', maxWidth: '92%', marginBottom: 10 }}>
      <Text style={{ fontFamily: 'SpecialElite_400Regular', fontSize: 7.5, letterSpacing: 1.4,
        color: '#9E9488', marginBottom: 4 }}>ANA · SHARED A FILING</Text>
      <LoungeCard kind="dossier" author={ANA} certifyCount={61} commentCount={14}
        title="The Long Silence in Ozu"
        body="There is a shot in Tokyo Story that lasts eleven seconds after everyone has left the frame." />
    </View>
    <Said who="DAN" text="oh this is the one. reading it now" />
    <Said mine who="" text="the eleven seconds thing ruined me honestly" />
  </View>
));

// Exactly MAX_LENGTHS.username (30), beside a title too long for the bubble: both of
// the card's variable lengths at their worst together.
const MAXNAME: PaperAuthor = {
  name: 'Katharine-Wentworth-Ashgrovely', memberNo: 10248,
  tier: 'archivist', avatar: artPath('Setsuko Hara'),
};

add('f8d-lounge-long-name', (
  <View style={[p.screen, { justifyContent: 'flex-end', paddingHorizontal: 16, paddingBottom: 34, gap: 10 }]}>
    <LoungeCard kind="take" author={MAXNAME} certifyCount={2100} commentCount={318}
      body="Tokyo Story is the only film that has ever made me telephone my mother the same night." />
    <LoungeCard kind="wire" author={MAXNAME} certifyCount={44} commentCount={6}
      source="The British Film Institute"
      body="All six Apu films restored, touring from October." />
    <LoungeCard kind="dossier" author={MAXNAME} certifyCount={61} commentCount={14}
      title="On the Long Silence in the Films of Yasujiro Ozu, and the Room Left Empty"
      body="There is a shot in Tokyo Story that lasts eleven seconds after everyone has left the frame." />
  </View>
));

/* The kind-aware share sheet: a dossier is offered a card, a take is not. */
add('h8-share-dossier', (
  <View style={[p.screen, { justifyContent: 'flex-end' }]}>
    <View style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, backgroundColor: 'rgba(6,5,3,0.72)' }} />
    <ShareSheet card preview={
      <LoungeCard kind="dossier" author={ANA} certifyCount={61} commentCount={14}
        title="The Long Silence in Ozu"
        body="There is a shot in Tokyo Story that lasts eleven seconds after everyone has left the frame." />
    } />
  </View>
));

/* The story export: the SAME card on a 9:16 ground, inside the band Instagram
   and TikTok leave alone. Not a second layout. */
add('f7c-share-story', (
  <View style={[p.screen, { justifyContent: 'center', alignItems: 'center' }]}>
    <StoryFrame width={300}>
      <DossierShareCard title="The Long Silence in Ozu" author={ANA}
        filed="24 AUGUST 2026" logo={LOGO_KEY} opening={OZU_OPENING} width={358} />
    </StoryFrame>
  </View>
));

/* Every kind travels into a lounge — that is pointing at something, not a
   poster of yourself — so all five are drawn, stacked, to check the kind's ink
   still reads at bubble size and the meta line holds at one line for each. */
add('f8-lounge-card', (
  <View style={[p.screen, { justifyContent: 'flex-end', paddingHorizontal: 16, paddingBottom: 34, gap: 10 }]}>
    <Text style={{ fontFamily: 'SpecialElite_400Regular', fontSize: 7.5, letterSpacing: 1.6, color: '#9E9488', marginBottom: 2 }}>
      MIRA · SHARED A FILING
    </Text>
    <LoungeCard kind="take" author={MIRA} certifyCount={214} commentCount={31}
      body="Tokyo Story is the only film that has ever made me telephone my mother the same night." />
    <LoungeCard kind="seeking" author={DAN} certifyCount={9} commentCount={22} answered
      body="Where do I start with Ozu? I have two evenings and no idea which door to open." />
    <LoungeCard kind="wire" author={SAM} certifyCount={44} commentCount={6} source="The BFI"
      body="All six Apu films restored, touring from October." />
    <LoungeCard kind="ballot" author={ANA} certifyCount={78} commentCount={41}
      result="In the Mood for Love"
      body="Which Wong Kar-wai should the house watch together this month?" />
    <LoungeCard kind="dossier" author={ANA} certifyCount={61} commentCount={14}
      title="The Long Silence in Ozu"
      body="There is a shot in Tokyo Story that lasts eleven seconds after everyone has left the frame." />
  </View>
));

// ══ H · THE ESSAY, AND THE FORMS THAT HAD NO DESK ═══════════════════════════
add('h1-essay-read', (
  <View style={p.screen}>
    <PaperBack label="ESSAY" />
    <PaperSheet>
      <EssayHead title="The Long Silence in Ozu" series={partOf(2, 'Ozu, in four parts')}
        author={ANA} readTime="12 MIN" filed="AUGUST 24" film={TOKYO} />
      <EssayOpening text="There is a shot in Tokyo Story that lasts eleven seconds after everyone has left the frame, and for years I thought it was a mistake of the print." />
      <EssayPara>
        It is not. Ozu holds the room because the room is what the film is about —
        the house outlives the family that argued in it, and he wants you to feel
        the outliving rather than be told about it.
      </EssayPara>
      <EssayBreak />
      <EssayPara>
        The silence is not empty. It is the sound of a house at four in the
        afternoon, which is a sound most of us have heard and none of us have
        ever been asked to notice.
      </EssayPara>
      <EssayNext label="NEXT IN THE SERIES" title="What the Camera Refuses to Do" readTime="9 MIN" />
    </PaperSheet>
    <PostDock certifyCount={61} commentCount={14} certified />
  </View>
));

/**
 * ── THE SHAPES A MEMBER CAN ACTUALLY TYPE ───────────────────────────────────
 * h1 above hand-builds its paragraphs with EssayPara, so it draws the essay's
 * TYPE but never the path a real dossier takes: `EssayBody`, and the markdown
 * renderer inside it. Nothing in the set drew a heading, a quotation, a list or
 * a fenced block — which is how seven shapes came to scale with no ceiling at
 * all and no plate showed it.
 *
 * The toolbar offers bold, italic, heading, quote, rule and link. Markdown is
 * plain text, so a list, a table and a fenced block are typed regardless — and
 * all of them are here for that reason.
 */
add('h1b-essay-markdown', (
  <View style={p.screen}>
    <PaperBack label="ESSAY" />
    <PaperSheet>
      <EssayHead title="What the Camera Refuses to Do" author={ANA}
        readTime="9 MIN" filed="AUGUST 26" />
      <EssayBody text={[
        'Ozu keeps the camera at the height of somebody kneeling, and he keeps it there after the room has emptied.',
        '## THE THREE REFUSALS',
        'He will not move it, he will not cut early, and he will not tell you what to feel about either.',
        '> The house outlives the family that argued in it.',
        '- No pan, no track, no crane.',
        '- The cut comes late, and always after the thought.',
        '- Nobody looks at the lens.',
        'A shot in *Tokyo Story* runs eleven seconds past its own ending, and the [restoration notes](https://example.com/notes) call it an error of the print.',
        '### A NOTE ON THE PRINTS',
        'It is not an error.',
      ].join('\n\n')} />
    </PaperSheet>
    <PostDock certifyCount={38} commentCount={9} />
  </View>
));

add('h2-series', (
  <View style={p.screen}>
    <PaperBack label="A SERIES" />
    <PaperSheet>
      <SeriesList title="Ozu, in four parts" author={ANA} parts={[
        { n: 'I', title: 'The Low Camera', readTime: '8 MIN', certified: 412 },
        { n: 'II', title: 'The Long Silence in Ozu', readTime: '12 MIN', certified: 61, current: true },
        { n: 'III', title: 'What the Camera Refuses to Do', readTime: '9 MIN', certified: 88 },
        { n: 'IV', title: 'Leaving the Room Last', toCome: true },
      ]} />
    </PaperSheet>
  </View>
));

add('h3-desk-wire', (
  /* a screenshot: nothing to do, said out loud rather than left out */
  <WireDesk onBack={() => {}} onFile={() => {}} me={ANA} hour="23:41" source="bfi.org.uk"
    headline="NAPOLEON restored, and touring"
    body="The restored NAPOLEON will tour eleven cities before it reaches any streaming service." />
));

add('h4-desk-ballot', (
  <BallotDesk onBack={() => {}} onFile={() => {}} me={ANA} hour="18:02" question="Which do we project tonight?" closes="2 DAYS"
    options={[
      film('The Third Man', 1949, 'Carol Reed'),
      film('Stalker', 1979, 'Tarkovsky'),
      null, null,
    ]} />
));

add('h5-desk-dossier', (
  <DossierDesk onBack={() => {}} onFile={() => {}} title="The Long Silence in Ozu" words={2140} series={partOf(2, 'Ozu, in four parts').printed}
    body="There is a shot in Tokyo Story that lasts eleven seconds after everyone has left the frame, and for years I thought it was a mistake of the print. It is not. Ozu holds the room because the room is what the film is about." />
));

add('h6-film-finder', (
  <View style={[p.screen, { justifyContent: 'flex-end' }]}>
    <View style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, backgroundColor: 'rgba(6,5,3,0.72)' }} />
    <FilmFinder query="tarkov" results={[STALKER, film('Solaris', 1972, 'Tarkovsky'), film('Mirror', 1975, 'Tarkovsky')]} />
  </View>
));

add('h8-share', (
  <View style={[p.screen, { justifyContent: 'flex-end' }]}>
    <View style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, backgroundColor: 'rgba(6,5,3,0.72)' }} />
    {/* The preview the APP passes: two lines of the filing's own words. */}
    <ShareSheet preview={
      <Text style={p.sharePreview} numberOfLines={2}>
        Tokyo Story is the only film that has ever made me telephone my mother
        the same night.
      </Text>
    } />
  </View>
));

// ══ G · WHEN IT GOES WRONG ══════════════════════════════════════════════════
add('g1-wire-down', (
  <View style={p.screen}>
    <TopNavBar />
    <NavSpace />
    <PaperChrome onArchive={() => {}} section="ALL" />
    <PaperSheet>
      <RunningHead date={TODAY} dayLabel="WEDNESDAY, AUGUST 28" sort="LATEST" />
      {/* The failure is a state of the PAGE, so it is drawn as the page: the
          same ruling, the same notice, the same one brass act. Nothing here is
          special-cased, which is why it cannot look like a crash. */}
      <PaperEmpty title="The wire is down."
        body="The house is still here. The connection is not."
        action="TRY AGAIN" quiet="WHAT YOU SAVED IS STILL READABLE"
        /* a screenshot: nothing to do, said out loud rather than left out */
        onAction={() => {}} />
    </PaperSheet>
  </View>
));

add('g2-not-sent', (
  <View style={p.screen}>
    <TopNavBar />
    <NavSpace />
    <PaperChrome onArchive={() => {}} section="ALL" />
    <PaperSheet>
      <RunningHead date={TODAY} dayLabel="WEDNESDAY, AUGUST 28" sort="LATEST" />
      <PaperPost pending kind="take" order="21:46" orderIs="hour" author={ANA} measureWidth={COL} film={CHUNGKING}
        body="Chungking Express gets better every year and I no longer trust anyone who disagrees." />
      <PaperPost kind="take" order="21:40" orderIs="hour" author={DAN} measureWidth={COL}
        body="tbh Odyssey was bad" film={LOST} commentCount={31} certifyCount={4} />
      <PaperPost kind="seeking" order="20:15" orderIs="hour" author={SAJAD} measureWidth={COL}
        body="any good horror movies? nothing with gore" commentCount={12} />
    </PaperSheet>
  </View>
));

add('g3-new-filings', (
  <View style={p.screen}>
    <TopNavBar />
    <NavSpace />
    <PaperChrome onArchive={() => {}} section="ALL" />
    <View style={{ flex: 1, minHeight: 0 }}>
      <PaperSheet>
        {/* The room the pill sits in. In the app this is the list's own top
            padding while filings are held, not a spacer view. */}
        <View style={{ height: NEW_FILINGS_ROOM }} />
        <PaperPost kind="take" order="19:02" orderIs="hour" author={MIRA} measureWidth={COL} film={TOKYO}
          body="Tokyo Story is the only film that has ever made me telephone my mother the same night."
          certifyCount={214} commentCount={31} saved />
          <PaperPost kind="wire" order="18:41" orderIs="hour" author={ANA} measureWidth={COL} film={GODFATHER}
          source="bfi.org.uk"
          body="The restored NAPOLEON will tour eleven cities before it reaches any streaming service."
          certifyCount={31} commentCount={9} />
      </PaperSheet>
      <NewFilings count={7} />
    </View>
  </View>
));

// ══ D · WRITING ═════════════════════════════════════════════════════════════
add('d1-composer-take', (
  <PaperComposer kind="take" me={ANA} hour="21:40" film={STALKER} remaining={246}
    body="Stalker is not slow, it is patient, and there is a difference nobody making films today seems to understand any more." />
));

/* ── THE ＋ GAINS A THIRD ACT ────────────────────────────────────────────────
   The picker's own comment claimed "the brass ＋ opens this" — written without
   ever opening ConciergeButton.tsx, which has two rows and no Dispatch action.
   Both panes drawn here, in the Concierge's own measurements. */
/* ── A MEMBER WRITING RIGHT TO LEFT ──────────────────────────────────────────
   The app detects the direction of each piece of member writing and sets that
   piece accordingly — in eight component files, and in none of the Dispatch's.
   Drawn here so the rule is looked at rather than asserted: the writing turns,
   the lead-in and the ordering margin do not, because those are the house
   speaking and the house speaks left to right. */
add('y0-rtl', (
  <View style={p.screen}>
    <PaperSheet top>
      <PaperPost kind="take" order="22:15" orderIs="hour" author={ANA} measureWidth={COL} film={TOKYO}
        certifyCount={64} commentCount={11}
        body="لا شيء في السينما اليابانية يضاهي تلك اللحظة التي تبقى فيها الغرفة فارغة بعد خروج الجميع." />
      <PaperPost kind="seeking" order="21:02" orderIs="hour" author={SAJAD} measureWidth={COL}
        commentCount={4}
        body="من أين أبدأ مع أوزو؟ عندي مساءان اثنان ولا أعرف أي باب أفتح." />
      <PaperPost kind="take" order="20:40" orderIs="hour" author={MIRA} measureWidth={COL} film={STALKER}
        certifyCount={9}
        body="Stalker is not slow, it is patient — and the difference is the whole film." />
    </PaperSheet>
  </View>
));

// The concierge card the app mounts (its "file" act routes to compose: `f1-picker`).
add('y1-concierge-acts', (
  <View style={[p.screen, { justifyContent: 'center', paddingHorizontal: 16 }]}>
    <ConciergeCard />
  </View>
));

// Every visual state a prop can switch on, drawn: a screen measures only the props it is given.
add('z1-composer-spoiler', (
  <PaperComposer kind="take" me={MIRA} hour="22:05" film={TOKYO} remaining={12} spoiler
    body="The ending of Tokyo Story only works because of what the father does NOT say on the last morning." />
));

add('z2-ballot-certified-saved', (
  <View style={p.screen}>
    <PaperSheet top>
      <PaperBallot question="Which do we project tonight?" author={ANA}
        options={OPTS} myVote={1} closesLabel="closes in 2 days"
        certifyCount={214} commentCount={22} certified saved />
    </PaperSheet>
  </View>
));

/* A ballot inside a member's room prints no kind label — the room already said
   what these are — so `showKind={false}` is a state the feed can never reach. */
add('z3-ballot-no-kind', (
  <View style={p.screen}>
    <PaperSheet top>
      <PaperBallot question="Which do we project tonight?" author={ANA}
        options={OPTS} closesLabel="closes in 2 days"
        certifyCount={8} commentCount={22} showKind={false} />
    </PaperSheet>
  </View>
));

add('z4-critiques-loading-more', (
  <View style={p.screen}>
    <View style={{ flex: 0, height: 59, backgroundColor: 'rgba(8,6,4,0.97)' }} />
    <CritiqueSpine kind="TAKE" count={5218}
      opening="Stalker is not slow, it is patient, and there is a difference nobody making films today seems to understand any more." />
    <PaperSheet>
      <CritiqueHead count={5218} order="NEWEST" />
      {CRITS.slice(0, 2).map((c) => <PaperCritiqueRow key={c.id} c={c} />)}
      <CritiqueFooter shown={30} total={5218} loading onMore={NOOP} />
    </PaperSheet>
    <PostDock certifyCount={2140} commentCount={5218} certified saved />
  </View>
));

add('d2-composer-seeking', (
  <PaperComposer kind="seeking" me={SAJAD} hour="20:15" remaining={38}
    body="any good horror movies? nothing with gore, nothing with jump scares, something that actually gets under the skin and stays there for a week afterwards" />
));

/* ── THE NARROW SCREEN, BEYOND THE FEED ──────────────────────────────────────
 * `t2-iphone-se` drew the FEED at 320pt and nothing else did. The reader, the
 * ballot, the critiques, a desk and the series list — five whole surfaces — had
 * only ever been measured at 390, on the tacit assumption that a single column
 * narrows cleanly.
 *
 * It does not, everywhere: a row with two things in it and no room to shrink is
 * the shape that breaks, and every one of these has at least one. The longest
 * available strings are used deliberately — the point of a narrow draw is the
 * worst case, not a representative one.
 */
add('t5-se-reader', (
  <View style={[p.screen, { width: SE }]}>
    <PaperBack label="ESSAY" onMore={NOOP} />
    <PaperSheet>
      <EssayHead title="The Long Silence in Ozu, and What the House Remembers"
        series={partOf(2, 'Ozu, in four parts')}
        author={LONGNAME} readTime="12 MIN" filed="AUGUST 24" film={TOKYO} />
      <EssayOpening text="There is a shot in Tokyo Story that lasts eleven seconds after everyone has left the frame, and for years I thought it was a mistake of the print." />
      <EssayPara>
        It is not. Ozu holds the room because the room is what the film is about.
      </EssayPara>
      <EssayNext label="NEXT IN THE SERIES" title="What the Camera Refuses to Do" readTime="9 MIN" onPress={NOOP} />
    </PaperSheet>
    <PostDock certifyCount={2140} commentCount={5218} certified />
  </View>
));

add('t6-se-ballot', (
  <View style={[p.screen, { width: SE }]}>
    <PaperSheet top>
      <PaperBallot question="Which do we project tonight, and why that one?" author={LONGNAME}
        options={OPTS} myVote={0} closesLabel="closes in 2 days"
        certifyCount={2140} commentCount={5218} />
    </PaperSheet>
  </View>
));

add('t7-se-critiques', (
  <View style={[p.screen, { width: SE }]}>
    <CritiqueSpine kind="TAKE" opening={LONGEST} count={5218} />
    <PaperSheet>
      <CritiqueHead count={5218} order="CERTIFIED" />
      {CRITS.map((c, i) => <PaperCritiqueRow key={c.id} c={c} top={i === 0} />)}
      <CritiqueFooter shown={30} total={5218} onMore={NOOP} />
    </PaperSheet>
    <PostDock certifyCount={2140} commentCount={5218} certified saved />
  </View>
));

add('t8-se-series', (
  <View style={[p.screen, { width: SE }]}>
    <PaperBack label="SERIES" />
    <PaperSheet>
      <SeriesList title="Ozu, in four parts" author={LONGNAME} parts={[
        { n: 'I', title: 'The Low Camera', readTime: '8 MIN', certified: 412 },
        { n: 'II', title: 'The Long Silence in Ozu, and What the House Remembers', readTime: '12 MIN', certified: 61, current: true },
        { n: 'III', title: 'What the Camera Refuses to Do', readTime: '9 MIN', certified: 88 },
      ]} />
    </PaperSheet>
  </View>
));

// The desk is a screen: `flex: 1` all the way down. In a frame with no height
// the phone would give it none (Yoga lets a `flex: 1` box in a content-sized
// frame collapse to its padding); the browser hid that by sizing to content.
// It is drawn in an SE's own screen, 320 × 568 (yoga-parity found it).
add('t9-se-desk', (
  <View style={{ width: SE, height: HEIGHT_AT[SE] }}>
    <PaperComposer kind="wire" me={LONGNAME} hour="21:40" remaining={40}
      source="Sight & Sound, the 2032 poll" ready
      body="The poll has been redone and the top ten has changed for the first time in a decade." />
  </View>
));


describe('paper mockups', () => {
  it('renders every screen to html', () => {
    mkdirSync(OUT, { recursive: true });
    for (const [name, el] of out) {
      const r = render(el);
      writeFileSync(join(OUT, `${name}.html`), toHtml(r.toJSON(), { posters: IMAGES, local: LOCAL_ART }), 'utf8');
      r.unmount();
    }
    expect(out.length).toBeGreaterThan(15);
  });
});
