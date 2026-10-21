/**
 * theFakeIsAsStrictAsTheHouse.test.ts — test-utils/supabaseFake refuses what
 * production refuses and answers as PostgREST answers (TST-05, TST-06,
 * TST-10). Each refusal is asked for and seen; each answer is the one the real
 * client gets.
 */
import { MAX_ROWS, supabaseFake } from '../supabaseFake';

const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
const log = (n: number, user = A) => ({
  id: `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`, user_id: user, film_id: n, film_title: `Film ${n}`,
  watched_date: '2026-10-01', rating: n % 5, created_at: `2026-10-${String((n % 28) + 1).padStart(2, '0')}T00:00:00Z`,
});

describe('it refuses what production refuses', () => {
  it('a table or view production does not have', () => {
    expect(() => supabaseFake().client.from('logz')).toThrow('production has no table or view "logz"');
  });

  it('a column the table does not have, in a select, a filter or an order', () => {
    const { client } = supabaseFake({ rows: { logs: [] } });
    expect(() => client.from('logs').select('id, ratting')).toThrow('logs has no column "ratting" (select)');
    expect(() => (client.from('logs').select('id')).eq('userid', A)).toThrow('logs has no column "userid" (eq)');
    expect(() => (client.from('logs').select('id')).order('when')).toThrow('logs has no column "when" (order)');
  });

  it('a row written, or given as a fixture, with a column the table lacks or a non-uuid id', () => {
    expect(() => supabaseFake({ rows: { logs: [{ ...log(1), mood: 'blue' }] } })).toThrow('logs has no column "mood" (rows.logs[0])');
    expect(() => supabaseFake({ rows: { logs: [{ ...log(1), user_id: 'u1' }] } })).toThrow('logs.user_id is a uuid; "u1" is not one');
    const { client } = supabaseFake({ rows: { logs: [] } });
    expect(() => (client.from('logs')).insert({ ...log(2), mood: 'blue' })).toThrow('logs has no column "mood" (insert[0])');
  });

  it('an rpc production has not, or whose arguments no overload takes, or whose answer the test never wrote', async () => {
    const { client } = supabaseFake({ rpc: { get_email_by_username: 'a@b.test' } });
    expect(() => client.rpc('get_emial_by_username', {})).toThrow('production has no function "get_emial_by_username"');
    expect(() => client.rpc('get_email_by_username', { username: 'x' })).toThrow('fits no overload: (lookup_username)');
    expect(() => client.rpc('claim_founding_seat', { p_user_id: A })).toThrow('the test never said what claim_founding_seat answers');
    await expect(client.rpc('get_email_by_username', { lookup_username: 'x' })).resolves.toEqual({ data: 'a@b.test', error: null });
  });

  it('a read of a table the test never said what it holds: no silent empty list', async () => {
    const { client } = supabaseFake();
    await expect(client.from('logs').select('id')).rejects.toThrow('the test never said what logs holds');
  });

  it('a filter it cannot read, unless the test answers the table itself', async () => {
    const strict = supabaseFake({ rows: { logs: [] } });
    expect(() => (strict.client.from('logs').select('id')).or('rating.eq.5,rating.eq.4')).toThrow('or() is not read here');
    const answered = supabaseFake({ answer: { logs: () => [log(7)] } });
    await expect(answered.client.from('logs').select('id')).resolves.toMatchObject({ data: [{ id: log(7).id }] });
  });
});

describe('it answers as PostgREST answers', () => {
  it('.single() with no row, or with several, is PGRST116; with one, the row', async () => {
    const { client } = supabaseFake({ rows: { logs: [log(1), log(2, B), log(3, B)] } });
    await expect((client.from('logs').select('id')).eq('user_id', A).single()).resolves.toMatchObject({ data: { id: log(1).id }, error: null });
    await expect((client.from('logs').select('id')).eq('user_id', B).single()).resolves.toMatchObject({ data: null, error: { code: 'PGRST116' } });
    await expect((client.from('logs').select('id')).eq('film_id', 99).single()).resolves.toMatchObject({ data: null, error: { code: 'PGRST116' } });
  });

  it('.maybeSingle() with no row is null; with several, PGRST116', async () => {
    const { client } = supabaseFake({ rows: { logs: [log(2, B), log(3, B)] } });
    await expect((client.from('logs').select('id')).eq('user_id', A).maybeSingle()).resolves.toEqual({ data: null, error: null, count: null });
    await expect((client.from('logs').select('id')).eq('user_id', B).maybeSingle()).resolves.toMatchObject({ error: { code: 'PGRST116' } });
  });

  it(`sends no more than ${MAX_ROWS} rows in one answer, and counts them all`, async () => {
    const many = Array.from({ length: 1500 }, (_, i) => log(i + 1));
    const { client } = supabaseFake({ rows: { logs: many } });
    const r = await (client.from('logs').select('id', { count: 'exact' }));
    expect(r.data).toHaveLength(MAX_ROWS);
    expect(r.count).toBe(1500);
    const page = await ((client.from('logs').select('id')).order('film_id').range(1000, 1499));
    expect(page.data).toHaveLength(500);
    expect(page.data[0]?.id).toBe(log(1001).id);
  });

  it('filters, orders and limits as asked, and gives each row only the columns selected', async () => {
    const { client } = supabaseFake({ rows: { logs: [log(1), log(2), log(3, B), log(4)] } });
    const r = await ((client.from('logs').select('film_id, rating')).eq('user_id', A).gte('film_id', 2).order('film_id', { ascending: false }).limit(1));
    expect(r.data).toEqual([{ film_id: 4, rating: 4 }]);
  });

  it('keeps what is written, for the reads after it; a write answers rows only when .select() asks', async () => {
    const fake = supabaseFake({ rows: { logs: [log(1)] } });
    await expect((fake.client.from('logs')).insert(log(2))).resolves.toMatchObject({ data: null, error: null });
    await (fake.client.from('logs')).update({ rating: 5 }).eq('film_id', 1);
    await (fake.client.from('logs')).delete().eq('film_id', 2);
    expect(fake.rows('logs').map((r) => [r.film_id, r.rating])).toEqual([[1, 5]]);
    await expect((fake.client.from('logs')).insert(log(3)).select('film_id')).resolves.toMatchObject({ data: [{ film_id: 3 }] });
    expect(fake.asked.map((a) => a.op)).toEqual(['insert', 'update', 'delete', 'insert']);
  });

  it('fails a table the test makes fail, every time, with the error it gave', async () => {
    const { client } = supabaseFake({ fail: { logs: { code: '57014', message: 'canceling statement due to statement timeout' } } });
    await expect(client.from('logs').select('id')).resolves.toMatchObject({ data: null, error: { code: '57014' } });
  });

  it('answers an empty body as postgrest-js reads one: no data and no error, from .single() too', async () => {
    const { client } = supabaseFake({ rows: { logs: [] }, silent: { profiles: true } });
    await expect(client.from('profiles').select('id').eq('id', 'x').single()).resolves.toEqual({ data: null, error: null, count: null });
    await expect(client.from('profiles').select('id')).resolves.toEqual({ data: null, error: null, count: null });
    expect(() => supabaseFake({ silent: { profilez: true } })).toThrow('production has no table or view "profilez"');
  });
});

describe('its second factors (auth.mfa) refuse what the auth server refuses', () => {
  const KEY = { id: '00000000-0000-4000-8000-000000000009', factor_type: 'totp', status: 'verified', friendly_name: 'Tribunal key' } as const;

  it('cannot be asked by a test that never said what factors the account holds', () => {
    expect(() => supabaseFake().client.auth.mfa.listFactors()).toThrow('the test never said what second factors the account holds');
  });

  it('a second key of one name, a factor it does not hold, and a confirmed key removed without the second key', async () => {
    const { client } = supabaseFake({ mfa: { code: '123456', factors: [KEY] } });
    await expect(client.auth.mfa.enroll({ factorType: 'totp', friendlyName: 'Tribunal key' })).resolves.toMatchObject({ data: null, error: { code: 'mfa_factor_name_conflict' } });
    await expect(client.auth.mfa.unenroll({ factorId: 'nope' })).resolves.toMatchObject({ error: { code: 'mfa_factor_not_found' } });
    await expect(client.auth.mfa.unenroll({ factorId: KEY.id })).resolves.toMatchObject({ error: { code: 'insufficient_aal' } });
  });

  it('a code that is not the authenticator\'s; the one that is confirms the key and lifts the session to aal2', async () => {
    const fake = supabaseFake({ mfa: { code: '123456' } });
    const mfa = fake.client.auth.mfa;
    await expect(mfa.getAuthenticatorAssuranceLevel()).resolves.toMatchObject({ data: { currentLevel: 'aal1', nextLevel: 'aal1' } });
    const made = await mfa.enroll({ factorType: 'totp', friendlyName: 'Tribunal key', issuer: 'The ReelHouse Society' });
    expect(made.data.totp.uri).toBe('otpauth://totp/The%20ReelHouse%20Society:member?secret=JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP&issuer=The%20ReelHouse%20Society');
    await expect(mfa.listFactors()).resolves.toMatchObject({ data: { all: [{ id: made.data.id, status: 'unverified' }], totp: [] } });
    await expect(mfa.challengeAndVerify({ factorId: made.data.id, code: '654321' })).resolves.toMatchObject({ error: { code: 'mfa_verification_failed' } });
    expect(fake.mfa.level()).toBe('aal1');
    await expect(mfa.challengeAndVerify({ factorId: made.data.id, code: '123456' })).resolves.toMatchObject({ error: null });
    expect([fake.mfa.level(), fake.mfa.factors().map((f) => f.status)]).toEqual(['aal2', ['verified']]);
    expect(fake.mfa.asked.map((a) => a.call)).toEqual(['level', 'enroll', 'list', 'verify', 'verify']);
  });

  it('fails a call the test makes fail, with the error it gave, handed back as supabase-js hands it', async () => {
    const { client } = supabaseFake({ mfa: { code: '1', fail: { list: { code: 'unexpected_failure', message: 'Failed to fetch' } } } });
    await expect(client.auth.mfa.listFactors()).resolves.toEqual({ data: null, error: { code: 'unexpected_failure', message: 'Failed to fetch' } });
  });
});
