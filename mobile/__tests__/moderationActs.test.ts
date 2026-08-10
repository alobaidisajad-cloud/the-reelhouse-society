/**
 * moderationActs.test.ts — a moderation tool must not report success without acting.
 * ─────────────────────────────────────────────────────────────────────────────────
 * Batch 28, parts 3–4. Verified against production before any of this was written:
 *
 *   `delete_content` was literally `NULL`. The report was marked resolved and the
 *   author was told "the house has removed a piece of your content", and nothing
 *   was removed.
 *
 *   `mute_user` set suspended_until = v_expires_at, which is only assigned when
 *   the action is 'suspend'. So a mute wrote NULL — and if the member was already
 *   suspended it CLEARED the suspension. Worse than a no-op.
 *
 *   And the live one: the WEB Tribunal never called this function at all. It wrote
 *   tables directly, and only ONE table in the database lets a moderator touch
 *   another member's row. Ban and delete both changed zero rows, returned no
 *   error, marked the report resolved, and reported success.
 */
import { readFileSync } from 'fs';
import { join } from 'path';

const MIGRATION = join(
  __dirname,
  '..',
  'supabase',
  'migrations',
  '20260810_03_moderation_actually_acts.sql',
);
const WEB_TRIBUNAL = join(__dirname, '..', '..', 'src', 'pages', 'TribunalPage.tsx');

const sql = readFileSync(MIGRATION, 'utf8');
/** Comments here NAME the traps, so asserting on the raw file trips its own docs. */
const exec = sql.replace(/--[^\n]*/g, '');

describe('every reportable type can actually be removed', () => {
  // The web version handled 3 of 8 and skipped the rest in silence while still
  // reporting "Content destroyed." A report must never be resolvable against
  // content that is still standing.
  const DELETABLE: [string, string][] = [
    ['log', 'logs'],
    ['list', 'lists'],
    ['log_comment', 'log_comments'],
    ['list_comment', 'list_comments'],
    ['dossier', 'dispatch_dossiers'],
    ['dossier_comment', 'dossier_comments'],
  ];

  it.each(DELETABLE)('%s is removed from %s', (type, table) => {
    const stmt = new RegExp(`WHEN '${type}'\\s+THEN DELETE FROM ${table}\\s+WHERE id = v_content_id`);
    expect(`${type}: ${stmt.test(exec)}`).toBe(`${type}: true`);
  });

  it('a lounge message is struck through, never removed', () => {
    // A hole in a transcript reads as tampering and breaks every reply quoting
    // it. Same tombstone withdraw_lounge_message writes — done inline because
    // that function admits only the author or the founder, never an admin.
    expect(exec).toMatch(/UPDATE lounge_messages\s+SET content = '', deleted_at = now\(\)/);
    expect(exec).not.toMatch(/DELETE FROM lounge_messages/);
  });

  it('a profile is refused — removing a person is a ban', () => {
    expect(exec).toMatch(/A profile is not content\. Use ban or permanent_exile/);
  });

  it('an unhandled content type refuses instead of resolving the report', () => {
    // Otherwise a report closes against content nobody touched.
    expect(exec).toMatch(/Cannot remove content of type/);
  });
});

describe('it refuses instead of pretending', () => {
  it('suspend and mute demand a duration', () => {
    // Both previously wrote NULL to suspended_until and told the member they had
    // been punished. Mute was worse: it CLEARED an existing suspension.
    expect(exec).toMatch(
      /p_action IN \('suspend', 'mute_user'\) AND \(p_duration_hours IS NULL OR p_duration_hours <= 0\)/,
    );
    expect(exec).toMatch(/A duration in hours is required for/);
  });

  it('an unknown action is named, not swallowed', () => {
    expect(exec).toMatch(/Unknown moderation action:/);
  });

  it('mute is no longer a no-op', () => {
    // It now sets a real expiry, because a duration is mandatory above.
    expect(exec).toMatch(/WHEN 'mute_user' THEN\s+UPDATE profiles\s+SET suspended_until = v_expires_at/);
  });

  it('the expiry is computed for ANY action that has a duration', () => {
    // The original computed it only `IF p_action = 'suspend'`, which is exactly
    // why mute wrote NULL.
    expect(exec).toMatch(/IF p_duration_hours IS NOT NULL THEN\s+v_expires_at :=/);
    expect(exec).not.toMatch(/IF p_action = 'suspend' AND p_duration_hours IS NOT NULL THEN/);
  });
});

describe('the evidence outlives the content', () => {
  it('the exhibit is captured BEFORE the delete', () => {
    // get_report_evidence resolves the row live and returns found:false once it
    // is gone — proven on a throwaway. Capture afterwards and an appeal has
    // nothing to look at.
    const capture = exec.indexOf('v_snapshot := public.get_report_evidence');
    const del = exec.indexOf("WHEN 'delete_content' THEN");
    expect(`capture(${capture}) before delete(${del}): ${capture > 0 && capture < del}`).toBe(
      `capture(${capture}) before delete(${del}): true`,
    );
  });

  it('it reuses get_report_evidence rather than restating the mapping', () => {
    // Two copies of a content-type mapping drift. The Tribunal displays one of
    // them; this must be the same one.
    expect(exec).toMatch(/public\.get_report_evidence\(p_report_id\)/);
  });

  it('the snapshot is stored with the action that removed it', () => {
    expect(exec).toMatch(/INSERT INTO mod_actions[\s\S]{0,200}content_snapshot/);
  });

  it('the new column carries a ceiling', () => {
    // Batch 27's rule. The coverage test reads a schema SNAPSHOT, so a column
    // added by SQL is invisible to it and would go unbounded unnoticed.
    expect(exec).toMatch(/ADD CONSTRAINT mod_actions_content_snapshot_len/);
    expect(exec).toMatch(/char_length\(content_snapshot::text\) <= \d+/);
  });
});

describe('the actor is never caller-supplied', () => {
  it('p_admin_id is accepted and ignored', () => {
    // Trusting it would let any admin act in another admin's name.
    expect(exec).toMatch(/v_admin_id\s+uuid := auth\.uid\(\)/);
    expect(exec).not.toMatch(/admin_id[^,)\n]*:?=\s*p_admin_id/);
  });

  it('the signature still matches the shipped build', () => {
    // The TestFlight build passes six arguments and cannot be patched. Dropping
    // the dead parameter would break every call it makes.
    expect(exec).toMatch(
      /resolve_moderation_report_v2\(\s*p_report_id uuid,\s*p_action text,\s*p_admin_id uuid,\s*p_reason text,\s*p_duration_hours integer[^,]*,\s*p_notify_user boolean/,
    );
  });

  it('anon cannot call it', () => {
    expect(exec).toMatch(/REVOKE ALL ON FUNCTION public\.resolve_moderation_report_v2[^;]*FROM PUBLIC, anon/);
  });
});

describe('the web Tribunal no longer writes tables directly', () => {
  const web = readFileSync(WEB_TRIBUNAL, 'utf8');

  it('every action goes through the RPC', () => {
    expect(web).toMatch(/supabase\.rpc\('resolve_moderation_report_v2'/);
  });

  it.each(['profiles', 'reports', 'logs', 'lists', 'list_items', 'list_comments'])(
    'it never writes %s directly',
    (table) => {
      // A moderator writing another member's row changes ZERO rows and returns
      // NO error — indistinguishable from success. That is how ban and delete
      // both reported success while doing nothing.
      const write = new RegExp(`from\\('${table}'\\)[\\s\\S]{0,80}\\.(update|delete|insert)\\(`);
      expect(`${table} written directly: ${write.test(web)}`).toBe(`${table} written directly: false`);
    },
  );

  it('it reads the error instead of relying on catch', () => {
    // supabase-js RESOLVES on failure. The old code was wrapped in try/catch and
    // the catch could never fire.
    expect(web).toMatch(/const \{ error \} = await supabase\.rpc\('resolve_moderation_report_v2'/);
    expect(web).toMatch(/if \(error\)/);
  });
});
