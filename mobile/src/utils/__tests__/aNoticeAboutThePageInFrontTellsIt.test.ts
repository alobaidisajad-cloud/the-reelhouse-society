/**
 * aNoticeAboutThePageInFrontTellsIt.test.ts — review round 12
 * ─────────────────────────────────────────────────────────────────────────────
 * A push tapped about the page in front stacks no copy of it (round 4), but it was compared with
 * where the member stood query and all: a host sitting in their salon (/lounge/<id>) who tapped
 * "@X is asking to enter" (/lounge/<id>?door=1) had a second copy of the room stacked over it. And
 * a push about the page in front did nothing at all: the critique it announced on the essay being
 * read, or the ballot it said had closed, was never read on the page. Now the PATH is compared, and
 * the page in front is told, with the notice's query, so it reads again (and a salon opens its door).
 */
import { supabaseFake } from '@/test-utils/supabaseFake';
import { useNotificationStore, type AppNotification } from '@/src/stores/notificationStore';
import { nav } from '@/src/utils/typedRouter';
import { noteCurrentPath } from '@/src/utils/openSociety';
import { openNoticeFromPush } from '../openNoticeFromPush';
import { listenHere, openOrTellHere, pathOf, queryOf, tellThePageInFront } from '../pageInFront';

let mockHouse = supabaseFake();
jest.mock('@/src/lib/supabase', () => ({ get supabase() { return mockHouse.client; } }));
jest.mock('@/src/utils/typedRouter', () => ({ nav: { push: jest.fn(), back: jest.fn(), replace: jest.fn() } }));
jest.mock('react-native/Libraries/Interaction/InteractionManager', () => ({
  __esModule: true,
  default: { runAfterInteractions: (fn: () => void) => { fn(); return { cancel: () => {} }; } },
  runAfterInteractions: (fn: () => void) => { fn(); return { cancel: () => {} }; },
}));

const SALON = '22222222-2222-4222-8222-222222222222';
const ESSAY = '44444444-4444-4444-8444-444444444444';
const notice = (over: Partial<AppNotification>): AppNotification => ({
  id: 'n1', user_id: 'u', type: 'system', message: 'is asking to enter The Nitrate Circle', read: false,
  created_at: '2026-11-17T00:00:00Z', ...over,
});

const stops: (() => void)[] = [];
beforeEach(() => {
  mockHouse = supabaseFake();
  noteCurrentPath(null);
  jest.mocked(nav.push).mockClear();
  useNotificationStore.setState({ notifications: [], markRead: jest.fn(async () => {}) } as never);
});
afterEach(() => { for (const stop of stops.splice(0)) stop(); });

describe('a tapped push about the page in front', () => {
  it('a salon’s notice tapped in that salon stacks no second room: the room in front is told to open its door', async () => {
    useNotificationStore.setState({ notifications: [notice({ id: 'n1', related_lounge_id: SALON, from_username: 'ada' })] } as never);
    const told = jest.fn();
    stops.push(listenHere(`/lounge/${SALON}`, () => true, (query) => told(query.get('door'))));
    noteCurrentPath(`/lounge/${SALON}`);
    await expect(openNoticeFromPush('n1')).resolves.toBe(`/lounge/${SALON}?door=1`);
    expect(nav.push).not.toHaveBeenCalled();
    expect(told.mock.calls).toEqual([['1']]);
  });

  it('a critique announced on the essay being read is read there: the page is told, nothing is opened', async () => {
    useNotificationStore.setState({ notifications: [notice({ id: 'n2', type: 'comment', group_key: `endorse:post:${ESSAY}`, from_username: 'ada' })] } as never);
    const told = jest.fn();
    stops.push(listenHere(`/dispatch/${ESSAY}`, () => true, told));
    noteCurrentPath(`/dispatch/${ESSAY}`);
    await openNoticeFromPush('n2');
    expect(nav.push).not.toHaveBeenCalled();
    expect(told).toHaveBeenCalledTimes(1);
  });

  it('elsewhere, the same tap opens the page, and no page is told', async () => {
    useNotificationStore.setState({ notifications: [notice({ id: 'n1', related_lounge_id: SALON, from_username: 'ada' })] } as never);
    const told = jest.fn();
    stops.push(listenHere(`/lounge/${SALON}`, () => true, told));
    noteCurrentPath('/lounge');
    await openNoticeFromPush('n1');
    expect(nav.push).toHaveBeenCalledWith(`/lounge/${SALON}?door=1`);
    expect(told).not.toHaveBeenCalled();
  });
});

describe('the page in front, told', () => {
  it('only a page in front hears it: a copy of the page under another screen is not told', () => {
    const inFront = jest.fn();
    const beneath = jest.fn();
    stops.push(listenHere(`/log/${ESSAY}`, () => true, inFront));
    stops.push(listenHere(`/log/${ESSAY}`, () => false, beneath));
    noteCurrentPath(`/log/${ESSAY}`);
    expect(tellThePageInFront(`/log/${ESSAY}`)).toBe(true);
    expect([inFront.mock.calls.length, beneath.mock.calls.length]).toEqual([1, 0]);
  });

  it('a page that stopped listening is told nothing, and is still not stacked again', () => {
    const told = jest.fn();
    listenHere(`/stacks/${ESSAY}`, () => true, told)();
    noteCurrentPath(`/stacks/${ESSAY}`);
    openOrTellHere(`/stacks/${ESSAY}`);
    expect(told).not.toHaveBeenCalled();
    expect(nav.push).not.toHaveBeenCalled();
  });

  it('another page is not the page in front: it is opened', () => {
    noteCurrentPath(`/stacks/${ESSAY}`);
    expect(tellThePageInFront(`/log/${ESSAY}`)).toBe(false);
    openOrTellHere(`/log/${ESSAY}`);
    expect(nav.push).toHaveBeenCalledWith(`/log/${ESSAY}`);
  });

  it('a path is the route without its query or fragment, and the query is read whole', () => {
    expect(pathOf(`/lounge/${SALON}?door=1`)).toBe(`/lounge/${SALON}`);
    expect(pathOf('/film/603#reviews')).toBe('/film/603');
    expect(pathOf('/notifications-modal')).toBe('/notifications-modal');
    expect(queryOf(`/lounge/${SALON}?door=1&x=2#top`).get('door')).toBe('1');
    expect(queryOf(`/lounge/${SALON}?door=1&x=2#top`).get('x')).toBe('2');
    expect(queryOf('/film/603').get('door')).toBeNull();
  });
});
