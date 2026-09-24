/**
 * A GENERATOR, not a test. The real Dispatch feed, staged through
 * its own store with one filing of each of the five kinds.
 */
import React, { act } from 'react';
import { render } from '@testing-library/react-native';
import { toHtml } from '../../../src/components/profile/__tests__/zz-render.lib';
import { readFixture, whenRendering, writeScreen } from '@/mockups/paths';
import { LOCAL_ART } from '../../../src/components/profile/__tests__/zz-art.gen';

const LISTS = readFixture<any>('lobby.json');
const RAW = readFixture<Record<string, string>>('lobby-art.json');
const posters: Record<string, { title: string; data: string }> = {};
for (const [p, data] of Object.entries(RAW)) if (data) posters[p] = { title: '', data };

const mockUser = { id: 'u1', username: 'kane', tier: 'archivist', role: 'archivist' };
jest.mock('@/src/stores/auth', () => ({
  useAuthStore: Object.assign(
    (sel?: (s: unknown) => unknown) => (typeof sel === 'function' ? sel({ user: mockUser, isAuthenticated: true }) : { user: mockUser, isAuthenticated: true }),
    { getState: () => ({ user: mockUser, isAuthenticated: true }), setState: jest.fn(), subscribe: jest.fn() },
  ),
}));
jest.mock('@react-navigation/native', () => ({ useScrollToTop: jest.fn(), useIsFocused: () => true }));
jest.mock('@/src/utils/typedRouter', () => ({ nav: { push: jest.fn(), replace: jest.fn(), back: jest.fn() } }));
jest.mock('react-native-safe-area-context', () => {
  const mockReact = require('react');
  const { View } = require('react-native');
  return {
    SafeAreaProvider: ({ children }: any) => mockReact.createElement(View, null, children),
    SafeAreaView: ({ children, ...props }: any) => mockReact.createElement(View, props, children),
    useSafeAreaInsets: () => ({ top: 59, bottom: 34, left: 0, right: 0 }),
    useSafeAreaFrame: () => ({ x: 0, y: 0, width: 390, height: 844 }),
  };
});
jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({
  __esModule: true,
  default: () => ({ width: 390, height: 844, scale: 3, fontScale: 1 }),
}));
jest.mock('@shopify/flash-list', () => require('../flashListMock').makeFlashListMock());
jest.mock('@/src/lib/supabase', () => {
  const chain: any = {};
  const self = () => chain;
  for (const k of ['select', 'eq', 'neq', 'not', 'order', 'limit', 'in', 'is', 'single', 'gte', 'lte', 'insert', 'update', 'delete', 'abortSignal']) chain[k] = self;
  chain.then = (res: (v: unknown) => unknown) => Promise.resolve({ data: [], error: null }).then(res);
  return { supabase: { from: () => chain, rpc: () => Promise.resolve({ data: null, error: null }) } };
});
jest.mock('@/src/utils/offlineQueue', () => ({ enqueueMutation: jest.fn(), flushOfflineQueue: jest.fn(), getOfflineQueue: () => [] }));
jest.mock('@/src/lib/sentry', () => ({ captureError: jest.fn() }));

// eslint-disable-next-line import/first
import FeedScreen from '@/app/(tabs)/dispatch';
// eslint-disable-next-line import/first
import { useDispatch } from '@/src/stores/dispatch';

const canon = LISTS.canon as { id: number; title: string; poster_path: string; backdrop_path: string; release_date: string }[];
const trend = LISTS.trending as typeof canon;
const film = (f: typeof canon[number], director: string) => ({ title: f.title, year: Number(f.release_date.slice(0, 4)), director, posterPath: f.poster_path, backdropPath: f.backdrop_path });
const hoursAgo = (h: number) => new Date(Date.now() - h * 3600e3).toISOString();
const base = {
  authorId: 'u2', subjectId: null, subjectKind: 'film', title: null, fullContent: null, source: null, sourceUrl: null,
  options: null, closesAt: null, frozenTotals: null, answerId: null, seriesId: null, seriesTitle: null, partNumber: null,
  spoilerLabel: null, withheldAt: null, endedAt: null, endedBy: null, editedAt: null,
};
const FILINGS = [
  { ...base, id: 'f1', kind: 'take', author: { name: 'morpho', memberNo: 12, tier: 'auteur' }, film: film(canon[1], 'Francis Ford Coppola'),
    body: 'The wedding is the whole film in miniature: business in the dark study, family in the light outside, and Michael standing exactly in the doorway between them.', certifyCount: 14, commentCount: 3, createdAt: hoursAgo(1) },
  { ...base, id: 'f2', kind: 'seeking', author: { name: 'vesper', memberNo: 88, tier: 'archivist' }, film: null, subjectKind: null,
    body: 'Looking for a film I saw on late television years ago: a lighthouse keeper, a storm, and a letter that arrives forty years late. Black and white. Anyone?', certifyCount: 2, commentCount: 5, createdAt: hoursAgo(3) },
  { ...base, id: 'f3', kind: 'wire', author: { name: 'ug.mb', memberNo: 147, tier: 'free' }, film: film(trend[2], 'Christopher Nolan'),
    title: 'The Odyssey shot entirely on IMAX film', body: 'Every frame of the new Nolan was photographed on IMAX 70mm, a first for a feature of this length.', source: 'Variety', sourceUrl: 'https://variety.com', certifyCount: 9, commentCount: 1, createdAt: hoursAgo(5) },
  { ...base, id: 'f4', kind: 'ballot', author: { name: 'halloway', memberNo: 203, tier: 'archivist' }, film: null, subjectKind: null,
    body: 'The greatest final shot in the canon. Choose one.',
    options: [0, 2, 3].map(i => ({ film_id: canon[i].id, title: canon[i].title, poster_path: canon[i].poster_path })),
    closesAt: new Date(Date.now() + 2 * 86400e3).toISOString(), certifyCount: 6, commentCount: 12, createdAt: hoursAgo(7) },
  { ...base, id: 'f5', kind: 'dossier', author: { name: 'morpho', memberNo: 12, tier: 'auteur' }, film: film(canon[2], 'Francis Ford Coppola'),
    title: 'Two Michaels, one film', body: 'Part II cuts between a young Vito building a family and his son dismantling one. The editing is the argument.', fullContent: null, certifyCount: 21, commentCount: 7, createdAt: hoursAgo(20) },
];

whenRendering('dispatch generator', () => {
  it('writes the Dispatch', async () => {
    useDispatch.setState({
      filings: FILINGS, loading: false, loadingMore: false, hasMore: false, droppedRows: 0,
      section: 'ALL', sort: 'LATEST', savedOnly: false, newCount: 0,
      certifiedIds: new Set(['f1']), savedIds: new Set(), myVotes: {},
      critiques: {}, critiquesLoading: {}, critiquesLoadingMore: {}, critiquesHasMore: {}, critiquesOrder: {}, certifiedCritiqueIds: new Set(),
    } as never);
    let r!: ReturnType<typeof render>;
    await act(async () => { r = render(<FeedScreen />); await new Promise((res) => setTimeout(res, 0)); });
    const html = toHtml(r.toJSON(), { posters, local: LOCAL_ART });
    writeScreen('dispatch', html);
    console.log('dispatch:', html.length, 'bytes |', (html.match(/<img /g) || []).length, 'images |', (html.match(/class="poster"/g) || []).length, 'empty frames');
    expect(html.length).toBeGreaterThan(5000);
  });
});
