/**
 * theImportAndExportIsDrawn.test.tsx — Settings, IMPORT & EXPORT, drawn whole.
 *
 * The Settings screen's own tests stand this section in with one line, as it
 * opens files and the share sheet. Here it is the real section in its card, in
 * every state a member meets: ready, filing an archive, filed (whole, and with
 * exceptions), a transfer that can be taken back, and an export under way. The
 * capture pass draws each of them as a phone would.
 */
import React from 'react';
import { act, fireEvent, render } from '@testing-library/react-native';
import { ArrowDownUp } from 'lucide-react-native';
import DataVault from '../DataVault';
import { SectionCard, SectionHead } from '../SettingsSections';
import { useAuthStore } from '@/src/stores/auth';
import type { ImportProgress, ImportResult } from '@/src/features/archive/archiveImport';
import { grouped } from '@/src/utils/counted';
import { ARRIVAL_GRACE_MS } from '@/src/hooks/useArrival';

let mockFiling: (uri: string, onProgress: (p: ImportProgress) => void) => Promise<ImportResult>;
let mockUndoable = 0;
jest.mock('expo-document-picker', () => ({
  getDocumentAsync: jest.fn(async () => ({
    canceled: false, assets: [{ uri: 'file:///cache/archive.zip', name: 'archive.zip', mimeType: 'application/zip' }],
  })),
}));
jest.mock('expo-sharing', () => ({ isAvailableAsync: jest.fn(async () => true), shareAsync: jest.fn(async () => {}) }));
jest.mock('@/src/features/archive/archiveImport', () => ({
  importArchiveZip: (uri: string, onProgress: (p: ImportProgress) => void) => mockFiling(uri, onProgress),
  importArchiveJSON: jest.fn(),
}));
jest.mock('@/src/features/archive/undoImport', () => ({
  loadReceipt: () => (mockUndoable > 0 ? { rows: mockUndoable } : null),
  undoImport: jest.fn(),
}));
jest.mock('@/src/features/archive/importReceipt', () => ({ receiptSize: (r: { rows: number }) => r.rows }));
// An export that has begun and not ended: the rows are still being read.
jest.mock('@/src/features/settings/readAllRows', () => ({ readAllRows: () => new Promise(() => {}) }));

/** The card as Settings sets it, past its fade-in (600ms, and the grace), as a member sees it. */
const vault = async () => {
  const r = render(
    <SectionCard>
      <SectionHead icon={ArrowDownUp} label="IMPORT & EXPORT" />
      <DataVault />
    </SectionCard>,
  );
  await act(async () => { await new Promise((done) => setTimeout(done, 600 + ARRIVAL_GRACE_MS + 20)); });
  return r;
};

const FILED: ImportResult = { logs: 4120, reviews: 38, watchlist: 96, vault: 3, lists: 7, skipped: 0, errors: [] };
const EXCEPTIONS: ImportResult = {
  ...FILED,
  skipped: 12,
  errors: Array.from({ length: 10 }, (_, i) => `Row ${i * 37 + 4}: no film matches “Untitled Short (${1971 + i})”`),
};

beforeEach(() => {
  mockUndoable = 0;
  useAuthStore.setState({ user: { id: 'me', username: 'me', role: 'cinephile' } as never });
});
afterEach(() => useAuthStore.setState({ user: null }));

/** Picks the archive, as a member's tap does, and lets the filing say what it has reached. */
const pick = async (r: Awaited<ReturnType<typeof vault>>) => {
  await act(async () => { await fireEvent.press(r.getByText('Tap to select your archive')); });
};

it('ready: an archive to bring in, and the two ways to take everything out', async () => {
  const r = await vault();
  expect(r.getByText('IMPORT & EXPORT')).toBeTruthy();
  expect(r.getByText('IMPORT YOUR DATA')).toBeTruthy();
  expect(r.getByText('Tap to select your archive')).toBeTruthy();
  expect(r.getByText('EXPORT YOUR DATA')).toBeTruthy();
  expect(r.getByText('EXPORT DATA (CSV)')).toBeTruthy();
  expect(r.getByText('EXPORT FULL ARCHIVE (JSON)')).toBeTruthy();
  expect(r.queryByText(/Undo the last transfer/i)).toBeNull();
});

it('filing: the phase, how far it has come, and the film it is on', async () => {
  mockFiling = (_uri, onProgress) => {
    onProgress({ phase: 'FILING LOGS', current: 1200, total: 4800, detail: 'Mulholland Drive (2001)' });
    return new Promise(() => {});
  };
  const r = await vault();
  await pick(r);
  expect(r.getByText('FILING LOGS')).toBeTruthy();
  expect(r.getByText('1,200 / 4,800')).toBeTruthy();
  expect(r.getByText('Mulholland Drive (2001)')).toBeTruthy();
  expect(r.queryByText('Tap to select your archive')).toBeNull();
});

it('filed whole: every kind counted, and another file may follow', async () => {
  mockFiling = async () => FILED;
  const r = await vault();
  await pick(r);
  expect(r.getByText('TRANSFER COMPLETE')).toBeTruthy();
  for (const [value, label] of [['4,120', 'FILM LOGS'], ['38', 'REVIEWS'], ['96', 'WATCHLIST'], ['7', 'STACKS'], ['3', 'PHYSICAL']]) {
    expect(r.getByText(value!)).toBeTruthy();
    expect(r.getByText(label!)).toBeTruthy();
  }
  expect(r.getByText('IMPORT ANOTHER FILE')).toBeTruthy();
});

it('filed with exceptions: what could not be matched, the first eight reasons, and how many more', async () => {
  mockFiling = async () => EXCEPTIONS;
  const r = await vault();
  await pick(r);
  expect(r.getByText('FILED WITH EXCEPTIONS')).toBeTruthy();
  expect(r.getByText('12 films could not be matched')).toBeTruthy();
  expect(r.getByText(/Row 4: no film matches/)).toBeTruthy();
  expect(r.queryByText(/Row 337: no film matches/)).toBeNull();
  expect(r.getByText('…and 2 more')).toBeTruthy();
});

it('a transfer that can still be taken back says how much it would take', async () => {
  mockUndoable = 1240;
  const r = await vault();
  expect(r.getByLabelText('Undo the last transfer, removing 1,240 entries')).toBeTruthy();
  expect(r.getByText('UNDO LAST TRANSFER (1,240)')).toBeTruthy();
});

it('a count is marked at every thousand, and only there', () => {
  expect([0, 7, 999, 1000, 1240, 48000, 1234567].map(grouped)).toEqual(['0', '7', '999', '1,000', '1,240', '48,000', '1,234,567']);
  expect(grouped(-1240)).toBe('-1,240');
  expect(grouped(1240.5)).toBe('1,240.5');
});

it('exporting: the export under way says so, and the other waits', async () => {
  const r = await vault();
  await act(async () => { await fireEvent.press(r.getByText('EXPORT DATA (CSV)')); });
  expect(r.getByText('EXPORTING…')).toBeTruthy();
  expect(r.getByText('EXPORT FULL ARCHIVE (JSON)')).toBeTruthy();
});
