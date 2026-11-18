/**
 * A PRIVATE NOTE REFUSED IS SAID (review round 10, A2: noteNotKept,
 * src/stores/domain/logSlice/helpers/logOperations.ts), against the house as strict as it is
 * (test-utils/supabaseFake).
 *
 * A record's private note is written to the Vault after the record is filed. A rank lapsed at the
 * house, the phone still showing it, refused the note: the Vault took it back off the phone, the
 * sheet said RECORD SEALED, and nothing told the member the note was gone. Now each of the three
 * note writes (a new record, a rewatch, an amendment) says it: the rank's door with "the record is
 * sealed; its private note was not kept", the member's standing in the house's own words, or "The
 * record is sealed, but its private note could not be kept." A lost connection says the note waits: the
 * Vault keeps the note for the queue.
 */
import { supabaseFake } from '@/test-utils/supabaseFake';
import { captureError } from '@/src/lib/sentry';
import reelToast from '@/src/utils/reelToast';
import { useAuthStore } from '@/src/stores/auth';
import { useFilmStore } from '@/src/stores/films';
import { useVaultStore } from '@/src/stores/vaultStore';
import { clearOfflineQueue, getOfflineQueue } from '@/src/utils/offlineQueue';
import { mapLogRow } from '@/src/utils/mappers';

let mockHouse = supabaseFake();
jest.mock('@/src/lib/supabase', () => ({ get supabase() { return mockHouse.client; } }));
jest.mock('@/src/lib/sentry', () => ({ captureError: jest.fn(), addBreadcrumb: jest.fn() }));
jest.mock('@/src/utils/reelToast', () => {
  const t = jest.fn() as jest.Mock & { error: jest.Mock; info: jest.Mock; success: jest.Mock };
  t.error = jest.fn();
  t.info = jest.fn();
  t.success = jest.fn();
  return { __esModule: true, default: t };
});

const ME = '33333333-3333-4333-8333-333333333333';
const LOG_ID = '44444444-4444-4444-8444-444444444444';
const VIEWING = '55555555-5555-4555-8555-555555555555';
const NOTE = 'Saw it with my father, the year before he went.';

const RANK = { code: '42501', message: 'The Vault is an Archivist feature' };
const SILENCED = { code: '42501', message: 'Your account has been silenced by The Society.' };
const BROKE = { code: 'XX000', message: 'internal error' };
const NETWORK = { code: '', message: 'Failed to fetch' };

const toast = reelToast as unknown as jest.Mock & { error: jest.Mock; info: jest.Mock; success: jest.Mock };
/** Everything the member was told, in the order told: [kind, sentence]. */
const told = () => [
  ...toast.mock.calls.map(([m]) => ['plain', m]),
  ...toast.info.mock.calls.map(([m]) => ['info', m]),
  ...toast.error.mock.calls.map(([m]) => ['error', m]),
];
const NOT_KEPT = 'The record is sealed, but its private note could not be kept.';

/** The record as the house holds it, already filed once. */
const row = {
  id: LOG_ID, user_id: ME, film_id: 655, film_title: 'Paris, Texas', poster_path: '/p.jpg', year: '1984',
  rating: 4, review: 'The peep-show booth.', status: 'watched', watched_date: '2026-09-01',
  created_at: '2026-09-01T20:00:00Z', view_count: 1, viewing_history: [], updated_at: '2026-11-01T09:00:00.000000+00:00',
  viewing_id: VIEWING,
};
const holdTheRecord = () => {
  const held = mapLogRow(row as never);
  useFilmStore.setState({ logs: [held], _loggedIndex: { 655: held } } as never);
};
/** The house as it stands, the note's write answered with `note`. */
const house = (note: { code: string; message: string }, rows: Record<string, unknown>[] = []) => supabaseFake({
  rows: { logs: rows },
  rpc: { viewing_note_set: { error: note }, log_viewing_add: '66666666-6666-4666-8666-666666666666' },
});
const fileNew = () => useFilmStore.getState().addLog({ filmId: 843, title: 'In the Mood for Love', rating: 5, status: 'watched', privateNotes: NOTE });
const fileRewatch = () => useFilmStore.getState().addLog({ filmId: 655, title: 'Paris, Texas', rating: 5, status: 'rewatched', privateNotes: NOTE });
const amend = () => useFilmStore.getState().updateLog(LOG_ID, { rating: 5, privateNotes: NOTE });

beforeEach(() => {
  jest.clearAllMocks();
  clearOfflineQueue(ME);
  useVaultStore.getState().clear();
  // The phone still shows the rank the house no longer gives.
  useAuthStore.setState({ user: { id: ME, username: 'me', tier: 'archivist', role: 'archivist', entitlement_source: 'apple' } as never, isAuthenticated: true } as never);
  useFilmStore.setState({ logs: [], _loggedIndex: {}, _addLogMutex: false, _updateLogMutex: false } as never);
});
afterEach(() => {
  clearOfflineQueue(ME);
  useVaultStore.getState().clear();
  useFilmStore.setState({ logs: [], _loggedIndex: {}, _addLogMutex: false, _updateLogMutex: false } as never);
});

describe('a note the rank no longer covers: the door, and the note said not kept', () => {
  const DOOR = 'The Vault is an Archivist feature. The record is sealed; its private note was not kept.';

  it('on a new record: the record is filed, and the member is told its note was not kept', async () => {
    mockHouse = house(RANK);
    await fileNew();
    expect(mockHouse.rows('logs').map((r) => r.film_id)).toEqual([843]);
    expect(told()).toEqual([['info', DOOR]]);
    // Their lapsed rank, and the way to resume it, beside the sentence.
    expect(toast.info).toHaveBeenCalledWith(DOOR, expect.objectContaining({ label: '✦ RESUME YOUR STANDING' }));
    // The house's rope, not a defect.
    expect(captureError).not.toHaveBeenCalled();
  });

  it('on a rewatch: the viewing is filed, and the member is told its note was not kept', async () => {
    holdTheRecord();
    mockHouse = house(RANK, [row]);
    await fileRewatch();
    expect(told()).toEqual([['info', DOOR]]);
    expect(captureError).not.toHaveBeenCalled();
  });

  it('on an amendment: the record is amended, and the member is told its note was not kept', async () => {
    holdTheRecord();
    mockHouse = house(RANK, [row]);
    await amend();
    expect(mockHouse.rows('logs').map((r) => r.rating)).toEqual([5]);
    expect(told()).toEqual([['info', DOOR]]);
    expect(captureError).not.toHaveBeenCalled();
  });
});

describe('a note refused for another reason', () => {
  it('for the member\'s own standing, the house\'s own words, and no defect reported', async () => {
    mockHouse = house(SILENCED);
    await fileNew();
    expect(told()).toEqual([['error', 'Your account has been silenced by The Society.']]);
    expect(captureError).not.toHaveBeenCalled();
  });

  it('by a fault at the house, "its private note could not be kept", and the fault reported', async () => {
    mockHouse = house(BROKE);
    await fileNew();
    expect(told()).toEqual([['error', NOT_KEPT]]);
    expect(captureError).toHaveBeenCalledWith(BROKE, { scope: 'addLogOp.saveNote', logId: expect.any(String) });
  });

  it('on a rewatch and on an amendment, the same sentence', async () => {
    holdTheRecord();
    mockHouse = house(BROKE, [row]);
    await fileRewatch();
    expect(told()).toEqual([['error', NOT_KEPT]]);

    toast.error.mockClear();
    holdTheRecord();
    useFilmStore.setState({ _updateLogMutex: false } as never);
    mockHouse = house(BROKE, [row]);
    await amend();
    expect(told()).toEqual([['error', NOT_KEPT]]);
  });
});

it('a note kept for the queue when the connection is lost says it waits for the connection, and is kept', async () => {
  mockHouse = house(NETWORK);
  await fileNew();
  // The record landed; its note did not: said, never sealed whole in silence (round 13).
  expect(told()).toEqual([['plain', 'The record is sealed; its private note will be kept when the connection returns.']]);
  expect(getOfflineQueue().map((m) => m.type)).toEqual(['set_viewing_note']);
  // And beside it, a note the rank no longer covers is still said: the two are told apart.
  clearOfflineQueue(ME);
  mockHouse = house(RANK);
  await useFilmStore.getState().addLog({ filmId: 238, title: 'The Godfather', rating: 5, status: 'watched', privateNotes: NOTE });
  expect(told().map(([kind]) => kind)).toEqual(['plain', 'info']);
});

it('an amendment that lands with its note only queued says the note waits, never sealed whole in silence', async () => {
  holdTheRecord();
  mockHouse = house(NETWORK, [row]);
  await amend();
  expect(mockHouse.rows('logs').map((r) => r.rating)).toEqual([5]);
  expect(told()).toEqual([['plain', 'The record is sealed; its private note will be kept when the connection returns.']]);
  expect(getOfflineQueue().map((m) => m.type)).toEqual(['set_viewing_note']);
});
