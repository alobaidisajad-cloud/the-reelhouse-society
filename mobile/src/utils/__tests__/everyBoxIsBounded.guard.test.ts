/**
 * EVERY BOX IS BOUNDED, AND SO IS EVERY SEARCH IT SENDS (P4.31).
 *
 * Six search and filter boxes took no limit (the search page, the Dispatch's film search, the
 * profile's shelf search, the room filters, the stacks search and the follow requests), and three
 * more besides (the stack editor's film search, the Dispatch desk's own, the tribunal's hours), and
 * the current password in Settings: a page pasted into one was sent whole as the search. Every
 * TextInput now holds a maxLength, read from each file's code (comments removed), or is listed here
 * with why; and the searches themselves are cut to SEARCH_MAX where they leave the app (the house's
 * own, through buildSearchPattern; the catalogue's, through tmdb.search), cut where a character
 * ends, so a 20,000-character paste asks for a phrase whatever box it came through.
 */
import { readCode } from '@/test-utils/readCode';
import { files, rel } from '@/test-utils/universe';
import { SEARCH_MAX } from '@/src/constants/inputLimits';
import { boundedSearch, buildSearchPattern, matchesSearch } from '@/src/utils/searchPattern';
import { tmdb } from '@/src/lib/tmdb';

jest.unmock('@/src/lib/tmdb');

/** Boxes with no maxLength of their own, and why each is bounded all the same. */
const REGISTER: Record<string, { boxes: number; why: string; proof?: RegExp }> = {
  'app/dispatch/compose.tsx': {
    boxes: 1,
    why: 'the essay: past its 25,000 the counter turns and the seal refuses (filingEssay); a cut paste would lose the member\'s words unseen',
    proof: /isOverLimit\(trimmed, 'filingEssay'\)/,
  },
  'src/components/dispatch/paper/PaperComposer.tsx': {
    boxes: 1,
    why: 'a filing\'s body: the member finishes the sentence and is told by how much it is over, rather than losing its end mid-word; the desk refuses to file it over',
    proof: /remaining >= 0/,
  },
  'src/components/ControlledInput.tsx': {
    boxes: 2,
    why: 'a form field whose caller names its column\'s limit: the props require maxLength',
    proof: /interface ControlledInputProps extends TextInputProps \{[^}]*\bmaxLength: number;/,
  },
};

/** Each `<TextInput …>` element of a file, its props as written. */
function boxesIn(code: string): string[] {
  const out: string[] = [];
  for (let i = code.indexOf('<TextInput'); i >= 0; i = code.indexOf('<TextInput', i + 1)) {
    let j = i;
    let depth = 0;
    for (; j < code.length; j++) {
      const c = code[j];
      if (c === '{') depth++;
      else if (c === '}') depth--;
      else if (c === '>' && depth === 0) break;
    }
    const tag = code.slice(i, j);
    if (/^<TextInput\s/.test(tag)) out.push(tag);
  }
  return out;
}

const census = files('appCode', { ext: ['.tsx'] }).map(rel).map((f) => {
  const code = readCode(f);
  return { f, code, boxes: boxesIn(code) };
});

describe('every box', () => {
  it('finds the app\'s text boxes, the search page\'s among them', () => {
    expect(census.reduce((n, c) => n + c.boxes.length, 0)).toBeGreaterThan(30);
    expect(census.find((c) => c.f === 'app/(modals)/search-modal.tsx')?.boxes.length).toBeGreaterThan(0);
  });

  it('holds a maxLength, or is listed with why', () => {
    const unbounded = census.flatMap(({ f, boxes }) => {
      const open = boxes.filter((b) => !/\bmaxLength=/.test(b)).length;
      return open && REGISTER[f]?.boxes !== open ? [`${f}: ${open} with no maxLength`] : [];
    });
    expect(unbounded).toEqual([]);
  });

  it('lists none that is gone or now bounded, and each listed reason still holds', () => {
    for (const [f, entry] of Object.entries(REGISTER)) {
      const found = census.find((c) => c.f === f);
      expect(`${f}: ${found?.boxes.filter((b) => !/\bmaxLength=/.test(b)).length}`).toBe(`${f}: ${entry.boxes}`);
      if (entry.proof) expect(`${f}: ${entry.proof.test(found?.code ?? '')}`).toBe(`${f}: true`);
    }
  });
});

describe('every search, as it leaves the app', () => {
  const PASTE = 'x'.repeat(20_000);

  it('a 20,000-character paste asks the house for SEARCH_MAX characters', () => {
    expect(boundedSearch(PASTE)).toHaveLength(SEARCH_MAX);
    expect(buildSearchPattern(PASTE)).toHaveLength(SEARCH_MAX);
    // The room's own filter agrees with the server it re-filters: the same phrase.
    expect(matchesSearch(PASTE, 'x'.repeat(SEARCH_MAX))).toBe(true);
  });

  it('is cut where a character ends, never through one', () => {
    const family = '👨‍👩‍👧';
    const pasted = `${'x'.repeat(SEARCH_MAX - 2)}${family}${'y'.repeat(50)}`;
    expect(boundedSearch(pasted)).toBe('x'.repeat(SEARCH_MAX - 2));
    expect(boundedSearch('Casablanca')).toBe('Casablanca');
  });

  it('asks the catalogue for SEARCH_MAX characters of a 20,000-character paste', async () => {
    const asked: string[] = [];
    // The catalogue's path travels in the proxy's body.
    global.fetch = jest.fn(async (_url: unknown, init?: RequestInit) => {
      asked.push(String(init?.body ?? ''));
      return new Response(JSON.stringify({ results: [], total_results: 0, total_pages: 0, page: 1 }), { status: 200 });
    }) as unknown as typeof fetch;
    await tmdb.search(PASTE);
    expect(asked.length).toBeGreaterThan(0);
    const queries = asked.map((u) => /query=(x+)/.exec(decodeURIComponent(decodeURIComponent(u)))?.[1]?.length ?? 0);
    expect(Math.max(...queries)).toBe(SEARCH_MAX);
  });
});
