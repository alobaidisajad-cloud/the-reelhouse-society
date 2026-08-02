import React from 'react';
import { render } from '@testing-library/react-native';
import { ActivityCard } from '@/src/components/feed/ActivityCard';
import { useAuthStore } from '@/src/stores/auth';
import { useFilmStore } from '@/src/stores/films';

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn() }),
  useLocalSearchParams: () => ({}),
}));

jest.mock('@/src/utils/typedRouter', () => ({
  nav: { push: jest.fn(), replace: jest.fn(), back: jest.fn() },
}));

jest.mock('@/src/utils/linking', () => ({
  safeOpenURL: jest.fn(),
}));

jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(),
  notificationAsync: jest.fn(),
  selectionAsync: jest.fn(),
}));

jest.mock('expo-image', () => {
  const { View } = require('react-native');
  return { Image: View };
});

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
});
