/**
 * schemaLengthCaps.test.ts — the database ceiling must outrank BOTH clients.
 * ──────────────────────────────────────────────────────────────────────────
 * Batch 27 / #93. Every text column in this database was bare `text`: 122 of
 * them, exactly one with a length CHECK. 20260809_04_text_length_ceilings.sql
 * adds the server half.
 *
 * The danger a migration like that creates is DRIFT, and it is asymmetric:
 *
 *   ceiling >= client  →  fine. The client refuses first, with a nice message.
 *   ceiling <  client  →  the app accepts writing the member cannot save. They
 *                         lose it to a 23514 nobody explains.
 *
 * TWO apps write these tables. A ceiling checked against only one of them is
 * how this nearly shipped broken: `lounges.name` is 50 on mobile and 60 on the
 * web, and a ceiling of 50 would have started rejecting lounge names the web
 * app still lets people type. So both clients are re-derived here and the
 * ceiling is required to clear the HIGHER of the two.
 */
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { MAX_LENGTHS } from '../src/utils/sanitizeInput';

const MIGRATION = join(
  __dirname,
  '..',
  'supabase',
  'migrations',
  '20260809_04_text_length_ceilings.sql',
);
/** The web app lives beside the mobile app in this repo, on the same database. */
const WEB_LIMITS = join(__dirname, '..', '..', 'src', 'utils', 'limits.ts');

/** column → the limit each client enforces for it. `null` = that client has none. */
const OWNERSHIP: {
  table: string;
  column: string;
  mobile: keyof typeof MAX_LENGTHS | null;
  web: string | null;
}[] = [
  { table: 'log_comments', column: 'body', mobile: 'logComment', web: 'logComment' },
  { table: 'list_comments', column: 'content', mobile: 'listComment', web: 'listComment' },
  { table: 'dossier_comments', column: 'body', mobile: 'dossierComment', web: 'dossierComment' },
  { table: 'lounge_messages', column: 'content', mobile: 'loungeMessage', web: 'loungeMessage' },
  { table: 'reports', column: 'details', mobile: 'reportDetails', web: 'reportDetails' },
  { table: 'logs', column: 'review', mobile: 'review', web: 'review' },
  { table: 'lists', column: 'title', mobile: 'listTitle', web: 'listTitle' },
  { table: 'lists', column: 'description', mobile: 'listDescription', web: 'listDescription' },
  { table: 'dispatch_dossiers', column: 'title', mobile: 'dossierTitle', web: 'dossierTitle' },
  { table: 'dispatch_dossiers', column: 'excerpt', mobile: 'dossierExcerpt', web: 'dossierExcerpt' },
  { table: 'dispatch_dossiers', column: 'full_content', mobile: 'dossierContent', web: 'dossierContent' },
  { table: 'profiles', column: 'bio', mobile: 'bio', web: 'bio' },
  { table: 'profiles', column: 'display_name', mobile: 'displayName', web: 'displayName' },
  { table: 'profiles', column: 'persona', mobile: 'persona', web: null },
  // The one that disagreed: mobile 50, web 60. The ceiling must clear 60.
  { table: 'lounges', column: 'name', mobile: 'loungeName', web: 'loungeName' },
  { table: 'lounges', column: 'description', mobile: 'listDescription', web: 'loungeDescription' },
  // Member-supplied, no client limit on either side — a generous abuse fence.
  { table: 'lounge_messages', column: 'reply_to_content', mobile: null, web: null },
];

/** Parse `('table','column',1234)` rows out of the migration's VALUES blocks. */
function parseCeilings(sql: string): Map<string, number> {
  const m = new Map<string, number>();
  for (const r of sql.matchAll(/\(\s*'([a-z_]+)'\s*,\s*'([a-z_]+)'\s*,\s*(\d+)\s*\)/g)) {
    m.set(`${r[1]}.${r[2]}`, Number(r[3]));
  }
  return m;
}

/** Parse `name: 1234,` out of the web's limits module. */
function parseWebLimits(src: string): Map<string, number> {
  const m = new Map<string, number>();
  for (const r of src.matchAll(/^\s*([a-zA-Z]+)\s*:\s*(\d+)\s*,/gm)) m.set(r[1], Number(r[2]));
  return m;
}

describe('database ceilings vs both clients', () => {
  const sql = readFileSync(MIGRATION, 'utf8');
  /**
   * Comments here explain the traps by NAMING them ("a lower bound would…"), so
   * asserting against the raw file makes the explanations trip the very checks
   * they document. Only executable SQL is evidence of what runs.
   */
  const exec = sql.replace(/--[^\n]*/g, '');
  const ceilings = parseCeilings(exec);

  it('the migration parses — otherwise every assertion below is vacuous', () => {
    // Batch 22 shipped two guards satisfied by nothing at all. This stops a third.
    expect(ceilings.size).toBeGreaterThanOrEqual(30);
    expect(ceilings.get('log_comments.body')).toBe(2000);
  });

  it('both VALUES blocks agree — the verify pass and the apply pass', () => {
    // The migration lists its targets twice: once to check they exist, once to
    // apply. If those lists ever diverge, a column would be verified and never
    // capped — the silent no-op this whole file exists to prevent.
    // Split at the LAST guard, not on every occurrence: a comment marker would
    // be stripped by `exec`, and splitting on all of them breaks the moment a
    // second guard is added — which is exactly what happened when the view
    // check went in. The apply block is everything after the final RAISE.
    const cut = exec.lastIndexOf('ABORTED');
    expect(cut).toBeGreaterThan(0);
    const verify = parseCeilings(exec.slice(0, cut));
    const apply = parseCeilings(exec.slice(cut));
    expect(apply.size).toBeGreaterThanOrEqual(30);
    expect([...apply.entries()].sort()).toEqual([...verify.entries()].sort());
  });

  it.each(OWNERSHIP)('$table.$column has a ceiling', ({ table, column }) => {
    expect(ceilings.get(`${table}.${column}`)).toBeDefined();
  });

  it.each(OWNERSHIP.filter((o) => o.mobile))(
    '$table.$column ceiling clears the MOBILE limit',
    ({ table, column, mobile }) => {
      const ceiling = ceilings.get(`${table}.${column}`)!;
      const client = MAX_LENGTHS[mobile!];
      expect(`${table}.${column} ceiling=${ceiling} >= mobile=${client}: ${ceiling >= client}`).toBe(
        `${table}.${column} ceiling=${ceiling} >= mobile=${client}: true`,
      );
    },
  );

  describe('the web app', () => {
    it('ships a limits module (both apps write one database)', () => {
      expect(existsSync(WEB_LIMITS)).toBe(true);
    });

    const web = existsSync(WEB_LIMITS) ? parseWebLimits(readFileSync(WEB_LIMITS, 'utf8')) : new Map();

    it('that module parses', () => {
      expect(web.size).toBeGreaterThanOrEqual(10);
    });

    it.each(OWNERSHIP.filter((o) => o.web))(
      '$table.$column ceiling clears the WEB limit',
      ({ table, column, web: key }) => {
        const ceiling = ceilings.get(`${table}.${column}`)!;
        const client = web.get(key!);
        expect(`${key} present: ${client !== undefined}`).toBe(`${key} present: true`);
        expect(`${table}.${column} ceiling=${ceiling} >= web=${client}: ${ceiling >= client!}`).toBe(
          `${table}.${column} ceiling=${ceiling} >= web=${client}: true`,
        );
      },
    );

    it('lounges.name clears the web even though mobile is lower', () => {
      // Pinned because it is the case that proved one client is not enough.
      expect(MAX_LENGTHS.loungeName).toBe(50);
      expect(web.get('loungeName')).toBe(60);
      expect(ceilings.get('lounges.name')).toBeGreaterThanOrEqual(60);
    });
  });

  it('ceilings are an UPPER bound only', () => {
    // `lounge_messages.content` DEFAULTs to '' for a shared film that carries no
    // text, AND withdrawing a message sets it to ''. `BETWEEN 1 AND N` — the
    // shape this schema already uses on private_notes — would break both.
    expect(exec).toMatch(/char_length\(%I\)\s*<=\s*%s/);
    expect(exec).not.toMatch(/BETWEEN|>=\s*1\b/);
  });

  it('counts characters, not bytes', () => {
    // `octet_length` would cap a comment of emoji at a quarter of its allowance
    // and disagree with both clients for every non-ASCII writer.
    expect(exec).toContain('char_length');
    expect(exec).not.toContain('octet_length');
  });

  it('a missing column ABORTS instead of skipping', () => {
    // The first draft printed "skipped (already present, or column missing)" for
    // both — a hole left open and a job already done, reported identically. The
    // repo and production genuinely disagree about these names, so this matters.
    expect(exec).toMatch(/RAISE EXCEPTION/);
    expect(exec).toMatch(/ABORTED/);
  });

  it('refuses to WAIT for a lock rather than queueing behind live traffic', () => {
    // ADD CONSTRAINT takes ACCESS EXCLUSIVE. The tables are small so the scan is
    // instant — the risk is the wait. Without a lock_timeout, one in-flight query
    // makes this queue, and every read and write arriving afterwards queues
    // behind it. A clean retry beats a stalled app. Proven on a real held lock:
    // aborts at 3s instead of hanging, and the transaction rolls back whole.
    expect(exec).toMatch(/SET\s+LOCAL\s+lock_timeout/i);
    expect(exec).toMatch(/SET\s+LOCAL\s+statement_timeout/i);
  });

  it('refuses a target that is not an ordinary table', () => {
    // A CHECK cannot live on a view, and ALTER TABLE against one fails with a
    // message about the wrong thing. Every target is a table in the snapshot —
    // that is a fact about a snapshot, not about the live database.
    expect(exec).toMatch(/relkind\s*=\s*'r'/);
    expect(exec).toMatch(/not ordinary tables/);
  });

  it('leaves server-DERIVED text alone', () => {
    // `notifications.message` is assembled by a trigger from `logs.film_title`.
    // A CHECK there aborts the trigger and the member's comment with it. The
    // source is bounded instead. Same for the moderation and error tables: a
    // rejection blocks a moderation action, which is worse than the oversize.
    for (const forbidden of [
      'notifications',
      'error_logs',
      'mod_actions',
      'warnings',
      'tips',
      'resolution_notes',
      'ban_reason',
      'suspension_reason',
    ]) {
      expect(`${forbidden} capped: ${exec.includes(`'${forbidden}'`)}`).toBe(
        `${forbidden} capped: false`,
      );
    }
    // ...but the source that feeds the notification IS bounded.
    expect(ceilings.get('logs.film_title')).toBeDefined();
  });
});

describe('client truncation can never be rejected by a ceiling', () => {
  /**
   * Exact-match ceilings are only safe because of an asymmetry worth stating:
   * JavaScript's `.length` counts UTF-16 code units, PostgreSQL's `char_length`
   * counts code points, and units are ALWAYS >= code points (a BMP character is
   * 1 of each; an astral character is 2 units but 1 code point). So anything a
   * client considers within its limit is within the ceiling too. Never the
   * reverse. Verified against PostgreSQL 17 on a UTF8 database.
   */
  it('UTF-16 units are never fewer than code points', () => {
    for (const s of ['plain text', 'café', '\u{1F3AC}\u{1F3AC}', 'a\u{1F600}b', '한국어']) {
      expect(`${s}:${s.length >= [...s].length}`).toBe(`${s}:true`);
    }
  });

  it('a cut that would split an emoji does not leave a lone surrogate', () => {
    // PostgreSQL REFUSES an unpaired surrogate outright — `invalid input syntax
    // for type json: Unicode low surrogate must follow a high surrogate` — so a
    // split does not mangle one character, it destroys the whole write.
    const { sanitizeInput, MAX_LENGTHS: caps } = require('../src/utils/sanitizeInput');
    const out: string = sanitizeInput(
      'a'.repeat(caps.logComment - 1) + '\u{1F3AC}' + 'tail',
      'logComment',
    );
    expect(out.length).toBeLessThanOrEqual(caps.logComment);
    expect(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/.test(out)).toBe(
      false,
    );
  });

  it('a whole emoji at the boundary is KEPT, not dropped for safety', () => {
    // The fix must not be "trim whenever the tail looks scary" — that would eat
    // a legitimate final emoji off every long comment.
    const { sanitizeInput, MAX_LENGTHS: caps } = require('../src/utils/sanitizeInput');
    const out: string = sanitizeInput(
      'a'.repeat(caps.logComment - 2) + '\u{1F3AC}' + 'more',
      'logComment',
    );
    expect(out.endsWith('\u{1F3AC}')).toBe(true);
    expect(out.length).toBe(caps.logComment);
  });

  it('ordinary text is untouched by the surrogate handling', () => {
    const { sanitizeInput, MAX_LENGTHS: caps } = require('../src/utils/sanitizeInput');
    expect(sanitizeInput('b'.repeat(caps.logComment + 50), 'logComment')).toBe(
      'b'.repeat(caps.logComment),
    );
    expect(sanitizeInput('a short comment.', 'logComment')).toBe('a short comment.');
  });
});
