/**
 * logSealBar.test.tsx — the act this page exists for.
 *
 * The seal lives outside LogForm (it is docked to the modal, a sibling of the
 * scroll), so the composer's own render tests never touch it. It had never been
 * mounted at all.
 */
import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';

import LogSealBar from '../LogSealBar';

jest.mock('lucide-react-native', () => {
  const React = require('react');
  return new Proxy({}, { get: () => (props: any) => React.createElement('Icon', props) });
});

const base: React.ComponentProps<typeof LogSealBar> = {
  status: 'watched',
  rating: 0,
  review: '',
  abandonedReason: '',
  date: '2026-08-16',
  watchedWith: '',
  physicalMedia: 'None',
  submitting: false,
  sealed: false,
  isEditing: false,
  onSeal: jest.fn(),
};

const bar = (over: Partial<React.ComponentProps<typeof LogSealBar>> = {}) => render(<LogSealBar {...base} {...over} />);

describe('it says what it wants, instead of throwing an error', () => {
  it('asks for a verdict or a few words when it has neither', () => {
    expect(bar().getByText(/A VERDICT, OR A FEW WORDS/)).toBeTruthy();
  });

  it('asks the right question of a film you walked out of', () => {
    const r = bar({ status: 'abandoned' as const, abandonedReason: '' });
    expect(r.getByText(/WHY DID YOU STOP\?/)).toBeTruthy();
    expect(r.queryByText(/A VERDICT/)).toBeNull();
  });

  it('a rating alone is enough', () => {
    expect(bar({ rating: 4 }).queryByText(/A VERDICT, OR A FEW WORDS/)).toBeNull();
  });

  it('so are a few words with no rating', () => {
    // The record does not require a score — a critique alone can seal it.
    expect(bar({ review: 'Rain on the window all night.' }).queryByText(/A VERDICT/)).toBeNull();
  });
});

describe('the line is the record’s own filing mark', () => {
  it('shows what will actually be filed', () => {
    const r = bar({ rating: 4, watchedWith: 'yusuf', physicalMedia: '4K UHD' });
    const line = String(r.getByText(/^FILED/).props.children);
    expect(line).toContain('AUG 16, 2026');
    expect(line).toContain('WITH YUSUF');
    expect(line).toContain('4K UHD');
  });

  it('never announces the composer’s "None" as a format', () => {
    const r = bar({ rating: 4, physicalMedia: 'None' });
    expect(r.queryByText(/NONE/)).toBeNull();
  });

  it('never prints a bare "FILED ·" with nothing after it', () => {
    // An unreadable date leaves the mark empty. The label must go with it
    // rather than trailing a separator into nothing.
    const r = bar({ rating: 4, date: 'whenever' });
    const filed = r.queryByText(/FILED/);
    if (filed) {
      expect(String(filed.props.children).replace(/,/g, '')).not.toMatch(/FILED\s*·\s*$/);
    }
    expect(r.queryByText('whenever')).toBeNull();
  });
});

describe('the press', () => {
  it('reads its own reason aloud when it is dim', () => {
    // accessibilityLiveRegion is Android-only, so the reason travels in the
    // label — a button that says "Seal the record" and does nothing is a dead
    // end for anyone who cannot see that it is dim.
    const label = bar().getByTestId('submit-log-button').props.accessibilityLabel;
    expect(label).toMatch(/Seal the record/i);
    expect(label).toMatch(/rating or critique/i);
  });

  it('says only its name once the record is worth sealing', () => {
    const label = bar({ rating: 4 }).getByTestId('submit-log-button').props.accessibilityLabel;
    expect(label).toBe('SEAL THE RECORD');
  });

  it('still answers while dim, so nobody taps a control that ignores them', () => {
    const onSeal = jest.fn();
    fireEvent.press(bar({ onSeal }).getByTestId('submit-log-button'));
    expect(onSeal).toHaveBeenCalled();
  });

  it('will not fire twice while a record is being filed', () => {
    const onSeal = jest.fn();
    fireEvent.press(bar({ onSeal, submitting: true, rating: 4 }).getByTestId('submit-log-button'));
    expect(onSeal).not.toHaveBeenCalled();
  });

  it('names the act for what it is', () => {
    expect(bar({ rating: 4 }).getByText('SEAL THE RECORD')).toBeTruthy();
    expect(bar({ rating: 4, isEditing: true }).getByText('RESEAL THE RECORD')).toBeTruthy();
    expect(bar({ rating: 4, submitting: true }).getByText('SEALING RECORD…')).toBeTruthy();
    expect(bar({ rating: 4, sealed: true }).getByText('✦ RECORD SEALED')).toBeTruthy();
  });
});
