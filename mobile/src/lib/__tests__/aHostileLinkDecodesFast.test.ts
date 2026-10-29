/**
 * A hostile link decodes fast (GHSA-qr28-fpjm-wq7f).
 *
 * query-string ships in the app with expo-router, and reads a query with decode-uri-component. Up
 * to 0.5.0 that decoder, given a value the built-in decoder refuses, replaced each percent-encoded
 * run across the whole value once per run: quadratic, 2.7 s on this test's value against 9 ms for
 * 0.5.1, which decodes each run in place in one pass. Today no opened link reaches it (expo-router
 * reads a path with its own reader and writes queries with query-string), so this keeps the one the
 * app ships safe for any reader that comes: query-string decodes with the fixed decoder (package.json
 * `overrides`; patches/query-string+7.1.3.patch takes its default export), and reads ordinary
 * queries exactly as before.
 */
import queryString from 'query-string';

describe('a link’s query, as the app reads it', () => {
  it('reads an ordinary link as it always did', () => {
    expect(queryString.parse('film=%E2%9C%A6&title=Late+Spring&q=Tokyo%20Story')).toEqual({
      film: '✦', title: 'Late Spring', q: 'Tokyo Story',
    });
  });

  it('reads a broken run without throwing, keeping what it can', () => {
    expect(queryString.parse('q=caf%C3%A9%E0%A4%A')).toEqual({ q: 'café%E0%A4%A' });
  });

  it('decodes a crafted value of 20,000 different runs in a fraction of a second', () => {
    // Each run different (three letters or digits, percent-encoded), literal text between them, and
    // one lone `%` so the built-in decoder refuses the whole: the old decoder rescanned the value
    // once for every different run.
    const ABC = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    const runs = Array.from({ length: 20000 }, (_, i) => [i % 62, Math.floor(i / 62) % 62, Math.floor(i / 3844)].map((n) => ABC[n]).join(''));
    const encoded = (s: string) => [...s].map((c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`).join('');
    const value = runs.map((r) => `${encoded(r)}-`).join('') + '%';
    const started = Date.now();
    const read = queryString.parse(`q=${value}`).q as string;
    expect(Date.now() - started).toBeLessThan(250);
    expect(read).toBe(runs.map((r) => `${r}-`).join('') + '%');
  });
});
