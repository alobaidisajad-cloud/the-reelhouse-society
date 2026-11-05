/**
 * everyPageOfMembersWritingStrikes.guard.test.ts — every place the app draws
 * members' writing strikes the slurs for a member who turned on "Hide slurs"
 * (StruckWords, utils/slurs.ts).
 *
 * The places were found by reading every screen for the words members write
 * (reviews, pull quotes, companions, critiques, stacks' titles and notes,
 * filings, salons' words and names, profiles' names, bios and links). Each is
 * held here to the one way of striking: `useStruck` before the words are drawn
 * or measured, `saidStruck` where a label says them. A drawing site that loses
 * it, or a new one listed without it, fails by name. What a member types into
 * is never struck: no file here strikes a TextInput's value.
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import { stripComments } from '@/test-utils/readCode';

const ROOT = join(__dirname, '..', '..', '..');

/** Each file that draws members' writing, and what of it. */
const DRAWS: Record<string, string> = {
  'src/components/dispatch/paper/PaperPost.tsx': 'a filing: its words, source, series and spoiler line',
  'src/components/dispatch/paper/PaperCritiques.tsx': 'a filing’s critiques, and its spine',
  'src/components/dispatch/paper/PaperEssay.tsx': 'an essay’s title, series, opening, and a series’ parts',
  'src/components/dispatch/paper/PaperBallot.tsx': 'a ballot’s question',
  'src/components/dispatch/paper/PaperMore.tsx': 'an essay’s share card',
  'src/components/dispatch/EssayBody.tsx': 'an essay’s whole words, before they are read as markdown',
  'src/components/critique/CritiqueRow.tsx': 'a critique on a log or a stack',
  'src/components/feed/ActivityCard.tsx': 'a log’s review, pull quote and companion on the reel',
  'src/components/log/LogReviewBody.tsx': 'a log’s review and pull quote',
  'src/components/log/LogHero.tsx': 'who a log was watched with',
  'src/components/log/LogChronicle.tsx': 'a past viewing’s words and companion',
  'src/components/film/FilmReviews.tsx': 'a film’s reviews',
  'src/components/film/NitrateFileCard.tsx': 'a log’s share card',
  'src/components/profile/ProfileLedgerTab.tsx': 'a profile’s logs',
  'src/components/profile/ProfileListsTab.tsx': 'a profile’s stacks',
  'src/components/search/SearchResultRow.tsx': 'a log’s excerpt, a stack’s title and note, a member’s name in a result',
  'app/stacks/[id].tsx': 'a stack’s title and note',
  'app/lounge/[id].tsx': 'a salon’s words, the words answered, shared titles, its name',
  'src/components/lounge/JoinedLoungeCard.tsx': 'a salon’s name',
  'src/components/lounge/PublicLoungeCard.tsx': 'a salon’s name and description',
  'src/components/lounge/LoungeSettingsPanel.tsx': 'a salon’s name and description',
  'src/components/ShareToLoungeModal.tsx': 'the rooms’ names and what is shared, as the sheet names them',
  'app/user/[username].tsx': 'a member’s name, bio and link titles',
  'src/components/lobby/LobbyWall.tsx': 'the wall’s log, stack and filings, before any bill measures them',
};

/** Files that say members' words in a label, struck as `saidStruck` says them. */
const SAYS = [
  'src/components/dispatch/paper/PaperPost.tsx', 'src/components/dispatch/paper/PaperCritiques.tsx',
  'src/components/dispatch/paper/PaperEssay.tsx', 'src/components/feed/ActivityCard.tsx',
  'src/components/film/FilmReviews.tsx', 'src/components/profile/ProfileListsTab.tsx',
  'src/components/search/SearchResultRow.tsx', 'app/lounge/[id].tsx', 'src/components/lounge/JoinedLoungeCard.tsx',
  'src/components/lounge/PublicLoungeCard.tsx', 'app/user/[username].tsx',
  'src/components/lobby/FilingsBill.tsx', 'src/components/lobby/PairBills.tsx',
];

const code = (rel: string) => stripComments(readFileSync(join(ROOT, rel), 'utf8'), rel);

describe('every page of members’ writing strikes the slurs for a member who asked', () => {
  it.each(Object.entries(DRAWS))('%s strikes what it draws (%s)', (rel) => {
    expect(code(rel)).toMatch(/\buseStruck\(\)/);
  });

  it.each(SAYS)('%s says a struck word as struck', (rel) => {
    expect(code(rel)).toMatch(/\bsaidStruck\(/);
  });

  it('never strikes what a member types: no field is given struck words', () => {
    const typed = Object.keys(DRAWS).filter((rel) => /<TextInput\b[^>]*value=\{struck/.test(code(rel)));
    expect(typed).toEqual([]);
  });

  it('strikes only as it is drawn: the share sheet sends what was written', () => {
    const sheet = code('src/components/ShareToLoungeModal.tsx');
    expect(sheet).toContain('film_title: cardTitle(dossierTitle)');
    expect(sheet).not.toMatch(/cardTitle\(struck/);
  });
});
