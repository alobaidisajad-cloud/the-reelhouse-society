/**
 * searchWiring.guard.test.ts — batch 19
 * ─────────────────────────────────────
 * The escaper was correct and unreachable: five of six call sites wrapped its
 * output in quotes, which destroyed it. No unit test of the function could see
 * that, because the mistake lived at the CALL SITES.
 *
 * So this pins the call sites. It reads the shipped source, strips comments (so
 * prose about a rule cannot satisfy the rule), and asserts that every database
 * search goes through the one funnel in the one safe form — including any search
 * added after this was written.
 */
import * as fs from 'fs';
import * as path from 'path';

const SRC = path.join(__dirname, '..', '..');
const APP = path.join(__dirname, '..', '..', '..', 'app');

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === '__tests__' || entry.name === 'node_modules') continue;
      walk(full, out);
    } else if (/\.(ts|tsx)$/.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

const stripComments = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

const FILES = [...walk(SRC), ...walk(APP)].map(f => ({
  path: path.relative(path.join(SRC, '..'), f).replace(/\\/g, '/'),
  code: stripComments(fs.readFileSync(f, 'utf8')),
}));

describe('the quoted form is gone from every search', () => {
  it('no .or() interpolates a value inside double quotes for ilike', () => {
    // `ilike."%…%"` is the exact shape whose escape PostgREST swallowed.
    const offenders = FILES.filter(f => /ilike\."%/.test(f.code)).map(f => f.path);
    expect(offenders).toEqual([]);
  });

  it('the funnel never doubles a quote to escape it', () => {
    // Doubling re-opened PostgREST's quoted value; a crafted term then injected
    // a second predicate and returned every row.
    //
    // Scoped to the funnel ON PURPOSE. Doubling a quote is CORRECT elsewhere:
    // csv.ts does it because that is the CSV escape, and the keyset cursors
    // quote their value properly (verified live — `film_title.gt."A""B"` parses
    // and reaches the column cast). Banning it everywhere would have been a test
    // asserting a rule that isn't true.
    const funnel = FILES.find(f => f.path === 'src/utils/searchPattern.ts')!;
    expect(funnel.code).not.toMatch(/'""'/);
  });

  it('the old escaper is gone entirely', () => {
    const offenders = FILES.filter(f => /escapeSearchPattern/.test(f.code)).map(f => f.path);
    expect(offenders).toEqual([]);
  });
});

describe('every ilike carrying member input goes through the funnel', () => {
  /**
   * Files allowed to build an ilike pattern, and the reason. A new search must be
   * added here deliberately — which is the point: it forces someone to look.
   */
  const SEARCH_SITES = [
    'src/hooks/useUniversalSearch.ts',
    'src/services/FeedService.ts',
    'src/services/ProfileDataService.ts',
    'src/services/FollowRequestService.ts',
  ];

  const filesUsingIlike = FILES
    .filter(f => /\.ilike\(|ilike\.\*|ilike\.%/.test(f.code))
    .map(f => f.path)
    .sort();

  it('the set of search sites is exactly what we expect', () => {
    // If this fails, a search was added or removed. Do not just update the list —
    // check that the new one calls buildSearchPattern and emits the unquoted form.
    expect(filesUsingIlike).toEqual([...SEARCH_SITES].sort());
  });

  it('each one imports the funnel', () => {
    for (const site of SEARCH_SITES) {
      const f = FILES.find(x => x.path === site);
      expect(f).toBeDefined();
      expect(f!.code).toMatch(/buildSearchPattern/);
    }
  });

  it('each one handles the refusal instead of searching for nothing', () => {
    // buildSearchPattern returns null for a term of only separators. Ignoring
    // that would send `*` and match every row.
    for (const site of SEARCH_SITES) {
      const f = FILES.find(x => x.path === site)!;
      expect(f.code).toMatch(/pattern === null|pattern \?|!pattern|if \(pattern\)/);
    }
  });
});

describe('#84 · the LOGS tab asks for columns that exist', () => {
  const hook = FILES.find(f => f.path === 'src/hooks/useUniversalSearch.ts')!;

  it('no longer selects logs.username or logs.role — both return 42703', () => {
    expect(hook.code).not.toMatch(/rating,\s*username,\s*role/);
    expect(hook.code).not.toMatch(/username\.ilike[^)]*film_title|film_title[^)]*username\.ilike/);
  });

  it('takes the author from the profile it is linked to', () => {
    expect(hook.code).toMatch(/profiles!logs_user_id_fkey\(username, role\)/);
  });

  it('matches the writer through a separate query, because .or() cannot', () => {
    // PostgREST refuses a dotted embedded path inside a top-level or() — the
    // filter tree fails to parse. Verified live.
    expect(hook.code).toMatch(/profiles!logs_user_id_fkey!inner\(username, role\)/);
    expect(hook.code).toMatch(/\.ilike\('profiles\.username'/);
  });

  it('excludes blank reviews, which the old filter never did', () => {
    // `.not('review','is',null)` passed 258 of 258 logs; only 132 have a review.
    expect(hook.code).toMatch(/\.not\('review', 'is', null\)\s*\.neq\('review', ''\)/);
  });

  it('a failure is recorded, and only a TOTAL failure is shown as one', () => {
    expect(hook.code).toMatch(/logger\.error\(`\[useUniversalSearch\]/);
    expect(hook.code).toMatch(/allFailed/);
  });

  it('a partial result is not cached for five minutes', () => {
    // Otherwise a momentary blip is remembered as "no results" after recovery.
    expect(hook.code).toMatch(/_partial\s*\?\s*0/);
  });
});

describe('the id-list ceiling · a request that cannot be sent', () => {
  // Measured live: 300 uuids in a URL succeed, 400 fail outright, and the same
  // 300 fail once 2KB of other filters are added. The budget is the whole URL.
  it('At the Door joins instead of listing ids', () => {
    const f = FILES.find(x => x.path === 'src/services/FollowRequestService.ts')!;
    expect(f.code).not.toMatch(/\.in\('user_id', restrictIds\)/);
    expect(f.code).not.toMatch(/\.limit\(500\)/);
    expect(f.code).toMatch(/profiles!interactions_user_id_fkey!inner\(username, avatar_url\)/);
  });

  it('follow-graph hydration joins instead of listing ids', () => {
    const f = FILES.find(x => x.path === 'src/stores/domain/socialSlice.ts')!;
    expect(f.code).not.toMatch(/\.in\('id', targetIds\)/);
    expect(f.code).toMatch(/profiles!interactions_target_user_id_fkey\(username\)/);
  });

  it('the one lookup that cannot join is batched', () => {
    // log_comments genuinely has no link to profiles — probed live, PGRST200.
    const f = FILES.find(x => x.path === 'src/services/LogService.ts')!;
    expect(f.code).toMatch(/PROFILE_LOOKUP_BATCH = 200/);
    expect(f.code).toMatch(/i \+= PROFILE_LOOKUP_BATCH/);
  });
});
