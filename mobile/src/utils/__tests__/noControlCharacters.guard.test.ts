/**
 * noControlCharacters.guard.test.ts — no source file carries a raw control
 * character.
 * ─────────────────────────────────────────────────────────────────────────────
 * A backslash sent through a shell can be eaten on the way. `\b` in a regex
 * then arrives as a real BACKSPACE (U+0008): the file still parses, the regex
 * still compiles — it now demands a backspace where it meant a word boundary —
 * and it matches nothing, in silence: a guard test once reported every screen
 * in the app as unlit that way.
 *
 * Source code has no business holding any C0 control character except tab,
 * newline and carriage return. Any other one is damage.
 */
import { readdirSync, readFileSync, statSync } from 'fs';
import { join, relative } from 'path';

const ROOT = join(__dirname, '..', '..', '..');
const SCAN = ['app', 'src', 'scripts', 'supabase', 'mockups', '__tests__', 'test-utils', 'e2e'];
const OUT = join(ROOT, 'mockups', 'out');
// TMDB's answers, recorded verbatim (for the E2E world and the mockups): data, whose own characters are kept.
const RECORDINGS = [
  join(ROOT, 'e2e', 'supabase', 'functions', 'tmdb-proxy', 'fixtures'),
  join(ROOT, 'mockups', 'fixtures'),
];

function files(dir: string): string[] {
  const out: string[] = [];
  let names: string[] = [];
  try { names = readdirSync(dir); } catch { return out; }
  for (const name of names) {
    if (name === 'node_modules' || name.startsWith('.')) continue;
    const p = join(dir, name);
    // mockups/out is drawn output (git-ignored), rewritten while a drawing run is live —
    // not source, and a file listed here can be gone by the time it is read.
    if (p === OUT || RECORDINGS.includes(p)) continue;
    if (statSync(p).isDirectory()) out.push(...files(p));
    else if (/\.(tsx?|jsx?|cjs|mjs|sql|json|md)$/.test(name)) out.push(p);
  }
  return out;
}

// Every C0 control except TAB (9), LF (10) and CR (13), and DEL (127).
const DAMAGE = new Set([...Array(32).keys()].filter((c) => c !== 9 && c !== 10 && c !== 13).concat(127));

describe('no source file carries a raw control character', () => {
  const all = SCAN.flatMap((d) => files(join(ROOT, d)));

  it('scans the tree (a scan of nothing proves nothing)', () => {
    expect(all.length).toBeGreaterThan(500);
  });

  it('finds none', () => {
    const hits: string[] = [];
    for (const f of all) {
      const text = readFileSync(f, 'utf8');
      for (let i = 0; i < text.length; i++) {
        const c = text.charCodeAt(i);
        if (DAMAGE.has(c)) {
          const line = text.slice(0, i).split('\n').length;
          hits.push(`${relative(ROOT, f)}:${line} U+${c.toString(16).padStart(4, '0')}`);
          break;
        }
      }
    }
    expect(hits).toEqual([]);
  });

  // A bidi override in source shows code in an order it does not run in (the
  // "Trojan Source" attack); an invisible character hides what a line holds;
  // a raw U+2028 ends a line a reader cannot see. One reached a test here when a
  // tool turned the escape it was given into the character itself. The joiners
  // (U+200C, U+200D) stay: they are part of the emoji and the Persian words the
  // sanitiser's own comments spell.
  it('no source file carries a raw bidi, invisible or separator character', () => {
    const HIDDEN = (c: number) => (c >= 0x202a && c <= 0x202e) || (c >= 0x2066 && c <= 0x2069)
      || c === 0x200b || c === 0x200e || c === 0x200f || (c >= 0x2060 && c <= 0x2064)
      || c === 0x2028 || c === 0x2029 || c === 0x00ad || c === 0x034f || (c === 0xfeff);
    const hits: string[] = [];
    for (const f of all) {
      const text = readFileSync(f, 'utf8');
      for (let i = 0; i < text.length; i++) {
        if (HIDDEN(text.charCodeAt(i))) {
          hits.push(`${relative(ROOT, f)}:${text.slice(0, i).split('\n').length} U+${text.charCodeAt(i).toString(16).padStart(4, '0')}`);
          break;
        }
      }
    }
    expect(hits).toEqual([]);
  });

  it('would see one — the detector is not blind', () => {
    const sample = `const name = 'admin${String.fromCharCode(0x202e)}gnp.exe';`;
    expect([...sample].some((ch) => { const c = ch.charCodeAt(0); return c >= 0x202a && c <= 0x202e; })).toBe(true);
  });

  // The same shell can eat `\u` whole: after `0-9`, `؀-ۿ` arrives as
  // `0600-06FF`, which parses, and matches digits and F instead of Arabic.
  it('no \\uXXXX in a character class has lost its escape', () => {
    const EATEN = /(?:0-9|a-z|A-Z|\[)u?[0-9A-Fa-f]{4}-u?[0-9A-Fa-f]{4}/;
    const hits: string[] = [];
    for (const f of all.filter((p) => /\.(tsx?|jsx?|cjs|mjs)$/.test(p))) {
      readFileSync(f, 'utf8').split('\n').forEach((text, i) => {
        if (EATEN.test(text)) hits.push(`${relative(ROOT, f)}:${i + 1}`);
      });
    }
    expect(hits).toEqual([]);
  });
});
