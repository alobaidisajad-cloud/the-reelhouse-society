import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { ActivityCard } from '@/src/components/feed/ActivityCard';
import { useAuthStore } from '@/src/stores/auth';
import { useFilmStore } from '@/src/stores/films';

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

/** Whose autopsy the card's back was drawn for, in order. */
const mockBacksDrawn: string[] = [];
jest.mock('@/src/components/feed/AutopsyView', () => ({
  ...jest.requireActual('@/src/components/feed/AutopsyView'),
  AutopsyBack: ({ username }: { username: string }) => { mockBacksDrawn.push(username); return null; },
}));

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

describe('ActivityCard Component', () => {
  beforeEach(() => {
    useAuthStore.setState({ user: { id: 'test-user', username: 'tester', email: 'test@example.com', role: 'cinephile' }, isAuthenticated: true });
    useFilmStore.setState({ _loggedIndex: {} });
  });

  it('renders a log correctly without throwing any type errors', () => {
    const mockFeedItem = {
      id: 1,
      user_id: 'test-user',
      username: 'tester',
      role: 'user',
      film_id: 100,
      film_title: 'The Godfather',
      rating: 5,
      review: 'A masterpiece.',
      poster_path: '/poster.jpg',
      year: 1972,
      created_at: new Date().toISOString(),
      interactions: [],
      status: 'watched',
    };

    const { getByText } = render(
      <ActivityCard
        item={mockFeedItem as any}
        index={0}
      />
    );

    expect(getByText('The Godfather')).toBeTruthy();
    expect(getByText('@TESTER')).toBeTruthy();
    expect(getByText('A masterpiece.')).toBeTruthy();
  });

  it('names its poster aloud by the film, not "View film details" on every card', () => {
    const item = { id: 2, user_id: 'u9', username: 'reader', role: 'cinephile', film_id: 238, film_title: 'Casablanca',
      rating: 4, review: 'We will always have Paris.', poster_path: '/c.jpg', year: 1942, created_at: new Date().toISOString(), status: 'watched' };
    const { getByLabelText, queryByLabelText } = render(<ActivityCard item={item as any} index={0} />);
    expect(getByLabelText('Casablanca. Opens the film.')).toBeTruthy();
    expect(queryByLabelText('View film details')).toBeNull();
  });

  it('turned over, and recycled for another log, never draws that log\'s back', async () => {
    const autopsied = (id: number, username: string) => ({ id, user_id: 'u9', username, role: 'cinephile', film_id: 238,
      film_title: 'Casablanca', rating: 4, review: 'Here.', poster_path: '/c.jpg', year: 1942,
      created_at: new Date().toISOString(), status: 'watched', is_autopsied: true, autopsy: { story: 8 } });
    const { getByLabelText, rerender } = render(<ActivityCard item={autopsied(5, 'first') as any} index={0} />);
    await fireEvent.press(getByLabelText('Turn the card over to read the confidential autopsy'));
    expect(mockBacksDrawn).toContain('first');

    rerender(<ActivityCard item={autopsied(6, 'second') as any} index={0} />);
    expect(mockBacksDrawn).not.toContain('second');
  });

  it('lies flat unless it is an Auteur\'s, which lifts in crimson', () => {
    // Before Android 9 an elevation casts black whatever its shadowColor: only the Auteur has one.
    const paper = (role: string) => {
      const item = { id: 3, user_id: 'u9', username: 'reader', role, film_id: 238, film_title: 'Casablanca',
        rating: 4, review: 'We will always have Paris.', poster_path: '/c.jpg', year: 1942, created_at: new Date().toISOString(), status: 'watched' };
      type Node = { props?: Record<string, unknown>; children?: unknown[] | null };
      const find = (n: unknown): Node | undefined => {
        if (!n || typeof n !== 'object') return undefined;
        const node = n as Node;
        if (node.props && node.props.shouldRasterizeIOS !== undefined) return node;
        for (const c of node.children ?? []) { const hit = find(c); if (hit) return hit; }
        return undefined;
      };
      const card = find(render(<ActivityCard item={item as any} index={0} />).toJSON());
      if (!card) throw new Error('the card was not rendered');
      const { StyleSheet } = jest.requireActual('react-native');
      return StyleSheet.flatten(card.props!.style);
    };
    expect(paper('cinephile').elevation ?? 0).toBe(0);
    expect(paper('auteur')).toEqual(expect.objectContaining({ elevation: 12, shadowColor: expect.any(String) }));
    expect(paper('auteur').shadowColor).not.toBe('transparent');
  });

  // Speed lab 40147693423: three translucent layers per card, blended on every frame of a
  // scroll, held the Reel's p90 at 1800 ms; drawn flat, 650.
  it('is drawn as flat paper: an opaque ground, no layer seen through a view\'s opacity, no edge light under it', () => {
    const { StyleSheet } = jest.requireActual('react-native');
    type Node = { type?: string; props?: Record<string, any>; children?: unknown[] | null };
    for (const role of ['cinephile', 'archivist', 'auteur']) {
      const item = { id: 4, user_id: 'u9', username: 'reader', role, film_id: 238, film_title: 'Casablanca',
        rating: 4, review: 'We will always have Paris.', poster_path: '/c.jpg', year: 1942, created_at: new Date().toISOString(), status: 'watched' };
      const nodes: Node[] = [];
      const walk = (n: unknown) => {
        if (!n || typeof n !== 'object') return;
        const node = n as Node;
        nodes.push(node);
        for (const c of node.children ?? []) walk(c);
      };
      walk(render(<ActivityCard item={item as any} index={0} />).toJSON());
      const card = nodes.find((n) => n.props?.shouldRasterizeIOS !== undefined);
      if (!card) throw new Error('the card was not rendered');
      const cardStyle = StyleSheet.flatten(card.props!.style);
      expect([role, cardStyle.experimental_backgroundImage, cardStyle.boxShadow]).toEqual([role, undefined, undefined]);
      const gradients = nodes.filter((n) => Array.isArray(n.props?.colors));
      const ground = gradients.find((n) => n.props?.colors.length === 3);
      // As the native view receives them: 0xAARRGGBB, opaque when its alpha byte is full.
      const opaque = (c: unknown) => (typeof c === 'number' ? (c >>> 24) === 0xff : String(c).startsWith('rgb('));
      expect([role, ground?.props?.colors.every(opaque)]).toEqual([role, true]);
      const seenThrough = gradients.filter((n) => (StyleSheet.flatten(n.props?.style)?.opacity ?? 1) < 1);
      expect([role, seenThrough.length]).toEqual([role, 0]);
    }
  });
});
