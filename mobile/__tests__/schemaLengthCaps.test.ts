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
import { existsSync, readFileSync, readdirSync } from 'fs';
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
  for (const r of sql.matchAll(/\(\s*'([a-z0-9_]+)'\s*,\s*'([a-z0-9_]+)'\s*,\s*(\d+)\s*\)/g)) {
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

  it('profiles.username clears what the SERVER can generate, not what clients send', () => {
    // Both clients validate a username to 30, so 50 looked generous. It was not.
    // `handle_new_user` derives one on signup when metadata carries none:
    //     COALESCE(meta->>'username', split_part(NEW.email, '@', 1))
    // An email local-part is up to 64 characters (RFC 5321). A ceiling of 50
    // aborts that trigger and FAILS THE SIGNUP. Reachable today via the public
    // signup endpoint, and the normal path the moment social login is added.
    //
    // The lesson generalises: a ceiling must clear every value that can REACH
    // the column, including ones no client ever typed.
    const RFC5321_LOCAL_PART_MAX = 64;
    const ceiling = ceilings.get('profiles.username')!;
    expect(`username ceiling ${ceiling} > ${RFC5321_LOCAL_PART_MAX}: ${ceiling > RFC5321_LOCAL_PART_MAX}`).toBe(
      `username ceiling ${ceiling} > ${RFC5321_LOCAL_PART_MAX}: true`,
    );
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

describe('EVERY text column in the schema is accounted for', () => {
  /**
   * The gap this closes was never "these columns are unbounded" — it was that
   * nothing could TELL us which ones were. Batch 27 shipped with 34 of 122
   * capped and the remainder invisible, and the list of what was left came from
   * a filter over column NAMES, which quietly discarded 70 of them.
   *
   * So the class is enumerated from the schema itself and every member must be
   * accounted for exactly one way: a length ceiling, or an enum whitelist that
   * makes length moot. A new text column fails this on the day it is added.
   */
  const DUMP = join(__dirname, '..', 'supabase', '_schema_baseline.sql');
  const M04 = join(__dirname, '..', 'supabase', 'migrations', '20260809_04_text_length_ceilings.sql');
  const M05 = join(__dirname, '..', 'supabase', 'migrations', '20260809_05_remaining_text_ceilings.sql');
  const M06 = join(__dirname, '..', 'supabase', 'migrations', '20260810_01_jsonb_ceilings.sql');

  /** Columns whose value set is already restricted to a fixed list. */
  const ENUM_WHITELISTED = [
    'mod_actions.action',
    'notifications.type',
    'profiles.role',
    'profiles.social_visibility',
    'user_blocks.type',
    'user_reports.status',
  ];

  function columnsFromDump() {
    const sql = readFileSync(DUMP, 'utf8');
    const scalar: string[] = [];
    const arr: string[] = [];
    const json: string[] = [];
    for (const [, tbl, body] of sql.matchAll(
      /CREATE TABLE (?:public\.)?"?(\w+)"?\s*\(([\s\S]*?)\n\);/g,
    )) {
      for (let line of body.split('\n')) {
        line = line.trim().replace(/,$/, '');
        if (/^CONSTRAINT/i.test(line)) continue;
        // NB: no \b after the brackets — a word boundary can never match after ']',
        // which is how text[] was first miscounted as plain text.
        const t = line.match(/^"?(\w+)"?\s+text(\s*\[\s*\])?(\s|$|,)/i);
        if (t) {
          (t[2] ? arr : scalar).push(`${tbl}.${t[1]}`);
          continue;
        }
        // jsonb was missed entirely the first time: this guard enumerated `text`
        // and `text[]` and declared the class complete, so 14 unbounded jsonb
        // columns — one of them member-writable — sat behind a passing test.
        // A guard that defines the class too narrowly is worse than none: it
        // reports safety over the gap it cannot see.
        const j = line.match(/^"?(\w+)"?\s+(jsonb|json)(\s|$|,)/i);
        if (j) json.push(`${tbl}.${j[1]}`);
      }
    }
    return { scalar, arr, json };
  }

  function cappedIn(file: string) {
    const sql = readFileSync(file, 'utf8').replace(/--[^\n]*/g, '');
    const out = new Set<string>();
    // scalar rows: ('table','column',cap)
    for (const m of sql.matchAll(/\(\s*'([a-z0-9_]+)'\s*,\s*'([a-z0-9_]+)'\s*,\s*(\d+)\s*\)/g)) {
      out.add(`${m[1]}.${m[2]}`);
    }
    // array rows: ('table','column',items,chars)
    for (const m of sql.matchAll(/\(\s*'([a-z0-9_]+)'\s*,\s*'([a-z0-9_]+)'\s*,\s*\d+\s*,\s*\d+\s*\)/g)) {
      out.add(`${m[1]}.${m[2]}`);
    }
    return out;
  }

  const { scalar, arr, json } = columnsFromDump();
  const covered = new Set([
    ...cappedIn(M04),
    ...cappedIn(M05),
    ...cappedIn(M06),
    ...ENUM_WHITELISTED,
  ]);

  it('a column added by a MIGRATION cannot hide from this test', () => {
    /**
     * THE BLIND SPOT IN THIS FILE.
     *
     * Everything above enumerates the class from `_schema_baseline.sql`, which is
     * a PHOTOGRAPH taken on 2026-06-27. A column added later by a migration is
     * simply not in it, so it is not merely uncapped — it is invisible, and this
     * test reports full coverage over a column it has never seen.
     *
     * That is the same failure this file was written to prevent, one level up: a
     * guard that defines the class too narrowly reports safety over the gap.
     *
     * So the migrations are read as a second source. Any `ADD COLUMN` of a text
     * or jsonb type must have a ceiling declared somewhere in the same tree.
     */
    const dir = join(__dirname, '..', 'supabase', 'migrations');
    const files = readdirSync(dir).filter((f) => f.endsWith('.sql'));
    const all = files.map((f) => readFileSync(join(dir, f), 'utf8')).join('\n');
    const allExec = all.replace(/--[^\n]*/g, '');

    const added: string[] = [];
    for (const m of allExec.matchAll(
      /ALTER TABLE\s+(?:public\.)?(\w+)\s+ADD COLUMN\s+(?:IF NOT EXISTS\s+)?(\w+)\s+(text|jsonb|json)\b/gi,
    )) {
      added.push(`${m[1]}.${m[2]}`);
    }

    const uncapped = added.filter((c) => {
      const [tbl, col] = c.split('.');
      // Three ways a column can be accounted for. An enum whitelist is the
      // strongest of them — a fixed set of values bounds length implicitly — and
      // omitting it here reported `lounge_members.status` and
      // `profiles.entitlement_source` as gaps when both are restricted to four
      // and three literals respectively.
      const hasNamedCeiling = new RegExp(`${tbl}_${col}_len`).test(allExec);
      const inCeilingsTable = new RegExp(`'${tbl}'\\s*,\\s*'${col}'\\s*,\\s*\\d+`).test(allExec);
      // BOTH spellings. A migration writes `status IN ('a','b')`; PostgreSQL
      // stores it as `status = ANY (ARRAY[...])`. Matching only the stored form
      // reported two whitelisted columns as gaps, because the source says IN.
      const hasEnumWhitelist = new RegExp(`${col}\\s*(=\\s*ANY|IN\\s*\\()`).test(allExec);
      return !hasNamedCeiling && !inCeilingsTable && !hasEnumWhitelist;
    });

    expect(`columns added by migration with no ceiling: ${uncapped.join(', ') || 'none'}`).toBe(
      'columns added by migration with no ceiling: none',
    );
  });

  it('the schema parses — otherwise this whole file is vacuous', () => {
    expect(scalar.length).toBeGreaterThan(100);
    expect(arr.length).toBe(3);
    expect(json.length).toBe(14);
  });

  it('every jsonb column is bounded too', () => {
    // `profiles.social_links` is one of the seven columns a member may UPDATE
    // directly, and it is jsonb. Bounding text and stopping there left the same
    // hole open in a different type.
    const orphans = json.filter((c) => !covered.has(c));
    expect(`uncovered jsonb columns: ${orphans.join(', ') || 'none'}`).toBe(
      'uncovered jsonb columns: none',
    );
  });

  it('jsonb is bounded by casting to text, not by storage size', () => {
    // `char_length(col::text)` is immutable and legal in a CHECK. pg_column_size
    // measures COMPRESSED storage, which is not a stable promise to make a member.
    const sql = readFileSync(M06, 'utf8').replace(/--[^\n]*/g, '');
    expect(sql).toContain('char_length(%I::text)');
    expect(sql).not.toContain('pg_column_size');
  });

  it('every scalar text column has a ceiling or a whitelist', () => {
    const orphans = scalar.filter((c) => !covered.has(c));
    expect(`uncovered scalar text columns: ${orphans.join(', ') || 'none'}`).toBe(
      'uncovered scalar text columns: none',
    );
  });

  it('every text[] column is bounded too', () => {
    // char_length() does not exist for an array. These need item count AND
    // joined length, and putting them in the scalar list makes the whole
    // migration error out rather than skip them.
    const orphans = arr.filter((c) => !covered.has(c));
    expect(`uncovered array columns: ${orphans.join(', ') || 'none'}`).toBe(
      'uncovered array columns: none',
    );
  });

  it('no array column appears in the SCALAR list', () => {
    // The scalar loop builds `char_length(%I)`, so an array smuggled into that
    // list produces `char_length(following)` at RUNTIME — a function that does
    // not exist for arrays — and the whole migration errors out.
    //
    // An earlier version of this test searched the file for the literal text
    // `char_length(following)`. It can never appear: the column name arrives
    // through %I at execution time. The guard passed while the mutation it was
    // written to catch sailed through. Parse the VALUES rows instead.
    const sql = readFileSync(M05, 'utf8').replace(/--[^\n]*/g, '');
    const scalarRows = [...sql.matchAll(/\(\s*'([a-z0-9_]+)'\s*,\s*'([a-z0-9_]+)'\s*,\s*\d+\s*\)/g)].map(
      (m) => `${m[1]}.${m[2]}`,
    );
    const smuggled = scalarRows.filter((c) => arr.includes(c));
    expect(`arrays in the scalar list: ${smuggled.join(', ') || 'none'}`).toBe(
      'arrays in the scalar list: none',
    );
    expect(sql).toContain('array_to_string');
  });

  it('no CHECK uses a subquery — PostgreSQL forbids it', () => {
    // "cannot use subquery in check constraint". The first draft bounded array
    // elements with (SELECT MAX(...) FROM unnest(...)) and failed outright.
    const sql = readFileSync(M05, 'utf8').replace(/--[^\n]*/g, '');
    expect(/CHECK[^;]*\(\s*SELECT\s/i.test(sql)).toBe(false);
    expect(/FROM unnest\(/i.test(sql)).toBe(false);
  });
});

describe('the composers agree with the limits they write to', () => {
  /**
   * The comment boxes were hardcoded to 500 while the sanitiser, the web app and
   * the database all allowed 2000 — so the phone, which IS the product, was the
   * most restrictive client by a factor of four. Nobody noticed because the web
   * had no limit at all to compare against.
   *
   * Wiring each box to the constant it writes through means the number cannot
   * drift again: raising a limit raises the box with it.
   */
  const COMPOSERS: [string, keyof typeof MAX_LENGTHS][] = [
    ['src/components/log/LogComments.tsx', 'logComment'],
    // The dossier reader became the Dispatch's reader, and the box a member
    // types a critique into moved with it. The guarantee did not change — the
    // field is still wired to the constant it writes through — so the guard
    // follows the box rather than being deleted with the file it used to be in.
    ['src/components/dispatch/paper/PaperCritiques.tsx', 'critique'],
    ['app/lounge/[id].tsx', 'loungeMessage'],
    ['app/stacks/[id].tsx', 'listComment'],
    ['src/components/ShareToLoungeModal.tsx', 'loungeMessage'],
  ];

  it.each(COMPOSERS)('%s caps typing at MAX_LENGTHS.%s, not a literal', (file, field) => {
    const src = readFileSync(join(__dirname, '..', file), 'utf8');
    expect(`${file} uses the constant: ${src.includes(`maxLength={MAX_LENGTHS.${field}}`)}`).toBe(
      `${file} uses the constant: true`,
    );
  });

  it('no composer smuggles a bare numeric maxLength back in', () => {
    // A literal here is how the 500 survived: invisible next to a 2000 sanitiser.
    for (const [file] of COMPOSERS) {
      const src = readFileSync(join(__dirname, '..', file), 'utf8');
      const literals = [...src.matchAll(/maxLength=\{(\d+)\}/g)].map((m) => m[1]);
      expect(`${file} bare literals: ${literals.join(',') || 'none'}`).toBe(
        `${file} bare literals: none`,
      );
    }
  });

  it('lounge messages are capped in ONE place, not two', () => {
    // `sanitizeInput(content.slice(0, 500), 'loungeMessage')` applied a stricter
    // hardcoded cap in front of the real one. Widening the box would have changed
    // nothing at all — the message was cut at 500 on its way to the database, on
    // both the online and the offline path.
    for (const file of ['src/stores/lounge.ts', 'src/utils/mutationExecutor.ts']) {
      const src = readFileSync(join(__dirname, '..', file), 'utf8');
      const doubled = /\.slice\(\s*0\s*,\s*\d+\s*\)\s*,\s*'loungeMessage'/.test(src);
      expect(`${file} double-caps lounge messages: ${doubled}`).toBe(
        `${file} double-caps lounge messages: false`,
      );
    }
  });

  it('all four kinds of comment allow the same length', () => {
    // A member should not discover that a critique fits on one screen and not
    // another. Pinned so a future change to one carries the others.
    const { logComment, listComment, dossierComment, loungeMessage } = MAX_LENGTHS;
    expect([logComment, listComment, dossierComment, loungeMessage]).toEqual([
      2000, 2000, 2000, 2000,
    ]);
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
