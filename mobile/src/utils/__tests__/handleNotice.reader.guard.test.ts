/**
 * handleNotice.reader.guard.test.ts — the notice must actually be SHOWN
 * ────────────────────────────────────────────────────────────────────
 * #50 has two halves and only one of them is behaviourally testable here:
 *
 *   • the WRITER — signup recording the requested handle. Proven for real in
 *     stores/__tests__/auth.test.ts, which drives signup() and reads what hit storage.
 *   • the READER — AppBootstrapper turning that record into something a member sees.
 *
 * The reader lives inside a useEffect in a headless provider that boots RevenueCat,
 * push notifications, realtime, NetInfo and OTA updates. Rendering it to assert one
 * Alert would mean mocking all of that, and the resulting test would break every time
 * any unrelated part of boot changed — a test that gets deleted the first time it is
 * inconvenient is not a guard.
 *
 * So this is a deletion tripwire, in the same spirit as prose-handlers.guard.test.ts:
 * it asserts the wiring EXISTS and is reachable from every arrival path. Whether the
 * decision it makes is right is proven exhaustively in handleNotice.test.ts.
 *
 * The specific regression it prevents is the one already made once in this batch: a
 * reader placed inside boot(), which runs the instant a user object exists — before the
 * profile enrich supplies a username on the email-confirmation path, where the request
 * would then never be compared to anything.
 */
import * as fs from 'fs';
import * as path from 'path';

const SOURCE = path.join(__dirname, '..', '..', 'providers', 'AppBootstrapper.tsx');
const src = fs.readFileSync(SOURCE, 'utf8');

describe('AppBootstrapper reads the pending handle', () => {
  it('imports and calls the resolver', () => {
    expect(src).toMatch(/import\s*\{[^}]*resolveHandleNotice[^}]*\}\s*from\s*['"][^'"]*handleNotice['"]/);
    expect(src).toMatch(/resolveHandleNotice\(/);
  });

  it('shows what it resolves, rather than resolving and discarding', () => {
    expect(src).toMatch(/Alert\.alert\(/);
    // The resolved notice must be what is handed to the Alert.
    const alertCall = src.match(/Alert\.alert\([^,]+,\s*([A-Za-z_$][\w$]*)/);
    expect(alertCall).not.toBeNull();
    const shown = alertCall![1];
    expect(src).toMatch(new RegExp(`const\\s+${shown}\\s*=\\s*resolveHandleNotice\\(`));
  });

  it('runs on EVERY auth state change, not once inside boot()', () => {
    // The whole reason the reader is not in boot(): on the email-confirmation path the
    // user object exists before the username does. If this check ever moves inside
    // boot(), that path silently loses its only chance to speak.
    const bootStart = src.indexOf('async function boot(');
    const checkStart = src.indexOf('function checkHandle(');
    expect(bootStart).toBeGreaterThan(-1);
    expect(checkStart).toBeGreaterThan(bootStart);
    const bootBody = src.slice(bootStart, checkStart);
    expect(bootBody).not.toMatch(/resolveHandleNotice\(/);

    // Reachable both for a user already present when the effect runs…
    expect(src).toMatch(/if \(currentUser\) \{[\s\S]{0,200}?checkHandle\(currentUser\)/);
    // …and for every later change, which is where a late profile enrich lands.
    const subscribeBody = src.slice(src.indexOf('useAuthStore.subscribe('));
    expect(subscribeBody.slice(0, 600)).toMatch(/checkHandle\(state\.user\)/);
  });

  it('never lets a courtesy break boot', () => {
    const fn = src.slice(src.indexOf('function checkHandle('));
    expect(fn.slice(0, 600)).toMatch(/try\s*\{/);
    expect(fn.slice(0, 600)).toMatch(/catch/);
  });
});
