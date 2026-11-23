/**
 * A rehearsal sets only a role the house allows.
 *
 * A rehearsal runs on production inside one transaction that is rolled back, against members production
 * really has: the house's own admin among them. The rehearsal of 20261122_03 set its members' role to
 * 'member', a word profiles_role_check refuses; on CI no rehearsal member was an admin, so the line
 * touched no row and passed, and on production it touched the admin and stopped the train.
 *
 * This finder reads every rehearsal for a role it writes to profiles and holds each word to the
 * check constraint production holds (the snapshot), so a role the house refuses never reaches a train.
 */
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';

const MOBILE = join(__dirname, '..', '..');
const DIAGNOSTICS = join(MOBILE, 'supabase', 'diagnostics');
const SNAPSHOT = join(MOBILE, 'supabase', 'schema', 'live-schema.sql');

/** The roles profiles_role_check allows, read from the snapshot. */
const allowedRoles = (): string[] => {
  const sql = readFileSync(SNAPSHOT, 'utf8');
  const line = sql.split('\n').find((l) => l.includes('CONSTRAINT profiles_role_check'));
  if (!line) throw new Error('profiles_role_check is not in the snapshot');
  return [...line.matchAll(/'([a-z_]+)'::text/g)].map((m) => m[1]);
};

/** Each role word a rehearsal writes to profiles: SET role = '...', by file. */
const rolesWritten = (): { file: string; role: string }[] =>
  readdirSync(DIAGNOSTICS)
    .filter((f) => f.endsWith('_rehearsal.sql'))
    .flatMap((file) => {
      const sql = readFileSync(join(DIAGNOSTICS, file), 'utf8');
      return [...sql.matchAll(/UPDATE\s+public\.profiles\s+SET\s+role\s*=\s*'([^']+)'/gi)].map((m) => ({ file, role: m[1] }));
    });

describe('a rehearsal sets only a role the house allows', () => {
  it('reads the roles production allows', () => {
    expect(allowedRoles()).toEqual(expect.arrayContaining(['free', 'admin']));
  });

  it('finds the rehearsals that write a role', () => {
    expect(rolesWritten().length).toBeGreaterThan(0);
  });

  it('every role a rehearsal writes is one profiles_role_check allows', () => {
    const allowed = allowedRoles();
    const refused = rolesWritten().filter((w) => !allowed.includes(w.role)).map((w) => `${w.file}: '${w.role}'`);
    expect(refused).toEqual([]);
  });
});
