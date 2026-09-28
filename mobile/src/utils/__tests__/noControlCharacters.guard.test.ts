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
const SCAN = ['app', 'src', 'scripts', 'supabase', 'mockups'];
const OUT = join(ROOT, 'mockups', 'out');

function files(dir: string): string[] {
  const out: string[] = [];
  let names: string[] = [];
  try { names = readdirSync(dir); } catch { return out; }
  for (const name of names) {
    if (name === 'node_modules' || name.startsWith('.')) continue;
    const p = join(dir, name);
    // mockups/out is drawn output (git-ignored), rewritten while a drawing run is live —
    // not source, and a file listed here can be gone by the time it is read.
    if (p === OUT) continue;
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
