/**
 * theDatabaseCleansAsTheAppDoes.test.ts — one cleaning, in the app and in the database.
 * ─────────────────────────────────────────────────────────────────────────────
 * The app cleans a member's words before it sends them (cleanForStorage). The
 * website sends what was typed, and the public key writes straight to a table,
 * so the database cleans them again, with public.clean_member_text. Two cleaners
 * written in two languages agree only while something holds them to the same
 * answers: this corpus.
 *
 * Every case is built here from the cleaner's own rules: each invisible
 * character, each control character, each character trim() takes from an end,
 * the joiners at every edge of the scripts and emoji they join, the breaks and
 * runs that collapse. Its answers are cleanForStorage's. The sealed E2E world,
 * built from production's snapshot, asks clean_member_text the same questions
 * (mobile/e2e/db/verify-cleaning.mjs).
 *
 * After a deliberate change to the cleaning, write the corpus again:
 *   UPDATE_MEMBER_TEXT_CORPUS=1 npx jest theDatabaseCleansAsTheAppDoes
 */
import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { cleanForStorage, INVISIBLE_CHAR_CLASS } from '../sanitizeInput';

const CORPUS_PATH = join(__dirname, '..', '..', '..', 'e2e', 'db', 'member-text.corpus.json');

type Case = { case: string; input: string; output: string };

const ch = (...codes: number[]) => String.fromCodePoint(...codes);
const hex = (c: number) => 'U+' + c.toString(16).toUpperCase().padStart(4, '0');

const ZWNJ = 0x200c;
const ZWJ = 0x200d;
const BEH = 0x0628;  // ب, a joining letter
const LS = 0x2028;
const PS = 0x2029;

/** The code points INVISIBLE_CHAR_CLASS names, its ranges spelled out. */
function invisibleCodes(): number[] {
  const out: number[] = [];
  const parts = INVISIBLE_CHAR_CLASS.split('\\u').filter(Boolean);
  for (let i = 0; i < parts.length; i++) {
    const [first, rest] = [parts[i].slice(0, 4), parts[i].slice(4)];
    const start = parseInt(first, 16);
    if (rest === '-') {
      const end = parseInt(parts[++i].slice(0, 4), 16);
      for (let c = start; c <= end; c++) out.push(c);
    } else {
      out.push(start);
    }
  }
  return out;
}

const CONTROL_CODES = [...Array.from({ length: 31 }, (_, i) => i + 1), 0x7f];

/** Every character trim() takes from an end. */
const TRIMMED_CODES = Array.from({ length: 0xffff }, (_, i) => i + 1)
  .filter((c) => (c < 0xd800 || c > 0xdfff) && ch(c).trim() === '');

function cases(): Omit<Case, 'output'>[] {
  const out: Omit<Case, 'output'>[] = [];
  const add = (name: string, input: string) => out.push({ case: name, input });

  for (const c of invisibleCodes()) {
    add(`${hex(c)} between two Latin letters`, `a${ch(c)}b`);
    add(`${hex(c)} between two joining letters`, ch(BEH, c, BEH));
  }
  for (const c of CONTROL_CODES) add(`control ${hex(c)} between two letters`, `a${ch(c)}b`);
  for (const c of TRIMMED_CODES) {
    add(`${hex(c)} at both ends`, `${ch(c)}words${ch(c)}`);
    add(`${hex(c)} inside`, `two${ch(c)}words`);
  }

  add('a line separator', `the ending.${ch(LS)}Then`);
  add('a paragraph separator', `the ending.${ch(PS)}Then`);
  add('a line separator at each end', `${ch(LS)}words${ch(LS)}`);
  add('a separator that makes four breaks', `a\n\n${ch(LS)}\nb`);
  for (let k = 1; k <= 6; k++) add(`${k} line breaks`, `a${'\n'.repeat(k)}b`);
  add('four carriage-return line breaks', `a${'\r\n'.repeat(4)}b`);
  for (const k of [2, 9, 10, 11, 30]) add(`${k} spaces`, `a${' '.repeat(k)}b`);
  add('ten tabs', `a${'\t'.repeat(10)}b`);
  add('spaces and tabs, ten in all', `a${' \t'.repeat(5)}b`);
  add('a control character that joins two runs of five spaces', `a${' '.repeat(5)}${ch(1)}${' '.repeat(5)}b`);

  add('empty', '');
  add('only spaces', '   ');
  add('only invisible characters', ch(0x200b, 0x202e, 0xfeff));

  // The joiners: kept where they join, gone elsewhere.
  add('a Persian word with its non-joiner', ch(0x0645, 0x06cc, ZWNJ, 0x062e, 0x0648, 0x0627, 0x0647, 0x0645));
  add('two non-joiners between joining letters', ch(BEH, ZWNJ, ZWNJ, BEH));
  add('a joiner and a non-joiner between joining letters', ch(BEH, ZWJ, ZWNJ, BEH));
  add('a non-joiner after an invisible character', ch(BEH, 0x200b, ZWNJ, BEH));
  add('a non-joiner at the start', ch(ZWNJ, BEH));
  add('a non-joiner at the end', ch(BEH, ZWNJ));
  add('a non-joiner before a space', ch(BEH, ZWNJ, 0x20, BEH));
  add('a joiner between Latin letters', `a${ch(ZWJ)}b`);
  add('a non-joiner between two emoji', ch(0x1f469, ZWNJ, 0x1f4bb));
  add('a woman technologist', ch(0x1f469, ZWJ, 0x1f4bb));
  add('a woman shrugging', ch(0x1f937, ZWJ, 0x2640, 0xfe0f));
  add('a heart on fire', ch(0x2764, 0xfe0f, ZWJ, 0x1f525));
  add('a rainbow flag', ch(0x1f3f3, 0xfe0f, ZWJ, 0x1f308));
  add('a family', ch(0x1f468, ZWJ, 0x1f469, ZWJ, 0x1f467));
  add('a joiner after an emoji, before a letter', ch(0x1f469, ZWJ, 0x61));
  add('a joiner after a letter, before an emoji', ch(0x61, ZWJ, 0x1f469));
  for (const b of [0x05ff, 0x0600, 0x0dff, 0x0e00, 0x0fff, 0x1000, 0x109f, 0x10a0, 0x177f, 0x1780,
    0x18af, 0x18b0, 0xfb4f, 0xfb50, 0xfdff, 0xfe00, 0xfe6f, 0xfe70, 0xfefc, 0xfefd]) {
    add(`a non-joiner between two ${hex(b)}`, ch(b, ZWNJ, b));
    add(`a joiner between two ${hex(b)}`, ch(b, ZWJ, b));
  }
  for (const b of [0x218f, 0x2190, 0x2bff, 0x2c00, 0xfe0e, 0xfe0f]) {
    add(`a joiner from ${hex(b)} to an emoji`, ch(b, ZWJ, 0x1f525));
    add(`a joiner from an emoji to ${hex(b)}`, ch(0x1f525, ZWJ, b));
  }

  add('a review as it is pasted', `${ch(0xa0)}The ending lands.${ch(LS)}${ch(LS)}`
    + `${ch(0x0645, 0x06cc, ZWNJ, 0x062e, 0x0648, 0x0627, 0x0647, 0x0645)} ${ch(0x1f469, ZWJ, 0x1f4bb)}`
    + `${ch(0x202e)}reversed${ch(0x202c)}   ${ch(0xa0)}`);
  add('an essay at the longest the Dispatch takes',
    Array.from({ length: 2500 }, (_, i) => (i % 50 === 49
      ? `${ch(BEH, ZWNJ, BEH)}\n\n\n\n`
      : `word${ch(i % 7 === 0 ? 0x200b : 0x20)}  `)).join('').slice(0, 25000));
  return out;
}

/** JSON whose every character outside printable ASCII is written as an escape. */
function asciiJson(value: unknown): string {
  const text = JSON.stringify(value, null, 1);
  let out = '';
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    out += c === 10 || (c >= 32 && c <= 126) ? text[i] : '\\u' + c.toString(16).padStart(4, '0');
  }
  return out + '\n';
}

describe('the database cleans as the app does', () => {
  const built: Case[] = cases().map((c) => ({ ...c, output: cleanForStorage(c.input) }));

  it('the corpus holds every case, with the answer the app gives', () => {
    if (process.env.UPDATE_MEMBER_TEXT_CORPUS === '1') {
      writeFileSync(CORPUS_PATH, asciiJson(built));
      expect(readFileSync(CORPUS_PATH, 'utf8')).toBe(asciiJson(built));
      return;
    }
    const corpus: Case[] = JSON.parse(readFileSync(CORPUS_PATH, 'utf8'));
    expect(corpus).toEqual(built);
    for (const { input, output } of corpus) expect(cleanForStorage(input)).toBe(output);
  });

  it('the corpus is written in printable ASCII, every other character escaped', () => {
    const text = readFileSync(CORPUS_PATH, 'utf8');
    const outside = [...text].filter((c) => c !== '\n' && (c < ' ' || c > '~'));
    expect(outside).toEqual([]);
  });

  it('every character the cleaning acts on is asked about', () => {
    const asked = new Set<number>();
    for (const { input } of built) for (const c of input) asked.add(c.codePointAt(0)!);
    const missing = [...invisibleCodes(), ...CONTROL_CODES, ...TRIMMED_CODES, LS, PS, ZWNJ, ZWJ]
      .filter((c) => !asked.has(c)).map(hex);
    expect(missing).toEqual([]);
    // The rules the cases are built from are the rules there are: a class that
    // lost a character would ask about fewer.
    expect(invisibleCodes().length).toBe(28);
    expect(TRIMMED_CODES.length).toBe(25);
  });

  it('asks only what a database can hold: no NUL and no half of a character', () => {
    const unheld = built.filter(({ input }) => input.includes(ch(0))
      || /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/.test(input));
    expect(unheld.map((c) => c.case)).toEqual([]);
  });

  it('the answers do change the words: the corpus is not a list of strings left alone', () => {
    expect(built.filter((c) => c.input !== c.output).length).toBeGreaterThan(built.length / 2);
  });
});
