/**
 * A busy catalogue is no lost connection, and a hung one is said at its deadline (review round 13).
 * ─────────────────────────────────────────────────────────────────────────────
 * The house's TMDB proxy answers 429 when this phone has asked TMDB more than its share for the
 * moment. fetchTMDB took that for a failing server: it asked again inside the same minute, then
 * said the catalogue could not be reached, so an import told the member to check a connection
 * that was fine. Now a short wait the proxy asks for is sat out, and a longer one is said as busy
 * (TmdbBusy, with how long), never as unreachable. The proxy's 504 is its own deadline for TMDB
 * already spent: asked twice more, a hung catalogue was said after some 31 seconds; now at once.
 * A read the house's proxy answered with a failure says so (answered), so an import waits on it
 * rather than blaming the member's connection. Every read asks with the public key alone: none
 * waits on the member's session.
 */
import React from 'react';
import { render } from '@testing-library/react-native';
import { busyWaitMs, tmdb } from '../tmdb';
import { supabase } from '../supabase';
import { retryDelay } from '../queryPolicy';
import { TmdbBusy } from '../tmdbErrors';
import { EmptyOffline } from '@/src/components/EmptyStates';

jest.unmock('../tmdb');

const answer = (status: number, body: unknown = {}, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers });

let film = 7000;
/** A film nobody asked for yet in this file: the module keeps what it has read. */
const fresh = () => ++film;

beforeEach(() => {
  global.fetch = jest.fn();
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('the catalogue asking us to wait', () => {
  it('a short wait is sat out, and the film is read', async () => {
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce(answer(429, { error: 'Rate limit exceeded' }, { 'Retry-After': '0.25' }))
      .mockResolvedValueOnce(answer(200, { id: 1, title: 'Sunrise' }));
    const t0 = performance.now();
    await expect(tmdb.detail(fresh())).resolves.toMatchObject({ title: 'Sunrise' });
    expect(global.fetch).toHaveBeenCalledTimes(2);
    expect(performance.now() - t0).toBeGreaterThanOrEqual(200);
  });

  it('a long wait is said as busy, with how long, at once: never as a lost connection', async () => {
    (global.fetch as jest.Mock).mockImplementation(async () => answer(429, { error: 'Rate limit exceeded' }, { 'Retry-After': '30' }));
    const said = await tmdb.findFilm('Sunrise', '1927').catch((e: unknown) => e);
    expect(said).toMatchObject({ name: 'TmdbBusy', retryAfterMs: 30_000 });
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it('asked to wait three times running, it is busy, not unreachable', async () => {
    (global.fetch as jest.Mock).mockImplementation(async () => answer(429, {}, { 'Retry-After': '0.25' }));
    const said = await tmdb.detail(fresh()).catch((e: unknown) => e);
    expect(said).toMatchObject({ name: 'TmdbBusy' });
    expect(global.fetch).toHaveBeenCalledTimes(3);
  });

  it('a wait unsaid is a second; a wait past reason is a minute', () => {
    expect([busyWaitMs(null), busyWaitMs(''), busyWaitMs('soon'), busyWaitMs('-3')]).toEqual([1000, 1000, 1000, 1000]);
    expect([busyWaitMs('2'), busyWaitMs('0.1'), busyWaitMs('9999')]).toEqual([2000, 250, 60_000]);
  });
});

describe('a catalogue that does not answer', () => {
  it('the proxy\'s own deadline spent (504) is said at once, not after two more of it', async () => {
    (global.fetch as jest.Mock).mockImplementation(async () => answer(504, { error: 'TMDB did not answer in time' }));
    const said = await tmdb.detail(fresh()).catch((e: unknown) => e);
    expect(said).toMatchObject({ name: 'TmdbUnreachable' });
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it('a server failing for a moment (503) is still asked again', async () => {
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce(answer(503))
      .mockResolvedValueOnce(answer(200, { id: 2, title: 'Greed' }));
    await expect(tmdb.detail(fresh())).resolves.toMatchObject({ title: 'Greed' });
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });
});

describe('who asks', () => {
  it('every read asks with the public key, and none waits on the member\'s session', async () => {
    const session = supabase.auth.getSession as jest.Mock;
    session.mockClear();
    (global.fetch as jest.Mock).mockImplementation(async () => answer(200, { results: [] }));
    await tmdb.findFilm('Greed', '1924');
    const call = (global.fetch as jest.Mock).mock.calls[0];
    expect(call).toBeDefined();
    const headers = (call![1] as { headers: Record<string, string> }).headers;
    expect(headers.Authorization).toBe(`Bearer ${headers.apikey}`);
    expect(session).not.toHaveBeenCalled();
  });

  it('an import asks for one film, by its title and its own first release year, films alone', async () => {
    (global.fetch as jest.Mock).mockImplementation(async () => answer(200, { results: [] }));
    await tmdb.findFilm('The Crowd', '1928');
    const call = (global.fetch as jest.Mock).mock.calls[0];
    expect(call).toBeDefined();
    expect(JSON.parse((call![1] as { body: string }).body)).toEqual({
      path: '/search/movie?query=The%20Crowd&primary_release_year=1928&page=1&include_adult=false',
    });
  });
});

describe('what the house answered', () => {
  it('its own deadline spent, or a failure after its tries, is said as answered: the connection was fine', async () => {
    (global.fetch as jest.Mock).mockImplementation(async () => answer(504));
    expect(await tmdb.detail(fresh()).catch((e: unknown) => e)).toMatchObject({ name: 'TmdbUnreachable', answered: true });
    (global.fetch as jest.Mock).mockImplementation(async () => answer(502));
    expect(await tmdb.detail(fresh()).catch((e: unknown) => e)).toMatchObject({ name: 'TmdbUnreachable', answered: true });
  });

  it('no connection at all is not', async () => {
    (global.fetch as jest.Mock).mockRejectedValue(new Error('Network request failed'));
    expect(await tmdb.detail(fresh()).catch((e: unknown) => e)).toMatchObject({ name: 'TmdbUnreachable', answered: false });
  });
});

describe('a screen whose read the catalogue asked to wait', () => {
  it('asks again after as long as it was asked (at most ten seconds), not on the usual backoff', () => {
    expect(retryDelay(0, new TmdbBusy('/movie/1', 4000))).toBe(4000);
    expect(retryDelay(0, new TmdbBusy('/movie/1', 60_000))).toBe(10_000);
    expect(retryDelay(0, new Error('x'))).toBe(1000);
  });

  it('says the catalogue is busy, never that the connection was lost', async () => {
    const busy = await render(<EmptyOffline busy onRetry={jest.fn()} />);
    expect(busy.getByText('The Catalogue Is Busy')).toBeTruthy();
    expect(busy.queryByText(/connection|signal|severed/i)).toBeNull();
  });
});
