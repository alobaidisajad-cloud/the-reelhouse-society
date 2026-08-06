/**
 * handleGuard.wiring.guard.test.ts — the widened guard must be the one in use
 * ─────────────────────────────────────────────────────────────────────────
 * handleGuard.test.ts proves the predicate is right. On this codebase that has been
 * measured as a different question: batch 14 deleted three real call sites and the
 * whole suite stayed green.
 *
 * `resolveUsernameToProfile` is a module-private function inside a store that owns
 * Supabase, MMKV, throttling and an LRU cache. Driving it in a render test would mock
 * more than it proves. So this is a deletion tripwire on the one call site, plus the
 * property that actually caused #67: the old charset must not come back.
 */
import * as fs from 'fs';
import * as path from 'path';

const slice = fs.readFileSync(
  path.join(__dirname, '..', '..', 'stores', 'domain', 'socialSlice.ts'), 'utf8',
);

describe('the username lookup uses the shared guard', () => {
  it('imports and calls it', () => {
    expect(slice).toMatch(/import\s*\{[^}]*isLookupSafeHandle[^}]*\}\s*from\s*['"][^'"]*handleGuard['"]/);
    expect(slice).toMatch(/if \(!isLookupSafeHandle\(username\)\) return null;/);
  });

  it('the guard still runs BEFORE the cache and the network call', () => {
    // Its purpose is to fail fast. Behind the cache it would still let a malformed
    // value reach `.eq('username', …)` on any cache miss.
    const fn = slice.slice(slice.indexOf('async function resolveUsernameToProfile'));
    const guard = fn.indexOf('isLookupSafeHandle');
    const cache = fn.indexOf('_usernameProfileCache.get');
    const network = fn.indexOf("supabase.from('profiles')");
    expect(guard).toBeGreaterThan(-1);
    expect(guard).toBeLessThan(cache);
    expect(guard).toBeLessThan(network);
  });

  it('the old charset is GONE, not merely bypassed', () => {
    // Leaving it anywhere in this file invites someone to reinstate it as "stricter".
    // It is not stricter — it is wrong, and it locked out 5 of 32 live members.
    const code = slice.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    expect(code).not.toMatch(/\[a-zA-Z0-9_\]\{1,30\}/);
  });
});
