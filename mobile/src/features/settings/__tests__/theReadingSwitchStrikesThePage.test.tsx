/**
 * theReadingSwitchStrikesThePage.test.tsx — Settings, READING: "Hide Slurs".
 *
 * Off until a member turns it on, and kept with their account (a preference,
 * written the instant it is flipped). On, the pages they read strike the eight
 * slurs: a critique, a filing, a salon's name; off again, every word is back.
 */
import React from 'react';
import { act, fireEvent, render } from '@testing-library/react-native';
import { ReadingSection } from '../SettingsSections';
import { CritiqueRow } from '@/src/components/critique/CritiqueRow';
import { useAuthStore } from '@/src/stores/auth';

const ME = { id: 'me', username: 'me', role: 'free' } as const;
const CRITIQUE = {
  id: 'c1', user_id: 'u2', username: 'ana', avatar_url: null, created_at: '2026-11-05T10:00:00Z',
  body: 'Every retard in the stalls walked out.',
};

const as = (preferences: Record<string, unknown>) => useAuthStore.setState({ user: { ...ME, preferences } as never });
afterEach(() => useAuthStore.setState({ user: null }));

describe('the switch', () => {
  it('is off for a member who never turned it on', () => {
    as({});
    const r = render(<ReadingSection />);
    expect(r.getByRole('switch', { name: 'Hide slurs' }).props.accessibilityState).toMatchObject({ checked: false });
    expect(r.getByText('Kept with your account, on every phone. Nothing anyone wrote is taken down.')).toBeTruthy();
  });

  it('turned on, is kept as the member’s own preference, and reads on', async () => {
    as({});
    const kept = useAuthStore.getState().setPreference;
    const set = jest.fn(async (key: string, value: unknown) => {
      useAuthStore.setState((s) => ({ user: s.user && { ...s.user, preferences: { ...s.user.preferences, [key]: value } } }));
    });
    useAuthStore.setState({ setPreference: set });
    const r = render(<ReadingSection />);
    await act(async () => { await fireEvent(r.getByRole('switch', { name: 'Hide slurs' }), 'valueChange', true); });
    expect(set).toHaveBeenCalledWith('hide_slurs', true);
    expect(r.getByRole('switch', { name: 'Hide slurs' }).props.accessibilityState).toMatchObject({ checked: true });
    useAuthStore.setState({ setPreference: kept });
  });
});

describe('the page it governs', () => {
  const row = () => render(<CritiqueRow c={CRITIQUE as never} currentUserId="me" onWithdraw={jest.fn()} onPressUser={jest.fn()} />);

  it('on: the slur in another member’s critique is typed over, the sentence kept', () => {
    as({ hide_slurs: true });
    const r = row();
    expect(r.getByText('xxxxxx')).toBeTruthy();
    expect(r.queryByText(/retard/)).toBeNull();
  });

  it('off: the critique reads as written', () => {
    as({ hide_slurs: false });
    expect(row().getByText(CRITIQUE.body)).toBeTruthy();
  });
});
