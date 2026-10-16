/**
 * aQueuedFollowFindsItsMember.test.ts — utils/mutationExecutor.ts, the social replays and the
 * Lounge's: a follow or a follow request goes to the member the phone already knew, and is looked
 * up by handle only when it knew none; a handle that names no one is skipped, and said so. An
 * unfollow ends both a follow and a pending request, and nothing else. An endorsement taken back
 * names its target, or is refused before it can delete every endorsement the member made. A Lounge
 * message is sent under its own id, as text unless it says otherwise, cleaned and cut, with only
 * what it carries, less the sender's name an older build's carried (a message has no such
 * column); a withdrawal the house refuses is raised. A rank queued for sync goes to the
 * house's function as the signed-in member, and is refused only when queued for someone else.
 */
import { supabaseFake } from '@/test-utils/supabaseFake';
import { executeMutation } from '../mutationExecutor';

const ME = '11111111-1111-4111-8111-111111111111';
const THEM = '33333333-3333-4333-8333-333333333333';
const KANE = '44444444-4444-4444-8444-444444444444';
const LOG = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const LIST = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
const LOUNGE = '55555555-5555-4555-8555-555555555555';
const MESSAGE = '66666666-6666-4666-8666-666666666666';
const STAND_IN = '77777777-7777-4777-8777-777777777777';

type Row = Record<string, unknown>;

/** What withdraw_lounge_message answers. */
let mockWithdraw: unknown = null;
const upserts: { table: string; options: unknown }[] = [];

const build = (rows: Record<string, Row[]> = {}) => {
  const house = supabaseFake({ rows, rpc: { withdraw_lounge_message: () => mockWithdraw } });
  const from = house.client.from;
  house.client.from = (table: string) => {
    const q = from(table);
    const upsert = q.upsert;
    q.upsert = (values, options) => { upserts.push({ table, options }); return upsert(values, options); };
    return q;
  };
  return house;
};

let mockHouse = build();
let mockSession: Row | null = null;
jest.mock('@/src/lib/supabase', () => ({
  get supabase() { return { ...mockHouse.client, auth: { getSession: async () => ({ data: { session: mockSession } }) } }; },
}));
jest.mock('@/src/components/lobby/wallRead', () => ({ wallMayHaveChanged: jest.fn() }));
jest.mock('@/src/stores/auth', () => ({ useAuthStore: { getState: () => ({ user: null }) } }));
jest.mock('@/src/utils/logger', () => ({ logger: { warn: jest.fn(), error: jest.fn(), info: jest.fn(), debug: jest.fn() } }));
const { logger } = jest.requireMock('@/src/utils/logger') as { logger: { warn: jest.Mock } };

const replay = (type: string, payload: Row) =>
  executeMutation({ id: 'q1', type: type as never, payload, timestamp: 0 }, {});

const asked = () => mockHouse.asked.map(({ table, op, columns, filters, one, values }) => ({ table, op, columns, filters, one, values }));

/** Kane, by handle. */
const PROFILES = { profiles: [{ id: KANE, username: 'kane' }] };
const READ_KANE = { table: 'profiles', op: 'select', columns: ['id'], filters: [['eq', 'username', 'kane']], one: 'maybeSingle', values: null };

beforeEach(() => {
  mockHouse = build(PROFILES);
  mockSession = null;
  mockWithdraw = null;
  upserts.length = 0;
  logger.warn.mockClear();
});

describe.each([
  ['follow_user', 'follow'],
  ['follow_request_user', 'follow_request'],
])('%s', (type, kind) => {
  const written = (target: string) => ({ table: 'interactions', op: 'upsert', columns: [], filters: [], one: null, values: [{ user_id: ME, target_user_id: target, type: kind }] });

  it(`files a ${kind} to the member the phone already knew, and looks no one up`, async () => {
    await expect(replay(type, { user_id: ME, target_username: 'kane', target_user_id: THEM })).resolves.toStrictEqual({});
    expect(asked()).toStrictEqual([written(THEM)]);
    expect(upserts).toEqual([{ table: 'interactions', options: { onConflict: 'user_id,target_user_id,type', ignoreDuplicates: true } }]);
  });

  it(`looks the member up by handle when the phone knew no one, and files the ${kind} to them`, async () => {
    await replay(type, { user_id: ME, target_username: 'kane', target_user_id: null });
    expect(asked()).toStrictEqual([READ_KANE, written(KANE)]);
  });

  it('skips a handle that names no one, writes nothing, and says so', async () => {
    await expect(replay(type, { user_id: ME, target_username: 'nobody' })).resolves.toStrictEqual({});
    expect(asked().map((a) => a.op)).toEqual(['select']);
    expect(logger.warn.mock.calls).toEqual([[`[MutationExecutor] ${type}: Could not resolve @nobody — skipping.`]]);
  });
});

describe('unfollow_user', () => {
  const ROWS = (): Record<string, Row[]> => ({
    ...PROFILES,
    interactions: [
      { user_id: ME, target_user_id: KANE, type: 'follow' },
      { user_id: ME, target_user_id: KANE, type: 'follow_request' },
      { user_id: ME, target_user_id: KANE, type: 'mute' },
      { user_id: ME, target_user_id: THEM, type: 'follow' },
      { user_id: KANE, target_user_id: ME, type: 'follow' },
    ],
  });

  it('ends the member\'s follow and pending request of the member the phone knew, and nothing else', async () => {
    mockHouse = build(ROWS());
    await replay('unfollow_user', { user_id: ME, target_username: 'someone', target_user_id: KANE });
    expect(asked()).toStrictEqual([{
      table: 'interactions', op: 'delete', columns: [], one: null, values: null,
      filters: [['eq', 'user_id', ME], ['eq', 'target_user_id', KANE], ['in', 'type', ['follow', 'follow_request']]],
    }]);
    expect(mockHouse.rows('interactions')).toEqual([
      { user_id: ME, target_user_id: KANE, type: 'mute' },
      { user_id: ME, target_user_id: THEM, type: 'follow' },
      { user_id: KANE, target_user_id: ME, type: 'follow' },
    ]);
  });

  it('looks the member up by handle when the phone knew no one', async () => {
    mockHouse = build(ROWS());
    await replay('unfollow_user', { user_id: ME, target_username: 'kane' });
    expect(asked()[0]).toStrictEqual(READ_KANE);
    expect(mockHouse.rows('interactions')).toHaveLength(3);
  });
});

describe('remove_endorsement', () => {
  const ENDORSED = [
    { user_id: ME, target_log_id: LOG, type: 'endorse_log' },
    { user_id: ME, target_list_id: LIST, type: 'endorse_list' },
  ];

  it('refuses an endorsement that names no target, and deletes nothing', async () => {
    mockHouse = build({ interactions: ENDORSED.map((r) => ({ ...r })) });
    await expect(replay('remove_endorsement', { user_id: ME, type: 'endorse_log' }))
      .rejects.toThrow(new Error('[MutationExecutor] remove_endorsement requires a valid target ID to prevent mass deletion.'));
    expect(mockHouse.asked).toEqual([]);
    expect(mockHouse.rows('interactions')).toHaveLength(2);
  });

  it('takes back the member\'s endorsement of a stack alone', async () => {
    mockHouse = build({ interactions: ENDORSED.map((r) => ({ ...r })) });
    await replay('remove_endorsement', { user_id: ME, target_list_id: LIST });
    expect(asked()[0]?.filters).toEqual([['eq', 'user_id', ME], ['eq', 'target_list_id', LIST], ['eq', 'type', 'endorse_list']]);
    expect(mockHouse.rows('interactions')).toEqual([ENDORSED[0]]);
  });
});

describe('a Lounge message', () => {
  const sent = { lounge_id: LOUNGE, user_id: ME, content: 'See it twice.' };

  it('is sent under its own id, and the queue is told its stand-in\'s', async () => {
    mockHouse = build({ lounge_messages: [] });
    const out = await replay('send_lounge_message', { ...sent, id: MESSAGE, _tempId: STAND_IN, type: 'film' });
    expect(out).toStrictEqual({ newId: MESSAGE, fakeId: STAND_IN });
    expect(asked()).toStrictEqual([{
      table: 'lounge_messages', op: 'insert', columns: ['id'], filters: [], one: 'maybeSingle',
      values: [{ id: MESSAGE, lounge_id: LOUNGE, user_id: ME, content: 'See it twice.', type: 'film' }],
    }]);
  });

  it('sends an older build\'s message that carried its sender\'s name without it, never refused for it', async () => {
    mockHouse = build({ lounge_messages: [] });
    await expect(replay('send_lounge_message', { ...sent, id: MESSAGE, username: 'orson' })).resolves.toStrictEqual({});
    expect(mockHouse.rows('lounge_messages')).toStrictEqual([
      { id: MESSAGE, lounge_id: LOUNGE, user_id: ME, content: 'See it twice.', type: 'text' },
    ]);
  });

  it('is sent under its stand-in\'s id when it kept no other, as text', async () => {
    mockHouse = build({ lounge_messages: [] });
    await replay('send_lounge_message', { ...sent, _tempId: STAND_IN });
    expect(mockHouse.rows('lounge_messages')).toStrictEqual([
      { id: STAND_IN, lounge_id: LOUNGE, user_id: ME, content: 'See it twice.', type: 'text' },
    ]);
  });

  it('is cleaned and cut to a message\'s length, and reports nothing to rename without a stand-in', async () => {
    mockHouse = build({ lounge_messages: [] });
    await expect(replay('send_lounge_message', { ...sent, id: MESSAGE, content: ` ${'m'.repeat(2001)} ` })).resolves.toStrictEqual({});
    expect(mockHouse.rows('lounge_messages')[0]?.content).toBe('m'.repeat(2000));
  });

  it.each(['delete_lounge_message', 'withdraw_lounge_message'])('%s raises the house\'s refusal', async (type) => {
    const refused = { code: '42501', message: 'not yours' };
    mockWithdraw = { error: refused };
    await expect(replay(type, { message_id: MESSAGE })).rejects.toBe(refused);
  });
});

describe('sync_entitlement', () => {
  const realFetch = global.fetch;
  const realUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
  let fetchMock: jest.Mock;

  beforeEach(() => {
    fetchMock = jest.fn(async () => ({ ok: true, status: 200 }));
    global.fetch = fetchMock as unknown as typeof fetch;
    process.env.EXPO_PUBLIC_SUPABASE_URL = 'https://house.test';
  });
  afterEach(() => {
    global.fetch = realFetch;
    if (realUrl === undefined) delete process.env.EXPO_PUBLIC_SUPABASE_URL;
    else process.env.EXPO_PUBLIC_SUPABASE_URL = realUrl;
  });

  it('sends the rank to the house\'s function as the signed-in member', async () => {
    mockSession = { access_token: 'jwt', user: { id: ME } };
    await expect(replay('sync_entitlement', { tier: 'auteur', user_id: ME })).resolves.toStrictEqual({});
    expect(fetchMock.mock.calls).toEqual([['https://house.test/functions/v1/sync-entitlement', {
      method: 'POST',
      headers: { Authorization: 'Bearer jwt', 'Content-Type': 'application/json' },
      body: '{"tier":"auteur"}',
    }]]);
  });

  it('sends it to the function by its path alone when the house\'s address is not set', async () => {
    delete process.env.EXPO_PUBLIC_SUPABASE_URL;
    mockSession = { access_token: 'jwt', user: { id: ME } };
    await replay('sync_entitlement', { tier: 'auteur' });
    expect(fetchMock.mock.calls[0]?.[0]).toBe('/functions/v1/sync-entitlement');
  });

  it('sends a rank queued for no one in particular as the signed-in member', async () => {
    mockSession = { access_token: 'jwt', user: { id: ME } };
    await expect(replay('sync_entitlement', { tier: 'auteur' })).resolves.toStrictEqual({});
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('sends it when the session names no member to compare with', async () => {
    mockSession = { access_token: 'jwt' };
    await expect(replay('sync_entitlement', { tier: 'auteur', user_id: ME })).resolves.toStrictEqual({});
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('refuses a rank queued for another member, and sends nothing', async () => {
    mockSession = { access_token: 'jwt', user: { id: ME } };
    await expect(replay('sync_entitlement', { tier: 'auteur', user_id: THEM }))
      .rejects.toThrow(new Error('sync_entitlement: queued for a different account — refusing'));
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
