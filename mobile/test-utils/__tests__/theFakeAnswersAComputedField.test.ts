/**
 * theFakeAnswersAComputedField.test.ts — test-utils/supabaseFake answers a computed field as
 * PostgREST does (round 11).
 *
 * PostgREST lets a select name a function of the table's row as if it were a column: the film's
 * Log Archive asks logs for critiques_seen, the critiques its reader may read. The fake refused it
 * as a column logs does not have. It now takes a computed field the house has (in production or a
 * migration not yet applied), answers it per row from what the test gives, leaves out one the
 * test never gave (as an embed of a table it holds nothing of), and still refuses a name no
 * function of that table's row has.
 */
import { supabaseFake } from '../supabaseFake';
import { readComputedFields } from '../schema';

const A = '11111111-1111-4111-8111-111111111111';
const LOG = '00000000-0000-4000-8000-000000000001';
const OTHER = '00000000-0000-4000-8000-000000000002';
const log = (id: string) => ({ id, user_id: A, film_id: 1, film_title: 'Film', watched_date: '2026-10-01' });

it('reads a computed field from its function, in either form a migration writes it', () => {
  const fields = readComputedFields([
    'CREATE FUNCTION public.critiques_seen(l public.logs) RETURNS integer',
    'CREATE OR REPLACE FUNCTION public.stack_weight("s" public.lists) RETURNS integer',
    'CREATE FUNCTION public.get_feed(p_limit integer) RETURNS SETOF public.logs',
  ].join('\n'));
  expect([...(fields.get('logs') ?? [])]).toEqual(['critiques_seen']);
  expect([...(fields.get('lists') ?? [])]).toEqual(['stack_weight']);
  expect(fields.size).toBe(2);
});

it('answers a computed field per row, from what the test gave', async () => {
  const { client } = supabaseFake({
    rows: { logs: [log(LOG), log(OTHER)] },
    computed: { critiques_seen: (row) => (row.id === LOG ? 2 : 0) },
  });
  const { data, error } = await client.from('logs').select('id, critiques_seen').order('id');
  expect(error).toBeNull();
  expect(data).toEqual([{ id: LOG, critiques_seen: 2 }, { id: OTHER, critiques_seen: 0 }]);
});

it('leaves out a computed field the test never gave', async () => {
  const { client } = supabaseFake({ rows: { logs: [log(LOG)] } });
  const { data } = await client.from('logs').select('id, critiques_seen').single();
  expect(data).toEqual({ id: LOG });
});

it('refuses a name no function of that table\'s row has, and a computed field it was told of that no table has', () => {
  const { client } = supabaseFake({ rows: { lists: [] } });
  expect(() => client.from('lists').select('id, critiques_seen')).toThrow('lists has no column "critiques_seen" (select)');
  expect(() => supabaseFake({ computed: { critiques_heard: () => 1 } })).toThrow('no table has a computed field "critiques_heard"');
});

it('reads a LIKE pattern as PostgreSQL does: % any run, _ any one character, a backslash the next as itself', async () => {
  const B = '22222222-2222-4222-8222-222222222222';
  const C = '33333333-3333-4333-8333-333333333333';
  const { client } = supabaseFake({ rows: { profiles: [{ id: A, username: 'noir_fan' }, { id: B, username: 'noirXfan' }, { id: C, username: 'Noir_Fan' }] } });
  const ids = async (op: 'like' | 'ilike', pattern: string) => ((await client.from('profiles').select('id')[op]('username', pattern)).data as { id: string }[]).map((r) => r.id);
  expect(await ids('like', 'noir_fan')).toEqual([A, B]);
  expect(await ids('like', 'noir\\_fan')).toEqual([A]);
  expect(await ids('ilike', 'noir\\_fan')).toEqual([A, C]);
  expect(await ids('ilike', 'NOIR%')).toEqual([A, B, C]);
});
