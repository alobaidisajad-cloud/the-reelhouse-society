/**
 * The train runs only after every pending car was rehearsed, applied and probed, in train order, on
 * a copy of production's data on PostgreSQL 17 (supabase/diagnostics/pretrain.cjs), at this very
 * commit: train.cjs's uncopied() reads the stamp pretrain.cjs writes, and refuses anything else.
 */
const train = require('../../supabase/diagnostics/train.cjs') as {
  uncopied: (stamp: unknown, head: string, pending: string[]) => string | null;
  plan: (p: { name: string; path: string; sql: string }[], r: { name: string; path: string; includes: string[] }[]) => { steps?: { kind: string; what: string }[] };
};
const pretrain = require('../../supabase/diagnostics/pretrain.cjs') as {
  stampOf: (sha: string, pending: string[], server: string, at?: string) => Record<string, unknown>;
  rolesSql: (facts: unknown, db: string, superuser?: string) => { must: string[]; may: string[] };
  setting: (item: string) => string;
  restoreFaults: (stderr: string) => string[];
  aclSql: (acl: { kind: string; name: string; acl: string | null }[]) => string[];
  lastWords: (out: string, n?: number) => { cases: string[]; tail: string[] };
  STAND_INS: Record<string, { version: string; sql: string }>;
};

const HEAD = 'a'.repeat(40);
const FIRST = '20990101_01_a.sql';
const CARS = [FIRST, '20990101_02_b.sql'];

describe('the train refuses without a proof on a copy of production', () => {
  const good = pretrain.stampOf(HEAD, CARS, '17.12', '2099-01-01T00:00:00Z');

  it('runs when the stamp names HEAD and the same cars in the same order, proven on 17', () => {
    expect(train.uncopied(good, HEAD, CARS)).toBeNull();
  });

  it('refuses with no stamp, a failed one, or one proven on another major', () => {
    expect(train.uncopied(null, HEAD, CARS)).toMatch(/no proof on a copy of production/);
    expect(train.uncopied({ ...good, passed: false }, HEAD, CARS)).toMatch(/did not pass/);
    expect(train.uncopied({ ...good, server: '18.4' }, HEAD, CARS)).toMatch(/PostgreSQL 18\.4, not production's 17/);
    expect(train.uncopied({ ...good, server: '117.1' }, HEAD, CARS)).toMatch(/not production's 17/);
  });

  it('refuses a stamp for another commit', () => {
    expect(train.uncopied(good, 'b'.repeat(40), CARS)).toMatch(/names aaaaaaaaaaaa, not HEAD bbbbbbbbbbbb/);
  });

  it('refuses a stamp for other cars: one more, one fewer, or the same cars in another order', () => {
    expect(train.uncopied(good, HEAD, [...CARS, '20990101_03_c.sql'])).toMatch(/the train holds/);
    expect(train.uncopied(good, HEAD, CARS.slice(0, 1))).toMatch(/the train holds/);
    expect(train.uncopied(good, HEAD, [...CARS].reverse())).toMatch(/the train holds/);
    expect(train.uncopied({ ...good, pending: undefined }, HEAD, CARS)).toMatch(/names the cars \(none\)/);
  });

  it('asks for the proof before production is touched: after the tree and CI, before the check and the dump', () => {
    const sql = "SET LOCAL lock_timeout = '2s';\nSET LOCAL statement_timeout = '30s';\nCREATE TABLE public.x (id int);\n";
    const p = train.plan([{ name: FIRST, path: `/m/${FIRST}`, sql }], [{ name: 'a_rehearsal.sql', path: '/d/a_rehearsal.sql', includes: [FIRST] }]);
    expect(p.steps?.slice(0, 5).map((s) => s.kind)).toEqual(['tree', 'ci', 'copy', 'check', 'dump']);
  });
});

describe('pretrain: production\'s roles and the copy', () => {
  const facts = {
    roles: [
      { name: 'postgres', super: false, inherit: true, createrole: true, createdb: true, login: true, replication: true, bypassrls: true,
        config: ['search_path="$user", public, extensions', 'statement_timeout=2min'] },
      { name: 'supabase_admin', super: true, inherit: true, createrole: true, createdb: true, login: true, replication: true, bypassrls: true, config: null },
      { name: 'pretrain', super: true, inherit: true, createrole: true, createdb: true, login: true, replication: true, bypassrls: true, config: null },
    ],
    members: [
      { role: 'anon', member: 'postgres', admin: true, inherit: true, set: true },
      { role: 'anon', member: 'postgres', admin: false, inherit: true, set: true },
      { role: 'anon', member: 'pretrain', admin: false, inherit: true, set: true },
    ],
    settings: [{ role: null, config: ['app.name=house'] }, { role: 'postgres', config: ["note=it's"] }],
  };
  const { must, may } = pretrain.rolesSql(facts, 'pretrain_x');

  it('makes each role with production\'s powers, a superuser only where production has one, leaving the local superuser alone', () => {
    const [made, admin] = must;
    expect(must).toHaveLength(2);
    expect(made).toMatch(/CREATE ROLE "postgres"/);
    expect(made).toMatch(/ALTER ROLE "postgres" WITH NOSUPERUSER INHERIT CREATEROLE CREATEDB LOGIN REPLICATION BYPASSRLS;/);
    expect(admin).toMatch(/ALTER ROLE "supabase_admin" WITH SUPERUSER /);
    expect(must.join('\n')).not.toMatch(/"pretrain"/);
  });

  it('grants each membership once, and keeps a list setting unquoted and every other one a literal', () => {
    expect(may.filter((s) => s.startsWith('GRANT'))).toEqual(['GRANT "anon" TO "postgres" WITH ADMIN TRUE, INHERIT TRUE, SET TRUE;']);
    expect(may).toContain('ALTER ROLE "postgres" SET search_path = "$user", public, extensions;');
    expect(may).toContain("ALTER ROLE \"postgres\" SET statement_timeout = '2min';");
    expect(may).toContain("ALTER DATABASE \"pretrain_x\" SET app.name = 'house';");
    expect(may).toContain("ALTER ROLE \"postgres\" IN DATABASE \"pretrain_x\" SET note = 'it''s';");
    expect(pretrain.setting('a=b=c')).toBe("a = 'b=c'");
  });

  it('names every restore error as a fault but the event trigger only Supabase lets postgres own', () => {
    const stderr = [
      'pg_restore: error: could not execute query: ERROR:  permission denied to change owner of event trigger "issue_pg_net_access"',
      'Command was: ALTER EVENT TRIGGER issue_pg_net_access OWNER TO postgres;',
      'pg_restore: error: could not execute query: ERROR:  relation "public.x" does not exist',
      'pg_restore: warning: errors ignored on restore: 2',
    ].join('\n');
    expect(pretrain.restoreFaults(stderr)).toEqual(['pg_restore: error: could not execute query: ERROR:  relation "public.x" does not exist']);
    expect(pretrain.restoreFaults('')).toEqual([]);
  });

  it('gives the stand-ins production\'s grants, a missing grant list as none', () => {
    expect(pretrain.aclSql([{ kind: 'rel', name: 'cron.job', acl: '{postgres=r/supabase_admin}' }, { kind: 'fn', name: 'cron.schedule(text,text)', acl: null }])).toEqual([
      "UPDATE pg_class SET relacl = '{postgres=r/supabase_admin}'::aclitem[] WHERE oid = to_regclass('cron.job');",
      "UPDATE pg_proc SET proacl = NULL WHERE oid = to_regprocedure('cron.schedule(text,text)');",
    ]);
  });

  it('says the failed case and the rehearsal\'s last words', () => {
    const out = ['NOTICE: case 1 passed', 'ERROR:  REHEARSAL FAILED: 1 of 3 cases missed: the plan reads a whole table', 'CONTEXT: PL/pgSQL', 'last'].join('\r\n');
    const w = pretrain.lastWords(out, 2);
    expect(w.cases).toEqual(['ERROR:  REHEARSAL FAILED: 1 of 3 cases missed: the plan reads a whole table']);
    expect(w.tail).toEqual(['CONTEXT: PL/pgSQL', 'last']);
  });

  it('stands in for exactly the extensions production has and a plain PostgreSQL lacks, at production\'s versions, sending nothing', () => {
    expect(Object.fromEntries(Object.entries(pretrain.STAND_INS).map(([k, v]) => [k, v.version])))
      .toEqual({ pg_cron: '1.6.4', pg_net: '0.20.0', supabase_vault: '0.3.1' });
    expect(pretrain.STAND_INS.pg_net?.sql).not.toMatch(/http_header|curl|COPY .* PROGRAM/i);
  });
});
