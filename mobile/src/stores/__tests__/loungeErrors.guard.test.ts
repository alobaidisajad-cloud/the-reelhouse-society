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
import * as fs from 'fs';
import * as path from 'path';

const src = fs.readFileSync(path.join(__dirname, '..', 'lounge.ts'), 'utf8');
/** Comments stripped — prose about a rule must not satisfy the rule. */
const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

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
    // fetchMessages clears `loading` after the try, so an early return would leave the
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
    expect(code).toMatch(/const \{ data: memberRows, error: memberError \}/);
    expect(code).toMatch(/if \(memberError\) throw memberError;/);
  });

  it('secondary reads are LOGGED but do not interrupt', () => {
    // The salon list and the dispatches are still correct in these cases; a toast for a
    // missing badge or a missing reaction would be noise. Silence is the bug — noise is
    // not the remedy.
    expect(code).toMatch(/if \(pendingError\) logger\.error/);
    expect(code).toMatch(/if \(reactionError\) logger\.error/);
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
    const resets = (f().match(/_lastCreateAt = 0;/g) ?? []).length;
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
