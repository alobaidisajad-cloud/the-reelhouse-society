/**
 * aCountSaysItsWord.guard.test.ts — no number printed straight before a plural word.
 * ─────────────────────────────────────────────────────────────────────────────
 * The Dispatch printed `1 CRITIQUES` until counted() (src/utils/counted.ts) decided between the
 * two forms; the Lounge's card went on printing `1 SEATS TAKEN`, and ten more places with it
 * (2026-10-21), because nothing held the rest of the app to it. A count before its word goes
 * through counted(), or decides the two forms on its own line (`=== 1 ?`), or stands here with
 * the reason it can never be one.
 */
import { join, relative } from 'path';
import { files as universe } from '@/test-utils/universe';
import { readCode } from '@/test-utils/readCode';

const MOBILE = join(__dirname, '..', '..', '..');
const NOUNS = [
  'films', 'seats', 'members', 'logs', 'stacks', 'comments', 'replies', 'votes', 'followers', 'entries', 'days', 'messages',
  'people', 'salons', 'filings', 'critiques', 'items', 'words', 'posts', 'reviews', 'times', 'hours', 'weeks', 'months',
  'years', 'minutes', 'seconds', 'nights', 'reels', 'ballots', 'essays', 'takes', 'notes', 'annotations', 'parts',
  'privileges', 'readers', 'pages', 'results', 'tickets', 'screenings', 'certifications', 'lists',
].join('|');
// a value in braces or in a template's ${…}, then its word: the content is code, never a quoted string
const COUNT_THEN_WORD = new RegExp(`(?:\\$\\{([^{}]+)\\}|\\{([^{}'"]+)\\})\\s*(${NOUNS})\\b`, 'i');
/** A line that decides the singular itself, on the line it prints on. */
const DECIDES = /counted\(|[=!]==\s*1\b|>\s*1\s*\?|<\s*2\s*\?/;

/** Each count that can never be one, by its file and the words it prints. */
const NEVER_ONE: Record<string, string> = {
  'src/components/profile/ProjectorRoom.tsx · ${run} nights': 'a run is drawn from two nights up (run >= 2)',
  'src/components/profile/ProjectorRoom.tsx · {run} NIGHTS': 'a run is drawn from two nights up (run >= 2)',
  'src/components/society/RankTicket.tsx · ${count} privileges': 'the count is a word, four or more, from the rank\'s list',
  'src/components/society/RankTicket.tsx · {count.toUpperCase()} PRIVILEGES': 'the count is a word, four or more, from the rank\'s list',
  'src/components/society/societyPricing.ts · ${FOUNDING.seats} MEMBERS': 'the founding seats, a constant of hundreds',
  'src/features/archive/archiveImport.ts · ${uniqueEntries.size} films': 'a fraction ("1 / 1 films matched"), read as a tally',
  'src/stores/notificationStore.ts · ${ids.length} items': 'a developer\'s log line, never shown',
  'src/utils/timeAgo.ts · ${days} DAYS': 'drawn only past YESTERDAY: two days up',
  'app/(modals)/list-modal.tsx · ${trueFilmCount} reels': 'said only of an index larger than the sheet can hold',
  'app/dispatch/series/[id].tsx · ${total} PARTS': 'said only when the series has more parts than the page shows (MOST_PARTS)',
  'app/year-in-cinema.tsx · ${stats.perMonth.toFixed(1)} entries': 'a decimal: "1.0 entries" is read as English is',
};

const code = universe('appCode').map((f) => ({ f: relative(MOBILE, f).split('\\').join('/'), text: readCode(f) }));
const found = code.flatMap(({ f, text }) => text.split(/\r?\n/).flatMap((line) => {
  if (DECIDES.test(line)) return [];
  const m = COUNT_THEN_WORD.exec(line);
  return m ? [`${f} · ${m[1] !== undefined ? `\${${m[1]}}` : `{${m[2]}}`} ${m[3]}`] : [];
}));

it('reads the app’s code — it is not passing on none', () => {
  expect(code.length).toBeGreaterThan(400);
  expect(code.some(({ f, text }) => f === 'src/utils/counted.ts' && /export function counted/.test(text))).toBe(true);
});

it('prints no count before its word but through counted(), or one that can never be one', () => {
  expect(found.filter((k) => !(k in NEVER_ONE))).toEqual([]);
});

it('and every count it lets stand is still printed', () => {
  // an allow-list nobody prunes is how the class came back
  expect(Object.keys(NEVER_ONE).filter((k) => !found.includes(k))).toEqual([]);
});
