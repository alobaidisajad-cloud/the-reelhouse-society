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

    it('never sets a tombstone without nulling the author first', () => {
      // The failing shape: a handle assignment with no user_id=NULL beside it.
      for (const m of exec.matchAll(/UPDATE\s+public\.(\w+)\s+SET\s+([^;]+);/gi)) {
        const [, table, body] = m;
        if (!/\[deleted\]/.test(body)) continue;
        expect(`${table} nulls the author too: ${/user_id\s*=\s*NULL/i.test(body)}`).toBe(
          `${table} nulls the author too: true`,
        );
      }
    });

    it('the two tables with no denormalised handle only null the author', () => {
      // They read the author through a join, so there is no copy to tombstone.
      for (const t of ['list_comments', 'lounge_messages']) {
        expect(new RegExp(`UPDATE public\\.${t}\\s+SET user_id = NULL`).test(exec)).toBe(true);
      }
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
      expect(exec).toMatch(/uid uuid := auth\.uid\(\)/);
      expect(exec).toMatch(/RAISE EXCEPTION 'Not authenticated'/);
      expect(exec).toMatch(/REVOKE ALL ON FUNCTION public\.request_account_deletion\(\) FROM PUBLIC, anon/);
    });
  });
});
