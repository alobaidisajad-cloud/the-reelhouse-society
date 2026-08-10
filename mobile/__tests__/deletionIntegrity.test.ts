/**
 * deletionIntegrity.test.ts — deleting things has to actually delete them.
 * ────────────────────────────────────────────────────────────────────────
 * Batch 28. Three live bugs, each reproduced on a throwaway database before the
 * migration was written:
 *
 *   1. A member could not delete their own log once anyone endorsed it —
 *      interactions.target_log_id was ON DELETE NO ACTION, so the delete raised
 *      a foreign-key violation. 76 endorsements on logs existed at the time.
 *   2. When a delete did succeed the comments survived it: log_comments.log_id
 *      had NO foreign key at all, the only child link never declared.
 *   3. Account deletion failed for everyone, immediately, on profiles_id_fkey.
 *      Apple requires in-app account deletion, so that was a launch blocker.
 *
 * These assertions are about the MIGRATION text rather than a live database,
 * because CI has no database. The live shape is verified separately by
 * `npm run check:backend`.
 */
import { readFileSync } from 'fs';
import { join } from 'path';

const MIGRATION = join(
  __dirname,
  '..',
  'supabase',
  'migrations',
  '20260810_02_deletion_integrity.sql',
);

const sql = readFileSync(MIGRATION, 'utf8');
/** Comments here NAME the traps, so asserting on the raw file trips its own docs. */
const exec = sql.replace(/--[^\n]*/g, '');

/** Parse the ('table','column','parent','ACTION') rows out of the VALUES block. */
function links() {
  const out = new Map<string, { parent: string; action: string }>();
  for (const m of exec.matchAll(
    /\(\s*'([a-z_]+)'\s*,\s*'([a-z_]+)'\s*,\s*'([a-z_]+)'\s*,\s*'(CASCADE|SET NULL)'\s*\)/g,
  )) {
    out.set(`${m[1]}.${m[2]}`, { parent: m[3], action: m[4] });
  }
  return out;
}

describe('deletion integrity', () => {
  const fk = links();

  it('the migration parses — otherwise every assertion below is vacuous', () => {
    expect(fk.size).toBeGreaterThanOrEqual(20);
  });

  describe('a member can delete their own work', () => {
    it.each([
      ['interactions.target_log_id', 'logs'],
      ['interactions.target_list_id', 'lists'],
    ])('%s follows its parent instead of blocking the delete', (key, parent) => {
      // This is the bug itself: NO ACTION here meant one endorsement made a log
      // permanently undeletable by its own author.
      expect(`${key}: ${fk.get(key)?.action} -> ${fk.get(key)?.parent}`).toBe(
        `${key}: CASCADE -> ${parent}`,
      );
    });

    it('log_comments.log_id exists at all', () => {
      // It never did. Deleting a log left its comments pointing at nothing.
      expect(fk.get('log_comments.log_id')).toEqual({ parent: 'logs', action: 'CASCADE' });
    });
  });

  describe('deleting an account', () => {
    it.each([
      'logs.user_id',
      'lists.user_id',
      'watchlists.user_id',
      'vaults.user_id',
      'interactions.user_id',
    ])('%s is personal — it goes with them', (key) => {
      expect(`${key}: ${fk.get(key)?.action}`).toBe(`${key}: CASCADE`);
    });

    it.each([
      'log_comments.user_id',
      'list_comments.user_id',
      'dossier_comments.user_id',
      'lounge_messages.user_id',
      'dispatch_dossiers.user_id',
    ])('%s is shared — the words stay, the name goes', (key) => {
      // Hard-deleting these would tear holes in other people's conversations.
      // A thread with half its replies missing is worse for everyone still in it.
      expect(`${key}: ${fk.get(key)?.action}`).toBe(`${key}: SET NULL`);
    });

    it.each(['mod_actions.admin_id', 'mod_actions.target_user_id', 'warnings.admin_id'])(
      '%s is audit — history outlives the people in it',
      (key) => {
        expect(`${key}: ${fk.get(key)?.action}`).toBe(`${key}: SET NULL`);
      },
    );

    it('the profile itself finally follows the account', () => {
      // profiles.id -> auth.users had no ON DELETE clause at all. It is the one
      // constraint that made deletion impossible: every other blocker could be
      // cleared by hand, the profile row never could.
      expect(exec).toMatch(
        /ADD CONSTRAINT profiles_id_fkey FOREIGN KEY \(id\) REFERENCES auth\.users\(id\) ON DELETE CASCADE/,
      );
    });

    it('the author columns can lose their author', () => {
      // SET NULL is impossible while the column is NOT NULL, and the first
      // cascade would abort the deletion halfway.
      for (const t of [
        'log_comments',
        'list_comments',
        'dossier_comments',
        'lounge_messages',
        'dispatch_dossiers',
      ]) {
        expect(`${t} nullable: ${exec.includes(`('${t}')`)}`).toBe(`${t} nullable: true`);
      }
      expect(exec).toMatch(/ALTER COLUMN user_id DROP NOT NULL/);
    });
  });

  describe('the tombstone survives the trigger', () => {
    /**
     * THE ORDER IS LOAD-BEARING AND INVISIBLE.
     *
     * derive_username_column() fires BEFORE UPDATE and copies the live handle out
     * of profiles into the comment. An UPDATE that sets only the tombstone, while
     * user_id still points at a live profile, is overwritten with the real name —
     * the anonymisation silently does nothing at all. Proven on a throwaway:
     *
     *     SET username='[deleted]'                 -> 'vanishing'   (real name back)
     *     SET user_id=NULL, username='[deleted]'   -> '[deleted]'
     *
     * So both columns must move in ONE statement. Splitting them "for clarity"
     * reintroduces the bug with no visible symptom.
     */
    it.each([
      ['log_comments', 'username'],
      ['dossier_comments', 'username'],
      ['dispatch_dossiers', 'author_username'],
    ])('%s nulls the author and sets the tombstone in the SAME statement', (table, col) => {
      const stmt = new RegExp(
        `UPDATE\\s+public\\.${table}\\s+SET\\s+user_id\\s*=\\s*NULL\\s*,\\s*${col}\\s*=\\s*'\\[deleted\\]'`,
        'i',
      );
      expect(`${table}: ${stmt.test(exec)}`).toBe(`${table}: true`);
    });

    it('never sets a tombstone without nulling the author, WHERE THE TRIGGER RUNS', () => {
      // Scope matters. `derive_username_column` is attached to exactly these
      // tables, and only there can a tombstone be overwritten by a profile lookup.
      //
      // An earlier version of this test demanded `user_id = NULL` beside EVERY
      // '[deleted]' write, and correctly failed when the erasure of frozen names
      // was added — notifications.from_username and lounge_messages
      // .reply_to_username are copies of somebody ELSE'S handle, carry no derive
      // trigger, and have no author of their own to null. The rule was too broad,
      // not the code. A guard aimed wider than the hazard reports false alarms,
      // and a false alarm gets a test deleted.
      const TRIGGERED = ['log_comments', 'dossier_comments', 'dispatch_dossiers', 'video_reviews'];
      for (const m of exec.matchAll(/UPDATE\s+public\.(\w+)\s+SET\s+([^;]+);/gi)) {
        const [, table, body] = m;
        if (!/\[deleted\]/.test(body)) continue;
        if (!TRIGGERED.includes(table)) continue;
        expect(`${table} nulls the author too: ${/user_id\s*=\s*NULL/i.test(body)}`).toBe(
          `${table} nulls the author too: true`,
        );
      }
    });

    it('video_reviews is in that set — it carries the derive trigger too', () => {
      // Easy to miss: the trigger is on four tables, not the three that obviously
      // look like comments.
      expect(exec).toMatch(
        /UPDATE public\.video_reviews SET user_id = NULL, username = '\[deleted\]'/,
      );
    });

    it('the two tables with no denormalised handle only null the author', () => {
      // They read the author through a join, so there is no copy to tombstone.
      for (const t of ['list_comments', 'lounge_messages']) {
        expect(new RegExp(`UPDATE public\\.${t}\\s+SET user_id = NULL`).test(exec)).toBe(true);
      }
    });
  });

  describe('the name is legible nowhere afterwards', () => {
    /**
     * A foreign key can only null an ID. Several columns hold a COPY of the handle
     * taken when the row was written — they are unreachable by any cascade and
     * survive the account entirely. 51 of 51 notifications carried one.
     *
     * Leaving them is residual personal data after an erasure request: the account
     * is gone and the name is still readable. Verified end to end — before, the
     * handle appeared in four places; after, in none.
     */
    it('notifications they caused are DELETED, not tombstoned', () => {
      // The handle is not only in from_username, it is written into the prose:
      // "@divisionops is now following you." — 14 of 51 live rows. Blanking the
      // column leaves the sentence perfectly legible, which is not erasure.
      // A notification from someone who no longer exists is also noise: there is
      // nobody to visit and nothing to answer.
      expect(exec).toMatch(/DELETE FROM public\.notifications WHERE from_user_id = uid/);
      expect(exec).not.toMatch(/UPDATE public\.notifications SET from_username/);
    });

    it('a handle frozen into share metadata is stripped', () => {
      // ShareToLoungeModal writes { log_id, owner_username } into someone ELSE'S
      // message. There is no id inside the json, so this is keyed on the handle.
      expect(exec).toMatch(/metadata - 'owner_username'/);
      expect(exec).toMatch(/- 'author_username'/);
      expect(exec).toMatch(/metadata->>'owner_username' = v_handle/);
    });

    it('the handle is captured while the profile still exists', () => {
      // Several erasures can only be keyed on the name. Read it after the delete
      // and there is nothing left to read it from.
      const capture = exec.indexOf('SELECT username INTO v_handle');
      const del = exec.indexOf('DELETE FROM auth.users');
      expect(`capture(${capture}) before delete(${del}): ${capture > 0 && capture < del}`).toBe(
        `capture(${capture}) before delete(${del}): true`,
      );
    });

    it.each([
      ['tips', 'from_username', 'from_user_id'],
      ['video_reviews', 'username', 'user_id'],
    ])('%s.%s is tombstoned, matched on %s', (table, col, idCol) => {
      const stmt = new RegExp(
        `UPDATE public\\.${table}\\s+SET[^;]*${col}\\s*=\\s*'\\[deleted\\]'[^;]*WHERE[^;]*${idCol}\\s*=\\s*uid`,
        'i',
      );
      expect(`${table}.${col}: ${stmt.test(exec)}`).toBe(`${table}.${col}: true`);
    });

    it('a quoted reply loses the name of who it quoted', () => {
      expect(exec).toMatch(/UPDATE public\.lounge_messages\s+SET reply_to_username = '\[deleted\]'/);
    });

    it('...and does so BEFORE that author becomes null', () => {
      // reply_to_username is reached through the PARENT message's author. Null the
      // author first and there is nothing left to match on — the name would stay.
      const quote = exec.indexOf("SET reply_to_username = '[deleted]'");
      const nullify = exec.indexOf('UPDATE public.lounge_messages SET user_id = NULL');
      expect(`quote(${quote}) before nullify(${nullify}): ${quote > 0 && nullify > 0 && quote < nullify}`).toBe(
        `quote(${quote}) before nullify(${nullify}): true`,
      );
    });
  });

  describe('a lounge outlives the person who started it', () => {
    /**
     * lounges.creator_id -> profiles is ON DELETE CASCADE, so deleting the
     * founder destroys the lounge and every conversation in it. That never fired
     * before ONLY because account deletion was broken — fixing deletion ARMS it.
     *
     * SET NULL is not the escape: every lounge policy reads
     * `auth.uid() = creator_id` and there is NO admin override, so a null creator
     * leaves a lounge nobody can rename, moderate or even delete. Checked against
     * the live policies.
     *
     * So the founder hands it on. Verified end to end: a lounge with two other
     * members passed to the longest-standing one with its messages intact, while
     * a lounge containing only the founder went with them.
     */
    it('transfers the lounge to the longest-standing member', () => {
      expect(exec).toMatch(/UPDATE public\.lounges/);
      expect(exec).toMatch(/SET creator_id =/);
      expect(exec).toMatch(/ORDER BY m\.joined_at ASC/);
    });

    it('never hands it to the departing member or an unapproved one', () => {
      expect(exec).toMatch(/m\.user_id <> uid/);
      expect(exec).toMatch(/m\.status = 'approved'/);
    });

    it('only transfers when a successor actually exists', () => {
      // Without the EXISTS guard the subquery returns NULL, and creator_id is
      // NOT NULL — the whole account deletion would abort.
      expect(exec).toMatch(/AND EXISTS \(SELECT 1 FROM public\.lounge_members/);
    });

    it('runs BEFORE the account is deleted', () => {
      // Afterwards there is nothing left to identify their lounges by.
      const transfer = exec.indexOf('SET creator_id =');
      const del = exec.indexOf('DELETE FROM auth.users');
      expect(`transfer(${transfer}) before delete(${del}): ${transfer > 0 && transfer < del}`).toBe(
        `transfer(${transfer}) before delete(${del}): true`,
      );
    });
  });

  describe('constraint names are an API, not an implementation detail', () => {
    /**
     * PostgREST lets a client disambiguate a join by naming the foreign key:
     *
     *     profiles!logs_user_id_fkey(username, role, avatar_url)
     *
     * Both apps do this in 29 places across 8 constraints. An earlier draft of
     * this migration recreated every key as `<table>_<col>_fk`, which would have
     * renamed 5 of those 8 and broken every one of those queries — including in
     * the TestFlight build already in people's hands, which cannot be patched.
     *
     * So: reuse the captured name. Only a genuinely new key gets a new one.
     */
    const HARDCODED_IN_THE_APPS = [
      'logs_user_id_fkey',
      'lounge_messages_user_id_fkey',
      'lounge_members_user_id_fkey',
      'lounges_creator_id_fkey',
      'interactions_user_id_fkey',
      'interactions_target_user_id_fkey',
      'lounge_message_reactions_user_id_fkey',
      'lists_user_id_fkey',
    ];

    it('recreates each key under the name it already had', () => {
      expect(exec).toMatch(/COALESCE\(v_name,/);
    });

    it('never invents a new name for an existing key', () => {
      // `_fk` was the shape that would have broken things.
      expect(exec).not.toMatch(/'_fk'/);
      expect(exec).not.toMatch(/\|\|\s*'_fk'\s*,/);
    });

    it.each(HARDCODED_IN_THE_APPS)('%s is not renamed by this migration', (name) => {
      // A rename would appear as the literal new name in the file.
      const table = name.replace(/_[a-z_]*_fkey$/, '');
      const renamed = new RegExp(`${table}_[a-z_]+_fk\\b(?!ey)`);
      expect(`${name} renamed: ${renamed.test(exec)}`).toBe(`${name} renamed: false`);
    });

    it('a genuinely new key uses the conventional suffix', () => {
      // log_comments.log_id had no key at all, so it needs one — named the way
      // PostgREST and everyone else expects, in case a client ever hints it.
      expect(exec).toMatch(/_fkey'\)/);
    });
  });

  describe('the migration is safe to run against production', () => {
    it('refuses to wait for a lock', () => {
      expect(exec).toMatch(/SET\s+LOCAL\s+lock_timeout/i);
    });

    it('aborts naming the column when a target is missing', () => {
      expect(exec).toMatch(/RAISE EXCEPTION/);
      expect(exec).toMatch(/ABORTED/);
    });

    it('drops the existing key by lookup, not by guessed name', () => {
      // log_comments.user_id referenced auth.users while its four siblings
      // referenced profiles. Naming the constraint would have missed it.
      expect(exec).toMatch(/SELECT con\.conname INTO v_name/);
      expect(exec).not.toMatch(/DROP CONSTRAINT [a-z_]+_user_id_fkey\b/);
    });

    it('only the account owner can ask to be deleted', () => {
      expect(exec).toMatch(/uid\s+uuid := auth\.uid\(\)/);
      expect(exec).toMatch(/RAISE EXCEPTION 'Not authenticated'/);
      expect(exec).toMatch(/REVOKE ALL ON FUNCTION public\.request_account_deletion\(\) FROM PUBLIC, anon/);
    });
  });
});
