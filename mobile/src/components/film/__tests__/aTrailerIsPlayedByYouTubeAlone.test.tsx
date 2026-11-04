/**
 * A trailer is played by YouTube alone, and a key from outside never writes the page (P4.2).
 *
 * TMDB's video key was written into the player's page as it came, and the page loaded from
 * youtube.com, kept YouTube's cookies and storage between plays, and started on its own. Now the
 * key has YouTube's own shape or nothing is drawn; the page and its embed come from YouTube's
 * privacy-enhanced origin, wait for a tap, and keep nothing past one play; the page itself never
 * leaves that origin. What the player says (ready, or YouTube's refusal) is passed on, and drawn as
 * an undrawn point the sealed run waits for (trailer.yaml).
 */
import React from 'react';
import { act, render } from '@testing-library/react-native';

import { heardFromPlayer, PLAYER_ORIGIN, playerMayLoad, TrailerModal } from '../TrailerModal';

const mockSeen: Record<string, any>[] = [];
jest.mock('react-native-webview', () => ({
  WebView: (props: Record<string, any>) => { mockSeen.push(props); return null; },
}));

const KEY = 'Odyssey_23x';
const player = (videoId: string) => {
  mockSeen.length = 0;
  render(<TrailerModal visible videoId={videoId} label="Official Trailer" onClose={jest.fn()} />);
  return mockSeen.at(-1);
};

describe('the trailer player', () => {
  it('plays the key from the privacy-enhanced origin, on a tap, and keeps nothing past the play', () => {
    const p = player(KEY);
    expect(p).toBeDefined();
    expect(p!.source.baseUrl).toBe(PLAYER_ORIGIN);
    expect(PLAYER_ORIGIN).toBe('https://www.youtube-nocookie.com');
    expect(p!.source.html).toContain(`src="https://www.youtube-nocookie.com/embed/${KEY}?`);
    expect(p!.source.html).not.toMatch(/youtube\.com\/embed|autoplay=1/);
    expect(p!.onShouldStartLoadWithRequest).toBe(playerMayLoad);
    expect([p!.incognito, p!.thirdPartyCookiesEnabled, p!.sharedCookiesEnabled]).toEqual([true, false, false]);
  });

  it('listens to the player, from its origin alone', () => {
    const html: string = player(KEY)!.source.html;
    expect(html).toContain(`/embed/${KEY}?enablejsapi=1&origin=${PLAYER_ORIGIN}&`);
    expect(html).toContain(`if (e.origin !== '${PLAYER_ORIGIN}'`);
    expect(html).toContain(`JSON.stringify({ event: 'listening', id: 1, channel: 'widget' }), '${PLAYER_ORIGIN}')`);
  });

  it('draws what the player said, and forgets it when the trailer opens again', async () => {
    mockSeen.length = 0;
    const r = render(<TrailerModal visible videoId={KEY} label="Official Trailer" onClose={jest.fn()} />);
    expect(r.queryByTestId('trailer-ready')).toBeNull();
    await act(async () => { mockSeen.at(-1)!.onMessage({ nativeEvent: { data: '{"event":"onReady","info":null}' } }); });
    expect(r.getByTestId('trailer-ready')).toBeTruthy();
    await act(async () => { mockSeen.at(-1)!.onMessage({ nativeEvent: { data: 'not the player' } }); });
    expect(r.getByTestId('trailer-ready')).toBeTruthy();
    await act(async () => { mockSeen.at(-1)!.onMessage({ nativeEvent: { data: '{"event":"onError","info":153}' } }); });
    expect([r.queryByTestId('trailer-ready'), r.getByTestId('trailer-refused')].map(Boolean)).toEqual([false, true]);
    await act(async () => { r.rerender(<TrailerModal visible={false} videoId={KEY} label="Official Trailer" onClose={jest.fn()} />); });
    await act(async () => { r.rerender(<TrailerModal visible videoId={KEY} label="Official Trailer" onClose={jest.fn()} />); });
    expect(r.queryByTestId('trailer-refused')).toBeNull();
  });

  it('hears the player’s ready and its refusal, and nothing else', () => {
    expect(heardFromPlayer('{"event":"onReady","info":null}')).toEqual({ said: 'ready' });
    expect(heardFromPlayer('{"event":"onError","info":153}')).toEqual({ said: 'refused', code: 153 });
    expect(heardFromPlayer('{"event":"onError","info":"x"}')).toEqual({ said: 'refused', code: null });
    expect(['{"event":"onStateChange","info":1}', '{"event":"listening"}', 'null', '[]', 'onReady', '']
      .map(heardFromPlayer)).toEqual([null, null, null, null, null, null]);
  });

  it.each([
    ['a quote and a tag', 'x" onload="alert(1)'],
    ['a closing tag', '</iframe><script>alert(1)</script>'],
    ['a path', '../../x/y/z'],
    ['ten letters', 'Odyssey_23'],
    ['twelve letters', 'Odyssey_23xy'],
    ['a space', 'Odyssey 23x'],
    ['nothing', ''],
  ])('draws nothing for a key that is %s', (_why, hostile) => {
    expect(player(hostile)).toBeUndefined();
  });

  it.each([
    ['the page, as iOS asks for it', { url: PLAYER_ORIGIN, isTopFrame: true }, true],
    ['the embed', { url: `${PLAYER_ORIGIN}/embed/${KEY}?rel=0`, isTopFrame: true }, true],
    ['the page stopped', { url: 'about:blank', isTopFrame: false }, true],
    ["a frame YouTube's player opens, on iOS", { url: 'https://www.google.com/x', isTopFrame: false }, true],
    ['youtube.com in the page', { url: 'https://www.youtube.com/watch?v=x', isTopFrame: true }, false],
    ['another page, as Android asks (no isTopFrame)', { url: 'https://evil.example/' }, false],
    ['an origin that only starts like the player', { url: `${PLAYER_ORIGIN}.evil.example/`, isTopFrame: true }, false],
    ['a frame over http', { url: 'http://www.google.com/x', isTopFrame: false }, false],
    ['a page from data', { url: 'data:text/html,<script>1</script>', isTopFrame: true }, false],
    ['a page from about: other than blank', { url: 'about:srcdoc', isTopFrame: true }, false],
    ['javascript in a frame', { url: 'javascript:alert(1)', isTopFrame: false }, false],
  ])('%s: judged as it should be', (_what, request, may) => {
    expect(playerMayLoad(request)).toBe(may);
  });
});
