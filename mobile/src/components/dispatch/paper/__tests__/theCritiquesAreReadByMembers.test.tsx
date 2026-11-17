/**
 * theCritiquesAreReadByMembers.test.tsx — the critiques' foot, for a visitor (review round 10).
 *
 * The house sends a visitor no critiques (critiques_read is a member's), and the foot drew for them
 * what it draws for a member: an end mark, or "N MORE · 30 AT A TIME" whose press read nothing, under
 * a head that counted the critiques. The foot now says the critiques are read by members, and asks
 * the visitor in; a member's foot is as it was.
 */
import React from 'react';
import { act, fireEvent, render } from '@testing-library/react-native';
import { CritiqueFooter } from '@/src/components/dispatch/paper/PaperCritiques';

const mockAskIn = jest.fn();
jest.mock('@/src/utils/askIn', () => ({ askIn: (...a: unknown[]) => mockAskIn(...a) }));

beforeEach(() => { mockAskIn.mockClear(); });

describe("the critiques' foot, for a visitor", () => {
  it('says THE CRITIQUES ARE READ BY MEMBERS, and offers no page of critiques they cannot read', () => {
    const onMore = jest.fn();
    const r = render(<CritiqueFooter visitor shown={0} total={12} onMore={onMore} onRetry={jest.fn()} />);
    expect(r.getByText('THE CRITIQUES ARE READ BY MEMBERS')).toBeTruthy();
    expect(r.queryByText(/MORE · /)).toBeNull();
    expect(r.queryByText('✦', { includeHiddenElements: true })).toBeNull();
    expect(onMore).not.toHaveBeenCalled();
  });

  it('SIGN IN TO READ THEM asks them in, once', async () => {
    const r = render(<CritiqueFooter visitor shown={0} total={12} onMore={jest.fn()} onRetry={jest.fn()} />);
    expect(r.getByText('SIGN IN TO READ THEM')).toBeTruthy();
    await act(async () => { await fireEvent.press(r.getByLabelText('Sign in to read the critiques')); });
    expect(mockAskIn).toHaveBeenCalledTimes(1);
  });

  it('is said even while a read is out or one failed: a visitor is given none to wait for or ask again', () => {
    // A visitor's read is refused by the house, so neither a spinner nor a TRY AGAIN is theirs.
    const loading = render(<CritiqueFooter visitor loading shown={0} total={4} onMore={jest.fn()} onRetry={jest.fn()} />);
    expect(loading.getByText('THE CRITIQUES ARE READ BY MEMBERS')).toBeTruthy();
    loading.unmount();
    const failed = render(<CritiqueFooter visitor failed shown={0} total={4} onMore={jest.fn()} onRetry={jest.fn()} />);
    expect(failed.getByText('THE CRITIQUES ARE READ BY MEMBERS')).toBeTruthy();
    expect(failed.queryByText('THE CRITIQUES COULD NOT BE READ')).toBeNull();
  });
});
