/**
 * noControlCharacters.guard.test.ts — no source file carries a raw control
 * character.
 * ─────────────────────────────────────────────────────────────────────────────
 * A backslash sent through a shell can be eaten on the way. `\b` in a regex
 * then arrives as a real BACKSPACE (U+0008): the file still parses, the regex
 * still compiles — it now demands a backspace where it meant a word boundary —
 * and it matches nothing, in silence. It happened on 2026-09-24 inside a guard
 * test, which then reported every screen in the app as unlit.
 *
 * Source code has no business holding any C0 control character except tab,
 * newline and carriage return. Any other one is damage.
 */
import { readdirSync, readFileSync, statSync } from 'fs';
import { join, relative } from 'path';

const ROOT = join(__dirname, '..', '..', '..');
const SCAN = ['app', 'src', 'scripts', 'supabase', 'mockups'];

function files(dir: string): string[] {
  const out: string[] = [];
  let names: string[] = [];
  try { names = readdirSync(dir); } catch { return out; }
  for (const name of names) {
    if (name === 'node_modules' || name.startsWith('.')) continue;
    const p = join(dir, name);
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
});
