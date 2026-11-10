/**
 * loungeErrors.guard.test.ts — batch 18, the errors nobody ever saw
 * ────────────────────────────────────────────────────────────────
 * #55 was filed as "the catch swallows every backend error." That diagnosis is wrong:
 * both catches DO surface a message. The defect is one line earlier — supabase-js
 * RESOLVES a backend failure rather than throwing, so `if (data && !error)` skipped the
 * whole block, the catch never fired, and the screen sat empty in silence. Applying the
 * filed fix would have changed nothing.
 *
 * And the class was bigger than the finding: of 13 reads in this store, only 6 looked at
 * their error at all. The worst was not in the finding — a failed membership lookup left
 * the salon list rendering as though the member belonged to NOTHING.
 *
 * These are source assertions. What they protect — "did supabase return an error object"
 * — is a property of the client library, not of this codebase; what this codebase can
 * get wrong is failing to look. That is exactly what is pinned here.
 */
import * as path from 'path';
import { readCode } from '@/test-utils/readCode';

/** Comments stripped — prose about a rule must not satisfy the rule. */
const code = readCode(path.join(__dirname, '..', 'lounge.ts'));
/** The corridor's one call (get_lounge_list), as production holds it. */
const MIGRATION = readCode(path.join(__dirname, '..', '..', '..', '..', 'supabase', 'migrations', '20261109_02_the_corridor_in_one_trip.sql'));

/**
 * Slice one function body out of the source.
 *
 * The end marker MUST be searched from the start marker onwards: every one of these
 * names also appears in the interface declaration far above the implementation, so a
 * plain indexOf finds that first and the slice runs backwards into an empty string —
 * which then passes any .not.toMatch() assertion for the wrong reason.
 */
const fn = (name: string, next: string) => {
  const from = code.indexOf(name);
  if (from < 0) throw new Error(`marker not found: ${name}`);
  const to = code.indexOf(next, from + name.length);
  if (to < 0) throw new Error(`end marker not found after ${name}: ${next}`);
  return code.slice(from, to);
};

describe('#55 · the two message loads check the error BEFORE the success guard', () => {
  it('fetchMessages surfaces and logs a backend failure', () => {
    const f = fn('fetchMessages: async', 'loadMoreMessages: async');
    expect(f).toMatch(/if \(error\) \{/);
    expect(f).toMatch(/logger\.error\('\[LoungeStore\.fetchMessages\]/);
    expect(f).toMatch(/reelToast\.error/);
  });

  it('loadMoreMessages surfaces and logs a backend failure', () => {
    const f = fn('loadMoreMessages: async', 'clearMessages:');
    expect(f).toMatch(/if \(error\) \{/);
    expect(f).toMatch(/logger\.error\('\[LoungeStore\.loadMoreMessages\]/);
  });

  it('neither still gates purely on the old success shape', () => {
    // `if (data && !error)` is the exact expression that made the failure invisible.
    expect(code).not.toMatch(/if \(data && !error\)/);
    expect(code).not.toMatch(/if \(data && data\.length > 0 && !error\)/);
  });

  it('the spinner cannot be stranded — the loads BRANCH rather than return early', () => {
    // fetchMessages clears `messagesLoading` after the try, so an early return would leave the
    // spinner up forever. This is why the fix is `if (error) … else if (data) …`.
    const f = fn('fetchMessages: async', 'loadMoreMessages: async');
    expect(f).toMatch(/\} else if \(data\) \{/);
  });
});

describe('#55 · the class, not the two sites that were filed', () => {
  it('the membership lookup no longer fails into an empty salon list', () => {
    // The worst of the seven, and absent from the finding: on failure memberRows was
    // undefined, memberships fell back to [], and the list rendered as though the
    // member belonged to nothing — joined rooms gone, every unread count zero.
    // The seats come in the corridor's one answer now (get_lounge_list): its failure throws, and
    // so does an answer missing any piece, before a seat is read.
    const body = fn('fetchLounges: async', 'fetchMessages: async');
    expect(body).toMatch(/if \(error\) throw error;/);
    expect(body).toMatch(/if \(!corridor\) throw new Error/);
    expect(body.indexOf('if (!corridor) throw')).toBeLessThan(body.indexOf('const memberships = corridor.memberships;'));
  });

  it('no piece of the corridor fails alone into a short list', () => {
    // The door requests, the unread counts, the faces and the last words were reads of their own,
    // each logged when it failed. They are pieces of the one answer now (P4.53): a piece that is not
    // a list fails the whole read (corridorOf), and the Lounge keeps the corridor it drew and says so.
    // (A message's reactions come in its own page, MESSAGE_COLUMNS: no read of their own to fail.)
    expect(code).toMatch(/CORRIDOR_PIECES\.every\(\(piece\) => Array\.isArray\(answer\[piece\]\)\)/);
    expect(code).not.toMatch(/pendingError|unreadError/);
  });

  it('a failed profile lookup is NOT written into the cache', () => {
    // It fell back to the literal string "unknown" and cached it for the full 5-minute
    // TTL, so every live dispatch from that member rendered as from "unknown" — and the
    // cache is consulted first, so retrying could not clear it.
    const resolve = fn('async function resolveProfile', 'interface ReactionRow');
    expect(resolve).toMatch(/if \(error \|\| !profile\) \{/);
    // the early return must come BEFORE anything is written to the cache
    const guard = resolve.indexOf('if (error || !profile)');
    const write = resolve.indexOf('_profileCache.set');
    expect(guard).toBeGreaterThan(-1);
    expect(write).toBeGreaterThan(guard);
  });

  it('every read either inspects its error or is deliberately exempt', () => {
    // Two exemptions, both justified in place: the member-face avatars (annotated as
    // decorative) and the two unread scans, which are replaced wholesale by the RPC.
    const ignoring = (code.match(/const \{ data[^}]*\} = await/g) ?? [])
      .filter(m => !m.includes('error'));
    expect(ignoring.length).toBeLessThanOrEqual(3);
  });
});

describe('#57 · paging cannot skip a message', () => {
  it('uses a compound cursor, not a bare timestamp', () => {
    const f = fn('loadMoreMessages: async', 'clearMessages:');
    expect(f).toMatch(/created_at\.lt\.\$\{oldestMessage\.created_at\}/);
    expect(f).toMatch(/and\(created_at\.eq\.\$\{oldestMessage\.created_at\},id\.lt\.\$\{oldestMessage\.id\}\)/);
  });

  it('the bare cursor is GONE — messages sharing a timestamp were skipped permanently', () => {
    expect(code).not.toMatch(/\.lt\('created_at', oldestMessage\.created_at\)/);
  });

  it('the ORDER carries the same tiebreaker, or the cursor means nothing', () => {
    const f = fn('loadMoreMessages: async', 'clearMessages:');
    expect(f).toMatch(/\.order\('created_at', \{ ascending: false \}\)/);
    expect(f).toMatch(/\.order\('id', \{ ascending: false \}\)/);
  });
});

describe('#58 · a failed creation must not burn the cooldown', () => {
  const f = () => fn('createLounge: async', 'setLoungeCover: async');

  it('the cooldown is released on BOTH failure paths', () => {
    // The finding named only the RPC-error branch. A throw — the offline case, and the
    // likelier one — burned it just as completely.
    // Released to long past (-Infinity): the stamp is on the forward clock, which starts near 0 (waits.ts).
    const resets = (f().match(/_lastCreateAt = -Infinity;/g) ?? []).length;
    expect(resets).toBe(2);
  });

  it('the guard is still set BEFORE the call — that is deliberate', () => {
    // Moving it after success would remove the anti-double-tap guard while the request
    // is in flight, so two taps could fire two create_lounge calls. The fix releases it
    // on failure rather than deferring it.
    const body = f();
    const set = body.indexOf('_lastCreateAt = now;');
    const rpc = body.indexOf("supabase.rpc('create_lounge'");
    expect(set).toBeGreaterThan(-1);
    expect(rpc).toBeGreaterThan(set);
  });
});

describe('#54 · unread counts are computed once, on the server', () => {
  const f = () => fn('fetchLounges: async', 'fetchMessages: async');

  it('the two unbounded scans are GONE', () => {
    // 1. every message in every lounge you belong to — no LIMIT, no filter
    // 2. every message newer than the oldest last_read_at — no LIMIT, and NO ORDER BY,
    //    so any server row cap made the count silently wrong rather than merely slow
    expect(code).not.toMatch(/const \{ data: lastMsgs \}/);
    expect(code).not.toMatch(/const \{ data: recentMsgs \}/);
    expect(code).not.toMatch(/unreadQuery/);
  });

  it('one RPC replaces them, inside the corridor\'s one call', () => {
    expect(f()).toMatch(/supabase\.rpc\('get_lounge_list'\)/);
    expect(MIGRATION).toMatch(/FROM public\.get_lounge_unread_counts\(\) u/);
  });

  it('it is NOT the function the register recommended', () => {
    // get_user_lounges takes a caller-supplied user id, returns invite_code, and had
    // its access revoked in batch 7 after it was found returning every lounge
    // regardless of the id passed.
    expect(code).not.toMatch(/get_user_lounges/);
  });

  it('the counts are asked only of a member who sits somewhere, and answered as a list', () => {
    // As the client asked them: a member in no salon is answered an empty list, never a null
    // (the train of 2026-11-09 stopped on a JSON null for production's first member).
    expect(MIGRATION).toMatch(/'unread', CASE WHEN EXISTS \(SELECT 1 FROM memberships\)/);
    expect(MIGRATION).toMatch(/ELSE '\[\]'::jsonb END/);
  });

  it('every room the member belongs to still gets an entry', () => {
    // The UI reads these maps directly; a missing key would render undefined.
    expect(f()).toMatch(/if \(!\(id in unreadCounts\)\) unreadCounts\[id\] = 0;/);
  });

  it('the salon list\'s other pieces stay bounded, in the corridor\'s one call', () => {
    // 100 memberships and the 50 newest rooms, as the separate reads were; the joined rooms are
    // those memberships' and the hosted ones the member's own.
    expect(MIGRATION).toMatch(/WHERE lm\.user_id = me\.id LIMIT 100/);
    expect(MIGRATION).toMatch(/ORDER BY l\.created_at DESC LIMIT 50/);
  });
});
