/**
 * schemaLengthCaps.test.ts — the server's length caps must agree with the app's.
 * ─────────────────────────────────────────────────────────────────────────────
 * Batch 27 / #93. Every comment column was bare `text` with no CHECK, so the
 * only thing keeping a comment a sane size was the client — and the client is
 * not the authority. 20260809_03_comment_length_caps.sql adds the server half.
 *
 * The danger a migration like that creates is DRIFT. A server cap that quietly
 * disagrees with MAX_LENGTHS is worse than no cap at all: the app believes a
 * comment is valid, the composer accepts it, and the database throws it away
 * with a 23514 the member never sees explained. Batch 21 taught this in the
 * other direction ("the write cap IS the render cap"); this is the same law
 * applied across the client/server line.
 *
 * So the numbers are re-derived from BOTH sides and compared. Raising one
 * without the other fails here, at the moment of the edit, instead of surfacing
 * as a member losing a comment they just typed.
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import { MAX_LENGTHS } from '../src/utils/sanitizeInput';

const MIGRATION = join(
  __dirname,
  '..',
  'supabase',
  'migrations',
  '20260809_03_comment_length_caps.sql',
);

/** table → column → the MAX_LENGTHS key that owns it. */
const OWNERSHIP = [
  { table: 'log_comments', column: 'body', field: 'logComment' },
  { table: 'list_comments', column: 'content', field: 'listComment' },
  { table: 'dossier_comments', column: 'body', field: 'dossierComment' },
  { table: 'lounge_messages', column: 'content', field: 'loungeMessage' },
  { table: 'reports', column: 'details', field: 'reportDetails' },
] as const;

describe('server length caps agree with MAX_LENGTHS', () => {
  const sql = readFileSync(MIGRATION, 'utf8');
  /**
   * Comments explain the traps by NAMING them ("a lower bound would reject…"),
   * so asserting against the raw file makes those explanations trip the very
   * checks they document. Only executable SQL is evidence of what runs.
   */
  const exec = sql.replace(/--[^\n]*/g, '');

  /**
   * The VALUES block is the migration's single source of caps. Parsing it — not
   * the comments around it — is what makes this test able to catch a real drift.
   */
  const rows = [...sql.matchAll(/\(\s*'([a-z_]+)',\s*'([a-z_]+)',\s*'([a-z_]+)',\s*(\d+)\)/g)].map(
    (m) => ({ table: m[1], column: m[2], constraint: m[3], cap: Number(m[4]) }),
  );

  it('the migration declares a cap for every column that holds member prose', () => {
    // If this fails the parse broke, and every assertion below would vacuously
    // pass on an empty list. Batch 22 shipped two guards that were satisfied by
    // nothing at all; this is the check that stops a third.
    expect(rows.map((r) => `${r.table}.${r.column}`).sort()).toEqual(
      OWNERSHIP.map((o) => `${o.table}.${o.column}`).sort(),
    );
  });

  it.each(OWNERSHIP)('$table.$column caps at MAX_LENGTHS.$field', ({ table, column, field }) => {
    const row = rows.find((r) => r.table === table && r.column === column);
    expect(row).toBeDefined();
    expect(`${table}.${column}=${row!.cap}`).toBe(`${table}.${column}=${MAX_LENGTHS[field]}`);
  });

  it('caps are an UPPER bound only — a lower bound would break film shares', () => {
    // `lounge_messages.content` DEFAULTs to '' because a shared film carries no
    // text, and `reports.details` DEFAULTs to '' for a report filed without a
    // note. The obvious `length(x) BETWEEN 1 AND N` — which this schema already
    // uses on private_notes — would reject both. Pinned so nobody "tidies" it.
    expect(exec).toMatch(/char_length\(%I\)\s*<=\s*%s/);
    expect(exec).not.toMatch(/BETWEEN|>=\s*1\b/);
  });

  it('counts characters, not bytes', () => {
    // `octet_length` would cap a comment of emoji at a quarter of its allowance,
    // and would disagree with MAX_LENGTHS for every non-ASCII writer.
    expect(exec).toContain('char_length');
    expect(exec).not.toContain('octet_length');
  });
});

describe('client truncation can never be rejected by those caps', () => {
  /**
   * The caps are exact matches, which is only safe because of an asymmetry worth
   * stating: JavaScript's `.length` counts UTF-16 code units, PostgreSQL's
   * `char_length` counts code points, and units are ALWAYS >= code points (a BMP
   * character is 1 of each; an astral character is 2 units but 1 code point).
   * So anything the client considers within the cap is within it on the server
   * too. Never the reverse.
   */
  it('UTF-16 units are never fewer than code points', () => {
    const samples = ['plain text', 'café', '\u{1F3AC}\u{1F3AC}', 'a\u{1F600}b', '한국어'];
    for (const s of samples) {
      expect(`${s}:${s.length >= [...s].length}`).toBe(`${s}:true`);
    }
  });

  it('a cut that would split an emoji does not leave a lone surrogate', () => {
    // PostgreSQL REFUSES an unpaired surrogate outright — `invalid input syntax
    // for type json: Unicode low surrogate must follow a high surrogate` — so a
    // split here does not mangle one character, it destroys the whole write.
    const { sanitizeInput, MAX_LENGTHS: caps } = require('../src/utils/sanitizeInput');
    const cap = caps.logComment;
    const straddling = 'a'.repeat(cap - 1) + '\u{1F3AC}' + 'tail';
    const out: string = sanitizeInput(straddling, 'logComment');

    expect(out.length).toBeLessThanOrEqual(cap);
    // The real assertion: every code unit is either a proper pair or not a
    // surrogate at all. `isWellFormed` says exactly that.
    expect(typeof (out as any).isWellFormed === 'function' ? out.isWellFormed() : true).toBe(true);
    expect(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/.test(out)).toBe(
      false,
    );
  });

  it('a whole emoji at the boundary is KEPT, not dropped for safety', () => {
    // The fix must not be "trim two characters whenever the tail looks scary" —
    // that would silently eat a legitimate final emoji on every long comment.
    const { sanitizeInput, MAX_LENGTHS: caps } = require('../src/utils/sanitizeInput');
    const cap = caps.logComment;
    const exact = 'a'.repeat(cap - 2) + '\u{1F3AC}' + 'more';
    const out: string = sanitizeInput(exact, 'logComment');
    expect(out.endsWith('\u{1F3AC}')).toBe(true);
    expect(out.length).toBe(cap);
  });

  it('ordinary text is untouched by the surrogate handling', () => {
    const { sanitizeInput, MAX_LENGTHS: caps } = require('../src/utils/sanitizeInput');
    const plain = 'b'.repeat(caps.logComment + 50);
    expect(sanitizeInput(plain, 'logComment')).toBe('b'.repeat(caps.logComment));
    expect(sanitizeInput('a short comment.', 'logComment')).toBe('a short comment.');
  });
});
