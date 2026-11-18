/**
 * A trailer out of reach says so, with a way to try again (review round 13).
 *
 * The player's page is written by the app, so it is always there; the player inside it comes from
 * YouTube. With no signal, or one too weak for YouTube, the player never arrived and never spoke:
 * the member saw a black box (iPhone) or the browser's own error page (Android), with no word from
 * the house and no TRY AGAIN. Now the page says so itself, at once when the phone is offline or
 * when the player has not spoken in eight seconds, and the house draws THE FOOTAGE COULD NOT BE
 * REACHED with TRY AGAIN, which loads the player once more, and the way to YouTube's own.
 */
import React from 'react';
import vm from 'vm';
import { act, fireEvent, render } from '@testing-library/react-native';

import { heardFromPlayer, TrailerModal, UNREACHED_AFTER_MS } from '../TrailerModal';

const mockSeen: Record<string, any>[] = [];
const mockInjected: string[] = [];
jest.mock('react-native-webview', () => {
  const React = require('react');
  return {
    WebView: React.forwardRef((props: Record<string, any>, ref: React.Ref<unknown>) => {
      React.useImperativeHandle(ref, () => ({ injectJavaScript: (js: string) => { mockInjected.push(js); } }));
      mockSeen.push(props);
      return null;
    }),
  };
});

const KEY = 'Odyssey_23x';
const latest = () => {
  const p = mockSeen[mockSeen.length - 1];
  expect(p).toBeDefined();
  return p!;
};
const said = (data: object) => act(async () => { latest().onMessage({ nativeEvent: { data: JSON.stringify(data) } }); });

/**
 * The page's own script, run as the WebView would: what it posts to the app, with the phone on
 * or offline, and a clock moved by hand.
 */
function runPage(online: boolean) {
  const html: string = (() => {
    mockSeen.length = 0;
    render(<TrailerModal visible videoId={KEY} label="Official Trailer" onClose={jest.fn()} />);
    return latest().source.html;
  })();
  const script = html.slice(html.indexOf('<script>') + '<script>'.length, html.indexOf('</script>'));
  const posted: string[] = [];
  const timers: { at: number; run: () => void }[] = [];
  const listeners: Record<string, ((e: unknown) => void)[]> = {};
  // The player's frame, counting each time its address is set (setting it again loads it again).
  let src = 'embed';
  const player = {
    loads: 0,
    get src() { return src; },
    set src(v: string) { src = v; player.loads += 1; },
    addEventListener: jest.fn(),
    contentWindow: { postMessage: jest.fn() },
  };
  const window: Record<string, unknown> = {
    ReactNativeWebView: { postMessage: (m: string) => posted.push(m) },
    addEventListener: (type: string, fn: (e: unknown) => void) => { (listeners[type] ??= []).push(fn); },
  };
  let now = 0;
  const navigator = { onLine: online };
  const context = vm.createContext({
    window,
    document: { getElementById: () => player },
    navigator,
    JSON,
    setTimeout: (run: () => void, ms: number) => { timers.push({ at: now + ms, run }); return timers.length; },
    clearTimeout: (id: number) => { const t = timers[id - 1]; if (t) t.at = Infinity; },
  });
  vm.runInContext(script, context);
  const pass = (ms: number) => {
    now += ms;
    for (const t of timers) if (t.at <= now) { t.at = Infinity; t.run(); }
  };
  const playerSays = (event: string) => (listeners.message ?? []).forEach((fn) =>
    fn({ origin: 'https://www.youtube-nocookie.com', data: JSON.stringify({ event }) }));
  const phoneSays = (type: 'online' | 'offline') => {
    navigator.onLine = type === 'online';
    (listeners[type] ?? []).forEach((fn) => fn({}));
  };
  return { posted, pass, playerSays, phoneSays, askAgain: () => (window.askAgain as () => void)(), player };
}

describe('the player\'s page', () => {
  it('offline, it says at once that the player cannot be reached', () => {
    const page = runPage(false);
    expect(page.posted).toEqual([JSON.stringify({ event: 'unreached' })]);
  });

  it('online, a player that never speaks is said unreached at its time, and not before', () => {
    const page = runPage(true);
    page.pass(UNREACHED_AFTER_MS - 1);
    expect(page.posted).toEqual([]);
    page.pass(1);
    expect(page.posted).toEqual([JSON.stringify({ event: 'unreached' })]);
  });

  it('a player that arrives in time is never said unreached', () => {
    const page = runPage(true);
    page.playerSays('onReady');
    page.pass(UNREACHED_AFTER_MS * 2);
    expect(page.posted.map((m) => JSON.parse(m).event)).toEqual(['onReady']);
  });

  it('asked again, it loads the player once more, says so, and watches for it again', () => {
    const page = runPage(true);
    page.pass(UNREACHED_AFTER_MS);
    page.askAgain();
    expect(page.player.loads).toBe(1);
    expect(page.player.src).toBe('embed');
    page.pass(UNREACHED_AFTER_MS);
    expect(page.posted.map((m) => JSON.parse(m).event)).toEqual(['unreached', 'asking', 'unreached']);
  });

  it('the connection back, a player that never arrived is asked for again by itself', () => {
    const page = runPage(false);
    page.phoneSays('online');
    expect(page.player.loads).toBe(1);
    expect(page.posted.map((m) => JSON.parse(m).event)).toEqual(['unreached', 'asking']);
  });

  it('the connection back, a player already playing is left alone', () => {
    const page = runPage(true);
    page.playerSays('onReady');
    page.phoneSays('online');
    expect(page.player.loads).toBe(0);
  });
});

describe('the box, when the player cannot be reached', () => {
  it('hears the page\'s word', () => {
    expect(heardFromPlayer('{"event":"unreached"}')).toEqual({ said: 'unreached' });
    expect(heardFromPlayer('{"event":"asking"}')).toEqual({ said: 'asking' });
  });

  it('the page asking again by itself clears the word while the player comes', async () => {
    mockSeen.length = 0;
    const r = render(<TrailerModal visible videoId={KEY} label="Official Trailer" onClose={jest.fn()} />);
    await said({ event: 'unreached' });
    expect(r.getByText('THE FOOTAGE COULD NOT BE REACHED.')).toBeTruthy();
    await said({ event: 'asking' });
    expect(r.queryByText('THE FOOTAGE COULD NOT BE REACHED.')).toBeNull();
  });

  it('offers YouTube\'s own one way, whichever word is said', async () => {
    mockSeen.length = 0;
    const r = render(<TrailerModal visible videoId={KEY} label="Official Trailer" onClose={jest.fn()} />);
    await said({ event: 'unreached' });
    const unreached = r.getByLabelText('Watch on YouTube');
    mockSeen.length = 0;
    const q = render(<TrailerModal visible videoId={KEY} label="Official Trailer" onClose={jest.fn()} />);
    await said({ event: 'onError', info: 150 });
    const refused = q.getByLabelText('Watch on YouTube');
    expect([unreached.props.accessibilityRole, unreached.props.style]).toEqual([refused.props.accessibilityRole, refused.props.style]);
  });

  it('says so, offers TRY AGAIN, which loads the player once more, and YouTube\'s own', async () => {
    const open = jest.spyOn(require('react-native').Linking, 'openURL').mockResolvedValue(true);
    try {
      mockSeen.length = 0;
      mockInjected.length = 0;
      const r = render(<TrailerModal visible videoId={KEY} label="Official Trailer" onClose={jest.fn()} />);
      await said({ event: 'unreached' });
      expect(r.getByText('THE FOOTAGE COULD NOT BE REACHED.')).toBeTruthy();
      expect(r.getByTestId('trailer-unreached')).toBeTruthy();

      await fireEvent.press(r.getByLabelText('Watch on YouTube'));
      expect(open).toHaveBeenCalledWith(`https://www.youtube.com/watch?v=${KEY}`);

      await fireEvent.press(r.getByLabelText('Try again: play the footage'));
      expect(mockInjected.some((js) => js.includes('window.askAgain'))).toBe(true);
      expect(r.queryByText('THE FOOTAGE COULD NOT BE REACHED.')).toBeNull();
    } finally {
      open.mockRestore();
    }
  });

  it('a player that arrives late clears the word; a late word that it never did is none', async () => {
    mockSeen.length = 0;
    const r = render(<TrailerModal visible videoId={KEY} label="Official Trailer" onClose={jest.fn()} />);
    await said({ event: 'unreached' });
    await said({ event: 'onReady', info: null });
    expect(r.queryByText('THE FOOTAGE COULD NOT BE REACHED.')).toBeNull();
    expect(r.getByTestId('trailer-ready')).toBeTruthy();
    await said({ event: 'unreached' });
    expect(r.getByTestId('trailer-ready')).toBeTruthy();
  });

  // Left on screen: the captures measure the word and both ways on in the box, at every text size.
  it('draws the word and both ways on inside the box', async () => {
    mockSeen.length = 0;
    const r = render(<TrailerModal visible videoId={KEY} label="Official Trailer" onClose={jest.fn()} />);
    await said({ event: 'unreached' });
    expect(r.getByText('THE FOOTAGE COULD NOT BE REACHED.')).toBeTruthy();
    expect(r.getByLabelText('Try again: play the footage')).toBeTruthy();
    expect(r.getByLabelText('Watch on YouTube')).toBeTruthy();
  });
});
