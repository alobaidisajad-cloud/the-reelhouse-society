/**
 * aSpoilerNeverLeavesTheHouse.test.tsx — review round 13 (sharedWords, filingShared, the Nitrate File)
 * ─────────────────────────────────────────────────────────────────────────────
 * A member logged a film with a review marked "Contains spoilers" (or filed a take with SPOILERS);
 * on its page the words stood behind the veil. Another member pressed SHARE, and the words went
 * out in clear: the log's file printed the pull quote (or the review's first lines), the film
 * page's text share quoted the review, a take's line in another app and its preview in the share
 * sheet printed the take, and a take's card in a salon was titled with it. One rule now
 * (sharedWords): words marked as a spoiler never leave the house; the share says only that it
 * holds spoilers, for every sharer, the author included (no one can uncover a picture).
 */
import React from 'react';
import { Share } from 'react-native';
import { act, fireEvent, render } from '@testing-library/react-native';
import { SPOILERS_LEADER, sharedWords } from '../sharedWords';
import { filingShareLine, filingShareOpening, filingSpineLine } from '@/src/components/dispatch/paper/filingShared';
import { NitrateFileCard } from '@/src/components/film/NitrateFileCard';
import { ShareCardModal } from '@/src/components/film/ShareCardModal';

jest.mock('react-native-view-shot', () => {
  const R = require('react');
  return {
    __esModule: true,
    default: R.forwardRef(({ children }: { children: React.ReactNode }, ref: React.Ref<unknown>) => {
      R.useImperativeHandle(ref, () => ({ capture: async () => 'file:///card.png' }));
      return children;
    }),
  };
});
// A phone with no share sheet for a file: the film page's file goes as a line of text.
jest.mock('expo-sharing', () => ({ isAvailableAsync: async () => false, shareAsync: jest.fn() }));
jest.mock('@/src/utils/reelToast', () => {
  const fn = Object.assign(jest.fn(), { error: jest.fn(), success: jest.fn(), info: jest.fn() });
  return { __esModule: true, default: fn };
});

const SPOILER = 'Rosebud is the sled he lost as a boy.';

type Picture = { type: string; props: { onDisplay?: () => void }; children?: unknown[] };
/** Every expo-image picture in the drawn tree (the mock is a host element, `ExpoImage`). */
const pictures = (tree: unknown): Picture[] => {
  const out: Picture[] = [];
  const go = (j: unknown) => {
    if (!j || typeof j !== 'object') return;
    if (Array.isArray(j)) { j.forEach(go); return; }
    const n = j as Picture;
    if (n.type === 'ExpoImage') out.push(n);
    (n.children ?? []).forEach(go);
  };
  go(tree);
  return out;
};

describe('the one rule', () => {
  it('words marked as a spoiler never leave; others leave as they are', () => {
    expect(sharedWords(SPOILER, true)).toBeNull();
    expect(sharedWords(SPOILER, 'SPOILERS')).toBeNull();
    expect(sharedWords(`  ${SPOILER} `, false)).toBe(SPOILER);
    expect(sharedWords('   ', null)).toBeNull();
  });

  it('a take marked SPOILERS leaves as what it is, its film and its spoilers: never its words', () => {
    const take = { kind: 'take', body: SPOILER, spoilerLabel: 'SPOILERS', film: { title: 'Citizen Kane' } };
    expect(filingShareLine(take)).toBe('TAKE on Citizen Kane · SPOILERS');
    expect(filingShareLine({ ...take, film: null })).toBe('TAKE · SPOILERS');
    // A take with no spoilers leaves in its own words, and an essay by its headline, as before.
    expect(filingShareLine({ ...take, spoilerLabel: null })).toBe(SPOILER);
    expect(filingShareLine({ kind: 'dossier', title: 'On Kane', body: SPOILER, spoilerLabel: 'SPOILERS' })).toBe('On Kane');
    expect(filingShareOpening({ kind: 'dossier', title: 'On Kane', body: SPOILER, fullContent: SPOILER, spoilerLabel: 'SPOILERS' })).toBe(SPOILERS_LEADER);
    expect(filingShareOpening({ kind: 'dossier', title: 'On Kane', body: 'b', fullContent: SPOILER, spoilerLabel: null })).toBe(SPOILER);
  });

  it('the spine pinned over a take\'s page names its film and its spoilers, never its words, and not its kind twice', () => {
    const take = { kind: 'take', body: SPOILER, spoilerLabel: 'SPOILERS', film: { title: 'Citizen Kane' } };
    expect(filingSpineLine(take)).toBe('On Citizen Kane · SPOILERS');
    expect(filingSpineLine({ ...take, film: null })).toBe('SPOILERS');
    expect(filingSpineLine({ ...take, spoilerLabel: null })).toBe(SPOILER);
  });
});

describe('THE NITRATE FILE', () => {
  const LOG = { title: 'Citizen Kane', year: '1941', posterUrl: null, rating: 5, status: 'watched', username: 'ana', review: SPOILER, pullQuote: 'Rosebud, the sled.' };

  it('a review marked as a spoiler leaves no words on the file, only that there are spoilers', () => {
    const r = render(<NitrateFileCard data={{ ...LOG, isSpoiler: true }} />);
    expect(r.queryByText(/Rosebud/, { includeHiddenElements: true })).toBeNull();
    expect(r.getByText(SPOILERS_LEADER, { includeHiddenElements: true })).toBeTruthy();
  });

  it('one with no spoilers carries its pull quote, as before', () => {
    const r = render(<NitrateFileCard data={{ ...LOG, isSpoiler: false }} />);
    expect(r.getByText(/Rosebud, the sled\./, { includeHiddenElements: true })).toBeTruthy();
    expect(r.queryByText(SPOILERS_LEADER, { includeHiddenElements: true })).toBeNull();
  });

  it('the film page\'s file sent as text never quotes a spoiler review', async () => {
    const shared = jest.spyOn(Share, 'share').mockResolvedValue({ action: 'sharedAction' } as never);
    const FILM = { id: 1, title: 'Citizen Kane' };
    const r = render(<ShareCardModal visible onClose={jest.fn()} film={FILM} log={{ rating: 5, review: SPOILER, isSpoiler: true }} username="ana" memberNo={12} />);
    // No poster: the file is ready once the house's seal (its one picture) is drawn.
    await act(async () => { pictures(r.toJSON()).forEach((p) => p.props.onDisplay?.()); });
    await act(async () => { await fireEvent.press(r.getByText('SHARE TO SOCIALS')); });
    expect(shared).toHaveBeenCalledTimes(1);
    const call = shared.mock.calls[0];
    expect(call).toBeDefined();
    const said = (call![0] as { message?: string }).message ?? '';
    expect(said).not.toMatch(/Rosebud/);
    expect(said).toContain(SPOILERS_LEADER);
    shared.mockRestore();
  });
});
