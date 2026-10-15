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
import { join, relative, sep } from 'path';
import { readCode } from '@/test-utils/readCode';
import { files as universe } from '@/test-utils/universe';

const MOBILE = join(__dirname, '..', '..', '..');
const FILES = /\.(tsx?|jsx?|cjs|mjs)$/;

/** Absolute paths that can only exist on one machine. Built from parts, so
 *  this file does not match itself. */
const MACHINE = new RegExp([
  '[A-Za-z]:[\\\\/]+Users[\\\\/]',          // C:/Users/… or C:\Users\…
  '/(?:home|Users)/[a-z][\\w.-]+/',          // /home/name/…, /Users/name/…
  'AppData[\\\\/]+Local[\\\\/]+Temp',        // a Windows temp folder
].join('|'));

describe('no code names a place on one computer', () => {
  // Every code file in mobile/ and the edge functions, the tests and the scripts included.
  const all = universe(['appCode', 'appTests', 'tests', 'testSupport', 'scripts', 'config', 'mockups', 'functions', 'standIns'])
    .filter((f) => FILES.test(f));

  it('reads the project at all', () => {
    expect(all.length).toBeGreaterThan(500);
  });

  it('every path is relative to the file that needs it', () => {
    const bad = all
      .filter((f) => f !== __filename) // its own examples below are meant to match
      // Code only: a comment may tell the story of the path that broke CI.
      .filter((f) => MACHINE.test(readCode(f)))
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
