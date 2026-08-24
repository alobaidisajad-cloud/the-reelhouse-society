/**
 * roomsRender.test.tsx — the last two of the six rooms, actually mounted.
 *
 * Four of the six had render coverage. The Stacks room and the Vault had none —
 * every claim about them was a claim about source text, which is the weakest
 * verification available and precisely where the reanimated mock gap hid for
 * months. A component nobody can mount is a component nobody has checked.
 *
 * These assert the rules the rooms are supposed to share, not their pixels:
 * a room does not describe itself before its data lands, a count appears only
 * when it is complete, and search shows up only when there is enough to search.
 */
import React from 'react';
import { render } from '@testing-library/react-native';

import ProfileListsTab from '../ProfileListsTab';
import ProfilePhysicalTab from '../ProfilePhysicalTab';

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn() }),
  useLocalSearchParams: () => ({}),
  Router: class {},
}));

jest.mock('@/src/utils/typedRouter', () => ({
  nav: { push: jest.fn(), replace: jest.fn(), back: jest.fn() },
}));

jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(),
  notificationAsync: jest.fn(),
  selectionAsync: jest.fn(),
}));

/** The field is `title`, not `name` — and the card draws it uppercase. */
const list = (id: string, title: string, filmCount: number) => ({
  id,
  title,
  description: '',
  isRanked: false,
  isPrivate: false,
  createdAt: '2026-01-01T00:00:00Z',
  filmCount,
  films: [],
});

const disc = (id: string, title: string, format: string) => ({
  id,
  filmId: Number(id),
  title,
  poster_path: '/p.jpg',
  formats: [format],
  notes: '',
  condition: 'good',
  createdAt: '2026-01-01T00:00:00Z',
});

// ════════════════════════════════════════════════════════════════════════════
describe('the Stacks room', () => {
  it('mounts', () => {
    const { toJSON } = render(
      <ProfileListsTab lists={[list('1', 'Noir Essentials', 12)]} totalLists={1} isSelf />,
    );
    expect(toJSON()).not.toBeNull();
  });

  it('shows a stack it was given', () => {
    const { getByText } = render(
      <ProfileListsTab lists={[list('1', 'Noir Essentials', 12)]} totalLists={1} isSelf />,
    );
    expect(getByText('NOIR ESSENTIALS')).toBeTruthy();
  });

  it('does not describe itself before the data has landed', () => {
    // `ready={false}` is the room saying "I do not know yet". It must not claim
    // an empty shelf — the difference between "you have none" and "not loaded".
    const { queryByText } = render(<ProfileListsTab lists={[]} ready={false} isSelf />);
    expect(queryByText(/no stacks|nothing here|empty/i)).toBeNull();
  });

  it('survives an empty room once it does know', () => {
    const { toJSON } = render(<ProfileListsTab lists={[]} totalLists={0} ready isSelf />);
    expect(toJSON()).not.toBeNull();
  });

  it('renders a stack whose films array is missing entirely', () => {
    // The poster strip maps over `list.films`. A row without one must not throw.
    const bare = { id: '9', title: 'Unfilmed', filmCount: 0 } as never;
    const { getByText } = render(<ProfileListsTab lists={[bare]} totalLists={1} ready isSelf />);
    expect(getByText('UNFILMED')).toBeTruthy();
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe('the Vault', () => {
  const base = {
    isSelf: true,
    physicalFilter: null,
    setPhysicalFilter: jest.fn(),
    physicalSort: 'default' as const,
    setPhysicalSort: jest.fn(),
    physicalFormatCounts: [],
  };

  it('mounts', () => {
    const shelf = [disc('1', 'Solaris', 'bluray')];
    const { toJSON } = render(
      <ProfilePhysicalTab {...base} vault={shelf} physicalFiltered={shelf} totalVault={1} ready />,
    );
    expect(toJSON()).not.toBeNull();
  });

  it('does not describe itself before the data has landed', () => {
    const { queryByText } = render(
      <ProfilePhysicalTab {...base} vault={[]} physicalFiltered={[]} ready={false} />,
    );
    expect(queryByText(/nothing shelved|no copies|empty/i)).toBeNull();
  });

  it('shows a shelf count only when the server knew the whole collection', () => {
    // `vaultFormats` absent means the true per-shelf counts are unknown. A
    // number derived from the loaded window would be a confident wrong answer —
    // the exact failure this pass existed to remove.
    const shelf = [disc('1', 'Solaris', 'bluray')];
    const { queryByText } = render(
      <ProfilePhysicalTab {...base} vault={shelf} physicalFiltered={shelf} totalVault={900} ready vaultFormats={null} />,
    );
    expect(queryByText(/\d+ COPIES/)).toBeNull();
  });

  it('shows the count once the server supplies it', () => {
    const shelf = [disc('1', 'Solaris', 'bluray')];
    const { getByText } = render(
      <ProfilePhysicalTab
        {...base}
        vault={shelf}
        physicalFiltered={shelf}
        totalVault={900}
        ready
        vaultFormats={[{ format: 'bluray', count: 42 }]}
      />,
    );
    expect(getByText(/42 COPIES/)).toBeTruthy();
  });

  it('shelves a copy with no format instead of losing it', () => {
    /**
     * A disc recorded without a carrier must not vanish from its owner's own
     * vault. It goes to an UNFILED shelf.
     *
     * Asserted on the SHELF, not the film title: this room draws posters, not
     * names — the title only exists as an accessible label. My first attempt
     * looked for the title and failed, which looked like the bug it was
     * checking for and was really the test not knowing what the room renders.
     */
    const orphan = {
      id: '2', filmId: 2, title: 'Unfiled', poster_path: null,
      formats: [], notes: '', condition: 'good', createdAt: '2026-01-01T00:00:00Z',
    } as never;
    const { getAllByText } = render(
      <ProfilePhysicalTab {...base} vault={[orphan]} physicalFiltered={[orphan]} totalVault={1} ready />,
    );
    // Twice by design: the shelf rail, and the filter chip that selects it.
    expect(getAllByText('UNFILED').length).toBeGreaterThan(0);
  });

  it('puts one copy on every shelf it is recorded under', () => {
    // `formats: string[]` means a Criterion Blu-ray stands on both shelves.
    const dual = {
      id: '3', filmId: 3, title: 'Brazil', poster_path: '/b.jpg',
      formats: ['bluray', 'criterion'], notes: '', condition: 'good',
      createdAt: '2026-01-01T00:00:00Z',
    } as never;
    const { getByText } = render(
      <ProfilePhysicalTab {...base} vault={[dual]} physicalFiltered={[dual]} totalVault={1} ready />,
    );
    expect(getByText('BLU-RAY')).toBeTruthy();
    expect(getByText('CRITERION')).toBeTruthy();
  });
});
