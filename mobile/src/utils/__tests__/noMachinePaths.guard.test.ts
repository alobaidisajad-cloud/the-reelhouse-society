/**
 * No code in this project names a place on ONE computer.
 * ─────────────────────────────────────────────────────────────────────────────
 * The Dispatch paper generator read the house logo from
 * `C:/Users/OMEN/OneDrive/Desktop/…/public/…`. Here, that file exists, so every
 * run passed. On CI's Linux runner it does not: the whole suite failed to load,
 * the Dispatch lost the coverage it provides, and the native Jest job was red on
 * every push for two weeks — while every local run stayed green.
 *
 * A path is written relative to the file that needs it (`join(__dirname, …)`),
 * never as where it happens to sit on the machine that wrote it. This reads
 * every source, test, script and tool the project runs and fails on any
 * absolute path into a user's home, a temp folder, or a drive letter.
 */
import { readFileSync, readdirSync, statSync } from 'fs';
import { join, relative, sep } from 'path';

const MOBILE = join(__dirname, '..', '..', '..');
const ROOTS = ['app', 'src', 'mockups', 'scripts', 'test-utils', '.claude'];
const FILES = /\.(tsx?|jsx?|cjs|mjs)$/;
const SKIP_DIRS = new Set(['node_modules', 'out', '.git']);

/** Absolute paths that can only exist on one machine. Built from parts, so
 *  this file does not match itself. */
const MACHINE = new RegExp([
  '[A-Za-z]:[\\\\/]+Users[\\\\/]',          // C:/Users/… or C:\Users\…
  '/(?:home|Users)/[a-z][\\w.-]+/',          // /home/name/…, /Users/name/…
  'AppData[\\\\/]+Local[\\\\/]+Temp',        // a Windows temp folder
].join('|'));

function files(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) files(full, out);
    else if (FILES.test(name)) out.push(full);
  }
  return out;
}

/** Code only: a comment may tell the story of the path that broke CI. */
const code = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

describe('no code names a place on one computer', () => {
  const all = ROOTS.flatMap((r) => files(join(MOBILE, r)));

  it('reads the project at all', () => {
    expect(all.length).toBeGreaterThan(500);
  });

  it('every path is relative to the file that needs it', () => {
    const bad = all
      .filter((f) => f !== __filename) // its own examples below are meant to match
      .filter((f) => MACHINE.test(code(readFileSync(f, 'utf8'))))
      .map((f) => relative(MOBILE, f).split(sep).join('/'));
    expect(bad).toEqual([]);
  });

  it('the pattern catches the path that broke CI, in both slash styles', () => {
    expect(MACHINE.test("readFileSync('C:/Users/someone/Desktop/public/logo.png')")).toBe(true);
    expect(MACHINE.test('C:\\Users\\someone\\x')).toBe(true);
    expect(MACHINE.test('/home/runner/work/x')).toBe(true);
    expect(MACHINE.test("join(__dirname, '..', 'public', 'logo.png')")).toBe(false);
  });
});
