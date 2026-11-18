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
import * as path from 'path';
import { readCode } from '@/test-utils/readCode';
import { files as universe } from '@/test-utils/universe';

const SRC = path.join(__dirname, '..', '..');

const FILES = universe('appCode').map(f => ({
  path: path.relative(path.join(SRC, '..'), f).replace(/\\/g, '/'),
  code: readCode(f),
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
  // The house-wide search builds no ilike of its own since round 13: each of its house sources is
  // a function (search_members, search_logs, search_stacks) given the funnel's pattern (below).
  const SEARCH_SITES = [
    'src/services/ProfileDataService.ts',
    'src/services/FollowRequestService.ts',
    // The Dispatch's archive: a member names a film and the house's filings
    // about it are gathered. It searches `dispatch_posts.subject_title`, which
    // is member-captured text, and it arrived here carrying a hand-rolled
    // escaper that covered `%` and `_` and missed `*` — PostgREST's own alias
    // for `%`. This guard is what refused it.
    'src/hooks/useDispatchArchive.ts',
    // The Lounge's search: the salons past the newest fifty, by name and what each is, asked of
    // the house as the member types (searchLounges), through buildSearchPattern.
    'src/stores/lounge.ts',
    // Edit Profile's check that a handle is free: in any case, as the house judges a handle taken
    // (round 11), so the member's handle is matched by ilike, whole, through buildSearchPattern.
    'src/services/ProfileWriteService.ts',
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

describe('#84 · the LOGS tab asks the house for what exists', () => {
  const hook = FILES.find(f => f.path === 'src/hooks/useUniversalSearch.ts')!;

  // Review round 12: the two reads of the logs (the film or the writing; the writer's handle,
  // which PostgREST could not fold into one .or()) became one house read, search_logs, which
  // matches all three, pages, and leaves out blank reviews and hidden authors in the house.
  it('reads the logs through search_logs, given the words through the funnel', () => {
    expect(hook.code).toMatch(/rpc\('search_logs', \{\s*p_pattern: pattern,\s*p_handle: handle,/);
    expect(hook.code).not.toMatch(/\.from\('logs'\)/);
  });

  // Round 13: the stacks were read by PostgREST, the read rule asked of every stack before the words;
  // search_stacks finds them by the words' indexes first, given the words through the funnel.
  it('reads the stacks through search_stacks, given the words through the funnel', () => {
    expect(hook.code).toMatch(/rpc\('search_stacks', \{\s*p_pattern: pattern,/);
    expect(hook.code).not.toMatch(/\.from\('lists'\)/);
  });

  it('a failure is recorded, and only a TOTAL failure is shown as one', () => {
    expect(hook.code).toMatch(/logger\.error\('\[useUniversalSearch\] a source (failed|was rejected)'/);
    expect(hook.code).toMatch(/everyAskedDown/);
  });

  it('a source that failed holds no answer to be kept', () => {
    // Each source is its own read: one that failed is an error, never an empty page kept five
    // minutes as "no results" after the source recovered.
    expect(hook.code).toMatch(/if \(error\) \{[^}]*throw error;/);
    expect(hook.code).not.toMatch(/data: \[\] as never\[\], error: null/);
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

  it('a log\'s critiques join their authors, not a list of ids after them', () => {
    // log_comments holds log_comments_user_id_fkey to profiles: probed live 2026-11-07, the
    // embed answers each critique's author (an earlier probe's PGRST200 no longer holds).
    const f = FILES.find(x => x.path === 'src/services/LogService.ts')!;
    expect(f.code).toMatch(/profiles!log_comments_user_id_fkey\(username, avatar_url, display_name\)/);
    expect(f.code).not.toMatch(/\.from\('profiles'\)[\s\S]{0,80}\.in\('id'/);
  });
});
