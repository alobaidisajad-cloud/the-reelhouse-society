import React from 'react';
import { StyleSheet } from 'react-native';
import { render, fireEvent } from '@testing-library/react-native';
import { ActivityCard } from '@/src/components/feed/ActivityCard';
import { useAuthStore } from '@/src/stores/auth';
import { useFilmStore } from '@/src/stores/films';
import { colors } from '@/src/theme/theme';

jest.mock('expo-router', () => ({
  ...require('@/test-utils/expoRouterMock').expoRouterMock(),
  useRouter: () => ({ push: jest.fn() }),
  useLocalSearchParams: () => ({}),
}));

jest.mock('@/src/utils/typedRouter', () => ({
  nav: { push: jest.fn(), replace: jest.fn(), back: jest.fn() },
}));

jest.mock('@/src/utils/linking', () => ({
  safeOpenURL: jest.fn(),
}));

const mockAsk = jest.fn();
jest.mock('@/src/components/moderation/LogModerationHost', () => ({ askAboutLog: (...a: unknown[]) => mockAsk(...a) }));

jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(),
  notificationAsync: jest.fn(),
  selectionAsync: jest.fn(),
}));

// expo-image comes from jest.setup.ts, which keeps `prefetch`; a local bare-View mock drops it.

jest.mock('react-native-mmkv', () => ({
  MMKV: jest.fn().mockImplementation(() => ({
    set: jest.fn(),
    getString: jest.fn(),
    getNumber: jest.fn(),
    getBoolean: jest.fn(),
    contains: jest.fn(),
    delete: jest.fn(),
    clearAll: jest.fn(),
  })),
}));

jest.mock('@/src/lib/supabase', () => ({
  supabase: {
    from: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    insert: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    single: jest.fn(),
  },
}));

const LOG = {
  id: 'l1', user_id: 'u9', username: 'reader', role: 'cinephile', film_id: 238, film_title: 'Casablanca',
  rating: 4, review: 'We will always have Paris.', poster_path: '/c.jpg', year: 1942, created_at: new Date().toISOString(), status: 'watched',
};

type Node = { type?: string; props?: Record<string, any>; children?: unknown[] | null };
const nodesOf = (root: unknown) => {
  const out: Node[] = [];
  const walk = (n: unknown) => {
    if (!n || typeof n !== 'object') return;
    out.push(n as Node);
    for (const c of (n as Node).children ?? []) walk(c);
  };
  walk(root);
  return out;
};
const textOf = (n: Node): string => (n.children ?? []).map((c) => (typeof c === 'string' ? c : textOf(c as Node))).join('');
/** Every gradient, with the views it is drawn inside. */
const gradientsOf = (root: unknown) => {
  const out: { node: Node; inside: Node[] }[] = [];
  const walk = (n: unknown, inside: Node[]) => {
    if (!n || typeof n !== 'object') return;
    const node = n as Node;
    if (Array.isArray(node.props?.colors)) out.push({ node, inside });
    for (const c of node.children ?? []) walk(c, [...inside, node]);
  };
  walk(root, []);
  return out;
};
/** The frame: the card's outermost view, as the list draws it. */
const frameOf = (item: Record<string, unknown>) => {
  const root = render(<ActivityCard item={{ ...LOG, ...item } as any} index={0} />).toJSON() as Node;
  return { root, style: StyleSheet.flatten(root.props!.style) };
};

describe('A frame of the Reel', () => {
  beforeEach(() => {
    mockAsk.mockClear();
    useAuthStore.setState({ user: { id: 'test-user', username: 'tester', email: 'test@example.com', role: 'cinephile' }, isAuthenticated: true });
    useFilmStore.setState({ _loggedIndex: {} });
  });

  it('draws the log: its film, its author and its words', () => {
    const { getByText } = render(<ActivityCard item={{ ...LOG, user_id: 'test-user', username: 'tester', film_title: 'The Godfather', review: 'A masterpiece.' } as any} index={0} />);
    expect(getByText('The Godfather')).toBeTruthy();
    expect(getByText('@TESTER')).toBeTruthy();
    // Drawn line by line, unspoken: the frame's words are said once, whole, by the control that holds them.
    expect(getByText('A masterpiece.', { includeHiddenElements: true })).toBeTruthy();
  });

  it('names its film aloud by all it draws of it, not "View film details" on every card', () => {
    const { getByLabelText, queryByLabelText } = render(<ActivityCard item={LOG as any} index={0} />);
    expect(getByLabelText('Casablanca, 1942, 4 of 5 reels. Opens the film.')).toBeTruthy();
    expect(queryByLabelText('View film details')).toBeNull();
    const left = render(<ActivityCard item={{ ...LOG, status: 'abandoned', watched_with: 'ines' } as any} index={0} />);
    expect(left.getByLabelText('Casablanca, 1942, with ines, abandoned. Opens the film.')).toBeTruthy();
  });

  // Speed lab 40147693423: three translucent layers per card, blended on every frame of a
  // scroll, held the Reel's p90 at 1800 ms; drawn flat, 650.
  it('is drawn as flat stock: an opaque ground, no layer seen through a view\'s opacity, no edge light under it', () => {
    for (const role of ['cinephile', 'archivist', 'auteur']) {
      const { root, style } = frameOf({ role });
      expect([role, style.experimental_backgroundImage, style.boxShadow, style.elevation ?? 0, style.opacity ?? 1])
        .toEqual([role, undefined, undefined, 0, 1]);
      expect([role, /^#[0-9A-Fa-f]{6}$/.test(String(style.backgroundColor))]).toEqual([role, true]);
      const nodes = nodesOf(root);
      // No gradient lies on the frame: the one in it is the Auteur's rank stamp, the house's mark, inside its plate.
      const onTheFrame = gradientsOf(root).filter((g) => !g.inside.some((v) => textOf(v).trim() === '★ AUTEUR'));
      expect([role, onTheFrame.length]).toEqual([role, 0]);
      expect([role, nodes.filter((n) => n.type === 'View' && (StyleSheet.flatten(n.props?.style)?.opacity ?? 1) < 1).length]).toEqual([role, 0]);
    }
  });

  it('is cut from its author\'s stock: the house\'s for a Cinephile and an Archivist, the Auteur\'s own for an Auteur', () => {
    expect(frameOf({ role: 'cinephile' }).style.backgroundColor).toBe(colors.soot);
    expect(frameOf({ role: 'archivist' }).style.backgroundColor).toBe(colors.soot);
    expect(frameOf({ role: 'auteur' }).style.backgroundColor).toBe(colors.sootAuteur);
  });

  it('offers the Tribunal\'s sheet on another member\'s log, and never on your own', async () => {
    const theirs = render(<ActivityCard item={LOG as any} index={0} />);
    await fireEvent.press(theirs.getByLabelText("More for @reader's log"));
    expect(mockAsk).toHaveBeenCalledWith({ logId: 'l1', userId: 'u9', username: 'reader' });
    const mine = render(<ActivityCard item={{ ...LOG, user_id: 'test-user', username: 'tester' } as any} index={0} />);
    expect(mine.queryByLabelText("More for @tester's log")).toBeNull();
  });

  it('says READ ON, and how many words, only where words were left out', () => {
    const long = Array.from({ length: 60 }, (_, i) => `word${i}`).join(' ');
    const cut = render(<ActivityCard item={{ ...LOG, review: long } as any} index={0} />);
    const all = { includeHiddenElements: true };
    expect(cut.getByText('READ ON', all)).toBeTruthy();
    expect(cut.getByText('60 WORDS', all)).toBeTruthy();
    expect(cut.getByLabelText(/Read on, 60 words.$/)).toBeTruthy();
    const whole = render(<ActivityCard item={LOG as any} index={0} />);
    expect(whole.queryByText('READ ON', all)).toBeNull();
  });

  it('shows an Auteur\'s breakdown when it was scored, and nothing when it was not', () => {
    const scored = render(<ActivityCard item={{ ...LOG, role: 'auteur', is_autopsied: true, autopsy: { _v: 2, story: 8, sound: 6 } } as any} index={0} />);
    expect(scored.getByLabelText('Breakdown, 7 out of 10. story, 8 out of 10. sound, 6 out of 10.')).toBeTruthy();
    const unscored = render(<ActivityCard item={{ ...LOG, role: 'auteur', is_autopsied: true, autopsy: { story: 0 } } as any} index={0} />);
    expect(unscored.queryByText(/BREAKDOWN/)).toBeNull();
  });
});
