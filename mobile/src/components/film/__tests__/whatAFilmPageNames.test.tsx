/**
 * whatAFilmPageNames.test.tsx — what the film page says about where a film
 * plays, what a video is, and what a file it sends looks like.
 *
 *   · WHERE IT PLAYS called a subscription service "STREAM FREE", ignored the
 *     free and with-ads lists TMDB sends, showed another country's services as
 *     the member's own, and said a film "isn't available on any streaming
 *     platform" from one country's list.
 *   · The player printed OFFICIAL TRAILER over every video, featurettes, clips
 *     and teasers included.
 *   · THE NITRATE FILE promised one picture on every phone, and its words grew
 *     with the sender's text size; a share that failed closed the file and said
 *     nothing.
 */
import React from 'react';
import { act, fireEvent, render } from '@testing-library/react-native';

import { WatchProviders, pickRegion } from '../WatchProviders';
import { regionOf } from '@/src/utils/deviceRegion';
import { footageLabel, TrailerModal } from '../TrailerModal';
import { FilmMediaCarousel } from '../FilmMediaCarousel';
import { NitrateFileCard } from '../NitrateFileCard';
import { ShareCardModal } from '../ShareCardModal';
import { readFixture } from '@/mockups/paths';

let mockRegion: string | null = 'US';
jest.mock('@/src/utils/deviceRegion', () => ({
  ...jest.requireActual('@/src/utils/deviceRegion'),
  deviceRegion: () => mockRegion,
}));
jest.mock('@shopify/flash-list', () => require('@/mockups/tabs/flashListMock').makeFlashListMock());
jest.mock('react-native-webview', () => ({ WebView: () => null }));
const mockCapture = jest.fn();
jest.mock('react-native-view-shot', () => {
  const R = require('react');
  return {
    __esModule: true,
    default: R.forwardRef(({ children }: { children: React.ReactNode }, ref: React.Ref<unknown>) => {
      R.useImperativeHandle(ref, () => ({ capture: () => mockCapture() }));
      return children;
    }),
  };
});
const mockShareAsync = jest.fn();
jest.mock('expo-sharing', () => ({ isAvailableAsync: async () => true, shareAsync: (...a: unknown[]) => mockShareAsync(...a) }));
const mockToastError = jest.fn();
jest.mock('@/src/utils/reelToast', () => {
  const fn = Object.assign(jest.fn(), { error: (...a: unknown[]) => mockToastError(...a), success: jest.fn(), info: jest.fn() });
  return { __esModule: true, default: fn };
});

const PROVIDERS = readFixture<any>('odyssey.json')['watch/providers'].results;

describe('WHERE IT PLAYS', () => {
  it('names each kind for what it costs, and lists the free ones first', () => {
    mockRegion = 'US';
    const r = render(<WatchProviders providers={PROVIDERS} />);
    expect(r.queryByText('STREAM FREE')).toBeNull();
    expect(r.getByText('FREE')).toBeTruthy();
    expect(r.getByText('WITH A SUBSCRIPTION')).toBeTruthy();
    expect(r.getByText('LISTED FOR US')).toBeTruthy();
    const order = ['FREE', 'WITH A SUBSCRIPTION', 'RENT', 'BUY']
      .map((l) => JSON.stringify(r.toJSON()).indexOf(`"${l}"`));
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });

  it('lists the member’s own country, never another’s as theirs', () => {
    mockRegion = 'GB';
    const r = render(<WatchProviders providers={PROVIDERS} />);
    expect(r.getByText('LISTED FOR GB')).toBeTruthy();
    // Britain rents and sells it; the US's free and subscription services are not Britain's.
    expect(r.queryByText('FREE')).toBeNull();
    expect(r.queryByText('WITH A SUBSCRIPTION')).toBeNull();
    expect(r.getByText('RENT')).toBeTruthy();
  });

  it('says nothing is listed in the member’s country, not on "any platform"', () => {
    mockRegion = 'IQ';
    const r = render(<WatchProviders providers={PROVIDERS} />);
    expect(r.getByText('Nothing is listed to stream, rent or buy in IQ right now.')).toBeTruthy();
    expect(r.queryByText(/any streaming platform/)).toBeNull();
  });

  it('without a country from the phone, shows the US list and says it is the US', () => {
    mockRegion = null;
    expect(pickRegion(PROVIDERS, null)).toBe('US');
    expect(pickRegion({ FR: {}, BE: {} }, null)).toBe('BE');
    expect(pickRegion(null, null)).toBeNull();
    const r = render(<WatchProviders providers={PROVIDERS} />);
    expect(r.getByText('LISTED FOR US')).toBeTruthy();
  });

  it('names every service for a screen reader, and opens JustWatch only where it can', () => {
    mockRegion = 'US';
    const r = render(<WatchProviders providers={PROVIDERS} />);
    const first = PROVIDERS.US.flatrate[0].provider_name;
    // A service in two lists (Kanopy is free AND a subscription) is named in each.
    expect(r.getAllByLabelText(`${first}. Opens JustWatch.`).length).toBeGreaterThan(0);
    const linkless = { US: { flatrate: [{ provider_id: 1, provider_name: 'Kanopy Plus', logo_path: null }] } };
    const t = render(<WatchProviders providers={linkless} />);
    expect(t.getByLabelText('Kanopy Plus')).toBeTruthy();
    expect(t.getByText('KP', { includeHiddenElements: true })).toBeTruthy();
  });

  it.each([
    ['en-GB', 'GB'], ['zh-Hans-CN', 'CN'], ['ar-IQ-u-nu-latn', 'IQ'], ['en_US', 'US'], ['en', null], ['es-419', null], ['', null],
  ])('reads the country of %s as %s', (locale, region) => {
    expect(regionOf(locale)).toBe(region);
  });
});

describe('the player names what it plays', () => {
  it('by the video’s own name, or its kind — never "OFFICIAL TRAILER" over a featurette', () => {
    expect(footageLabel({ key: 'a', name: 'Official Trailer 2', type: 'Trailer' })).toBe('Official Trailer 2');
    expect(footageLabel({ key: 'b', name: '  ', type: 'Featurette' })).toBe('FEATURETTE');
    expect(footageLabel({ key: 'c' })).toBe('FOOTAGE');
  });

  it('prints the label it is handed', () => {
    const r = render(<TrailerModal visible videoId="abc" label="Behind the Odyssey" onClose={jest.fn()} />);
    expect(r.getByText('Behind the Odyssey')).toBeTruthy();
    expect(r.queryByText('OFFICIAL TRAILER')).toBeNull();
  });

  it('the footage rail hands the whole video on, so it can be named', async () => {
    const onPlay = jest.fn();
    const video = { key: 'k1', name: 'Making the Sea', type: 'Featurette' };
    const r = render(<FilmMediaCarousel videos={[video]} onPlayVideo={onPlay} />);
    await act(async () => { fireEvent.press(r.getByLabelText('Play Featurette: Making the Sea')); });
    expect(onPlay).toHaveBeenCalledWith(video);
  });
});

describe('THE NITRATE FILE', () => {
  type Node = { type: string; props: Record<string, unknown>; children?: (Node | string)[] | null };
  const texts = (n: unknown, out: Node[] = []): Node[] => {
    if (!n || typeof n !== 'object') return out;
    if (Array.isArray(n)) { n.forEach((c) => texts(c, out)); return out; }
    const h = n as Node;
    if (h.type === 'Text') out.push(h);
    (h.children ?? []).forEach((c) => texts(c, out));
    return out;
  };

  it('is the same picture whatever text size its sender reads at: every word is frozen', () => {
    const r = render(<NitrateFileCard data={{
      title: 'The Odyssey', year: '2026', posterUrl: null, rating: 4, review: 'The sea is a character.',
      pullQuote: null, status: 'watched', username: 'morpho', memberNo: 12,
    }} />);
    const words = texts(r.toJSON());
    expect(words.length).toBeGreaterThanOrEqual(8);
    for (const w of words) expect(w.props.allowFontScaling).toBe(false);
  });

  const FILM = { id: 1, title: 'The Odyssey', poster_path: null };
  const open = (onClose = jest.fn()) => ({ onClose, r: render(<ShareCardModal visible onClose={onClose} film={FILM} log={null} username="morpho" memberNo={12} />) });

  beforeEach(() => { mockCapture.mockReset(); mockShareAsync.mockReset(); mockToastError.mockReset(); });

  it('a share that failed keeps the file open, and says so', async () => {
    mockCapture.mockRejectedValue(new Error('capture failed'));
    const { r, onClose } = open();
    await act(async () => { fireEvent.press(r.getByText('SHARE TO SOCIALS')); });
    expect(mockToastError).toHaveBeenCalledWith('The file could not be shared. Try again.');
    expect(onClose).not.toHaveBeenCalled();
  });

  it('a file that went closes', async () => {
    mockCapture.mockResolvedValue('file:///card.png');
    mockShareAsync.mockResolvedValue(undefined);
    const { r, onClose } = open();
    await act(async () => { fireEvent.press(r.getByText('SHARE TO SOCIALS')); });
    expect(mockShareAsync).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
    expect(mockToastError).not.toHaveBeenCalled();
  });
});
