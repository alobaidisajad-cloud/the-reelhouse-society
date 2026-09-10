/**
 * everyFileSurvivedTheShell.guard.test.ts — no file is double-encoded.
 * ─────────────────────────────────────────────────────────────────────────────
 * PowerShell 5.1 reads a file with `Get-Content -Raw` using the system ANSI
 * codepage and writes it back with `Set-Content` as UTF-8. Round-trip a source
 * file through that and every non-ASCII character is silently replaced:
 *
 *     ── THE THREE FORMS THAT HAD NO DESK ──
 *     â”€â”€ THE THREE FORMS THAT HAD NO DESK â”€â”€
 *
 * Nothing complains. The file still parses, the types still check, the tests
 * still pass. It happened once in this repo — a two-line edit that changed
 * fifty lines — and it was caught by `git diff --stat` looking wrong, which is
 * not a control. An em-dash in a member-facing string would have shipped.
 *
 * ── WHY THE OBVIOUS DETECTOR IS WRONG ───────────────────────────────────────
 * The first version hunted for the byte signature CP1252 mangling produces.
 * That is a guess about the CAUSE — the codepage differs by machine locale — and
 * a guess that is wrong reports "clean" for ever.
 *
 * The second version looked for the SHAPE: a Latin-1 letter hugging another
 * non-ASCII character. That is worse, because it is a false positive on real
 * content this app will certainly hold: `José’s` is an accented letter followed
 * by a curly quote and is indistinguishable from mangling by shape alone.
 *
 * ── WHAT THIS DOES INSTEAD: RUN THE DAMAGE BACKWARDS ────────────────────────
 * Mangling is `bytes -> decode as CP1252 -> encode as UTF-8`. So invert it:
 * take the file's text, encode each character back to its CP1252 byte, and ask
 * whether those bytes are valid UTF-8. They can only be if the text really was
 * a UTF-8 sequence wearing a CP1252 costume.
 *
 *     mangled em-dash   "â€”"  -> E2 80 94 -> decodes to "—"   FLAGGED
 *     a real name       "José’s" -> ... E9 92 73 -> E9 wants two
 *                                  continuation bytes, 73 is not  NOT FLAGGED
 *
 * Arabic, box-drawing rules and CJK are not representable in CP1252 at all, so
 * they are skipped rather than guessed at. The test proves both directions
 * before it trusts a clean sweep — a probe that cannot say NO is furniture.
 */
import { readFileSync, readdirSync, statSync, existsSync } from 'fs';
import { join } from 'path';

const MOBILE = join(__dirname, '..', '..', '..');
const REPO = join(MOBILE, '..');

/** Everything a person edits. Mockups included: a mangled sheet measures wrong. */
const ROOTS = [
  join(MOBILE, 'src'),
  join(MOBILE, 'app'),
  join(MOBILE, 'mockups'),
  join(MOBILE, 'scripts'),
  join(REPO, 'supabase', 'migrations'),
];
const SKIP = new Set(['node_modules', '.expo', 'android', 'ios', 'out', 'coverage', '.git']);
const WANTED = /\.(tsx?|sql|mjs|cjs|js)$/;

function walk(dir: string, out: string[] = []): string[] {
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir)) {
    if (SKIP.has(name)) continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (WANTED.test(name)) out.push(full);
  }
  return out;
}

/**
 * ── THE CODEPAGE, WRITTEN OUT ───────────────────────────────────────────────
 * `new TextDecoder('windows-1252')` is not available here: Expo's jest preset
 * replaces the global with a UTF-8-only shim. So the table is stated.
 *
 * CP1252 is ASCII below 0x80 and Latin-1 from 0xA0 up; the only part that has
 * to be written down is 0x80–0x9F, which is a fixed, thirty-year-old standard.
 *
 * Five of those bytes (0x81 0x8D 0x8F 0x90 0x9D) are blank in the printed
 * codepage. They are held as 0 here and resolve to the C1 CONTROL of the same
 * value — U+0081 and so on — because that is what both the WHATWG decoder and
 * .NET actually return, and .NET is what PowerShell used to do the damage.
 * Treating them as unmapped instead would be a FALSE NEGATIVE in this guard:
 * 0x81 is an ordinary UTF-8 continuation byte, so a mangled file containing one
 * would simply fail to encode back and be waved through.
 *
 * Transcribed by hand, and therefore NOT trusted: the first test below checks
 * every one of the 256 entries against Node's own decoder. It is how the
 * mistake above was found rather than shipped.
 */
const CP1252_HIGH = [
  0x20ac, 0, 0x201a, 0x0192, 0x201e, 0x2026, 0x2020, 0x2021,
  0x02c6, 0x2030, 0x0160, 0x2039, 0x0152, 0, 0x017d, 0,
  0, 0x2018, 0x2019, 0x201c, 0x201d, 0x2022, 0x2013, 0x2014,
  0x02dc, 0x2122, 0x0161, 0x203a, 0x0153, 0, 0x017e, 0x0178,
];

/** byte -> character. Every one of the 256 maps to something. */
export function cp1252Char(b: number): string {
  if (b < 0x80 || b >= 0xa0) return String.fromCharCode(b);
  const cp = CP1252_HIGH[b - 0x80];
  return String.fromCharCode(cp === 0 ? b : cp);
}

/** character -> its single CP1252 byte, the inverse of the above. */
const TO_CP1252 = (() => {
  const map = new Map<string, number>();
  for (let b = 0; b <= 0xff; b++) {
    const ch = cp1252Char(b);
    if (!map.has(ch)) map.set(ch, b);
  }
  return map;
})();

/** Read bytes as CP1252 — exactly what PowerShell's `Get-Content -Raw` did. */
function decodeCp1252(bytes: Buffer): string {
  let out = '';
  for (const b of bytes) out += cp1252Char(b);
  return out;
}

const utf8 = new TextDecoder('utf-8', { fatal: true });

/**
 * Is this text the result of UTF-8 having been read as CP1252?
 * Returns the text it would decode back to, or null.
 */
export function unmangle(text: string): string | null {
  // Cheap gate: mangling always leaves a lead character in this range, and it
  // keeps the sweep from encoding megabytes of plain ASCII.
  if (!/[À-ÿ]/.test(text)) return null;

  const bytes = new Uint8Array(text.length);
  for (let i = 0; i < text.length; i++) {
    const b = TO_CP1252.get(text[i]);
    if (b === undefined) return null;   // not CP1252-representable: not mangled
    bytes[i] = b;
  }
  let back: string;
  try { back = utf8.decode(bytes); } catch { return null; }
  return back === text ? null : back;   // pure ASCII round-trips to itself
}

/** The first mangled line in a file, if there is one. */
function firstBadLine(text: string): { line: number; was: string; shouldBe: string } | null {
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const back = unmangle(lines[i]);
    if (back) return { line: i + 1, was: lines[i].trim().slice(0, 70), shouldBe: back.trim().slice(0, 70) };
  }
  return null;
}

describe('the detector, before it is trusted', () => {
  it('the hand-written codepage table matches Node’s own, byte for byte', () => {
    /**
     * The table above is the only part of this file I could get quietly wrong,
     * and a wrong table would make BOTH the mangling and the detection wrong in
     * the same direction — they would agree with each other and prove nothing.
     * So it is checked against an independent implementation.
     *
     * `node:util` carries the real decoder even though the global is shimmed.
     * If a future runtime ships without full ICU this cannot run, and the test
     * says so out loud rather than passing quietly.
     */
    const { TextDecoder: NodeTextDecoder } = require('node:util');
    let node: InstanceType<typeof NodeTextDecoder>;
    try {
      node = new NodeTextDecoder('windows-1252');
    } catch {
      throw new Error('no windows-1252 decoder to check the table against — this test cannot verify itself');
    }

    const mismatches: string[] = [];
    for (let b = 0; b <= 0xff; b++) {
      const theirs = node.decode(Uint8Array.of(b));
      const mine = cp1252Char(b);
      if (mine !== theirs) {
        mismatches.push(`0x${b.toString(16)}: mine=${JSON.stringify(mine)} node=${JSON.stringify(theirs)}`);
      }
    }
    expect(mismatches).toEqual([]);
  });

  it('CATCHES a real file put through the exact round trip that broke one', () => {
    // Not a synthetic string — the actual mangling, applied to the actual file
    // it happened to, so this cannot drift away from the bug it guards.
    const real = readFileSync(
      join(MOBILE, 'src', 'components', 'dispatch', 'paper', 'PaperDesk.tsx'), 'utf8');
    const mangled = decodeCp1252(Buffer.from(real, 'utf8'));

    const found = firstBadLine(mangled);
    expect(found).not.toBeNull();
    expect(found!.was).toContain('â');            // what a reader would see
    expect(found!.shouldBe).toContain('─');       // what it should have been
  });

  it('and does NOT cry wolf on text this app will really hold', () => {
    /**
     * Every one of these is legitimate and every one of them defeats a
     * shape-based detector. A film app WILL carry accented titles beside
     * typographic punctuation; a guard that fails on `José’s` gets disabled the
     * first week, and a disabled guard is worse than none.
     */
    for (const honest of [
      'José’s — a film about “nothing”',        // accent + curly quote + dash
      'À bout de souffle',                       // leading accent
      'Amélie, Caché, Persona',                  // accents mid-word
      'أي فيلم لأوزو تشاهد البيت؟',              // the RTL fixture in the ballot test
      '/* ═══ THE WIRE DESK ═══ */',             // the box rules in every header
      'plain ascii, nothing to see',
      '25,000 characters — the essay ceiling',
      'Œuvre · ½ · ° · ±',                       // CP1252-representable oddities
    ]) {
      expect(`${honest} -> ${unmangle(honest) ?? 'clean'}`).toBe(`${honest} -> clean`);
    }
  });
});

/**
 * This file is the one place in the repo that holds mangled text ON PURPOSE —
 * the worked example in the docstring at the top. The sweep found it on the
 * first run, which is a true positive on data rather than damage, and is the
 * best evidence the sweep works at all. Excluded by exact path, never by a
 * pattern that could quietly cover a real file.
 */
const THIS_FILE = join(MOBILE, 'src', 'utils', '__tests__', 'everyFileSurvivedTheShell.guard.test.ts');

const BOM = Buffer.from([0xef, 0xbb, 0xbf]);

/**
 * Every file, read ONCE. Both checks below want the same bytes, and walking the
 * tree twice doubled the cost of the slowest guard in the suite for nothing.
 */
const scan = (() => {
  const mangled: string[] = [];
  const bommed: string[] = [];
  for (const file of ROOTS.flatMap((r) => walk(r))) {
    if (file === THIS_FILE) continue;
    const buf = readFileSync(file);
    const name = file.slice(REPO.length + 1);

    if (buf.subarray(0, 3).equals(BOM)) bommed.push(name);

    let text: string;
    try { text = utf8.decode(buf); } catch { mangled.push(`${name}  — NOT VALID UTF-8`); continue; }

    const bad = firstBadLine(text);
    if (bad) {
      mangled.push(
        `${name}:${bad.line}\n` +
        `        is:         ${bad.was}\n` +
        `        should be:  ${bad.shouldBe}`);
    }
  }
  return { mangled, bommed };
})();

describe('no file in this repo was round-tripped through the shell', () => {
  it('every source file is intact', () => {
    // If this fails: DO NOT hand-retype the characters. `git checkout --` the
    // file and re-apply the edit with a tool that reads and writes UTF-8.
    expect(scan.mangled).toEqual([]);
  });

  it('and none of them carries a UTF-8 BOM', () => {
    // PowerShell's `Set-Content -Encoding utf8` prepends one. Harmless to a
    // compiler, not harmless to a shebang, a .sql run through psql, or a diff.
    expect(scan.bommed).toEqual([]);
  });
});
