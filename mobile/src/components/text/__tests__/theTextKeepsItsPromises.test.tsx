/**
 * The app's Text keeps its two promises — read from the props React Native's
 * own Text actually receives, which is what a phone draws.
 * ─────────────────────────────────────────────────────────────────────────────
 * The test this replaces faked `Text.render` and proved the old patch against
 * it. No phone has a `Text.render` (React Native 0.81's Text is a function),
 * so it proved nothing a phone ever ran. This renders the real component.
 */
import React from 'react';
import { act, render } from '@testing-library/react-native';
import { Dimensions, Platform, StyleSheet } from 'react-native';
import { Text, TextInput } from '../index';
import { AnimatedText } from '../AnimatedText';
import { useFontScale } from '@/src/hooks/useTextScale';

// Awaited: this testing library's act is async, and an act that is not awaited
// scrambles React's scopes — every render after it came back empty.
const setFontScale = async (fontScale: number) => {
  await act(async () => {
    const w = { width: 390, height: 844, scale: 3, fontScale };
    Dimensions.set({ window: w, screen: w });
  });
};
const onAndroid = () => { Platform.OS = 'android'; };
const was = Platform.OS;
afterEach(async () => { Platform.OS = was; await setFontScale(1); });

type Host = { type: string; props: Record<string, any>; children?: (Host | string)[] | null };
/** Every host node of a type, in order — what React Native itself receives. */
const hosts = (tree: ReturnType<ReturnType<typeof render>['toJSON']>, type: string): Host[] => {
  const out: Host[] = [];
  const walk = (n: unknown) => {
    if (!n || typeof n !== 'object') return;
    if (Array.isArray(n)) { n.forEach(walk); return; }
    const h = n as Host;
    if (h.type === type) out.push(h);
    (h.children ?? []).forEach(walk);
  };
  walk(tree);
  return out;
};
/** The props of the n-th host Text in the tree. */
const hostProps = (ui: React.ReactElement, n = 0) => hosts(render(ui).toJSON(), 'Text')[n].props;

describe('the ceiling', () => {
  it('a text with no ceiling of its own gets the house 1.35', () => {
    const p = hostProps(<Text>Lobby</Text>);
    expect([p.allowFontScaling, p.maxFontSizeMultiplier]).toEqual([true, 1.35]);
  });

  it('its own ceiling wins, and a frozen text stays frozen', () => {
    expect(hostProps(<Text maxFontSizeMultiplier={1.2}>Title</Text>).maxFontSizeMultiplier).toBe(1.2);
    expect(hostProps(<Text allowFontScaling={false}>STAMP</Text>).allowFontScaling).toBe(false);
  });

  it('a nested text is housed too', () => {
    const t = render(<Text>Outer <Text>inner</Text></Text>);
    expect(hosts(t.toJSON(), 'Text').map((e) => e.props.maxFontSizeMultiplier)).toEqual([1.35, 1.35]);
  });

  it('TextInput and AnimatedText keep it as well', () => {
    expect(hosts(render(<TextInput value="x" />).toJSON(), 'TextInput')[0].props.maxFontSizeMultiplier).toBe(1.35);
    expect(hostProps(<AnimatedText>12</AnimatedText>).maxFontSizeMultiplier).toBe(1.35);
  });
});

describe("Android's letter spacing, drawn as iOS draws it", () => {
  it('at 2×, a spaced label is handed half its spacing', async () => {
    onAndroid();
    await setFontScale(2);
    const p = hostProps(<Text style={{ letterSpacing: 2.2, fontSize: 10 }}>ARCHIVIST</Text>);
    expect(StyleSheet.flatten(p.style)).toEqual({ letterSpacing: 1.1, fontSize: 10 });
  });

  it('follows the setting LIVE — a member who changes it while the app is open', async () => {
    onAndroid();
    const t = render(<Text style={{ letterSpacing: 3 }}>LIVE</Text>);
    const spacing = () => StyleSheet.flatten(hosts(t.toJSON(), 'Text')[0].props.style).letterSpacing;
    expect(spacing()).toBe(3);
    await setFontScale(1.5);
    expect(spacing()).toBe(2);
  });

  it('on iOS nothing is touched, and a frozen text on Android is left as written', async () => {
    await setFontScale(2);
    const style = { letterSpacing: 2.2 };
    expect(hostProps(<Text style={style}>IOS</Text>).style).toBe(style);
    onAndroid();
    expect(hostProps(<Text style={style} allowFontScaling={false}>FROZEN</Text>).style).toBe(style);
  });
});

it('reads the setting from ONE listener, shared by every text', async () => {
  const add = jest.spyOn(Dimensions, 'addEventListener');
  let seen = 0;
  const Probe = () => { seen = useFontScale(); return null; };
  render(<><Probe /><Text>a</Text><Text>b</Text><Text>c</Text></>);
  await setFontScale(1.25);
  expect(seen).toBe(1.25);
  // The module subscribed once when it loaded; rendering texts adds none.
  expect(add).not.toHaveBeenCalled();
  add.mockRestore();
});

describe('an ornament is not read aloud', () => {
  const HIDDEN = { accessibilityElementsHidden: true, importantForAccessibility: 'no-hide-descendants' };

  it('a Text is named by its words alone — "✦ FOUNDING MEMBER" is not a star first', () => {
    expect(hostProps(<Text>✦ FOUNDING MEMBER</Text>).accessibilityLabel).toBe('FOUNDING MEMBER');
    expect(hostProps(<Text>✦ THIS DOSSIER IS SEALED ✦</Text>).accessibilityLabel).toBe('THIS DOSSIER IS SEALED');
    expect(hostProps(<Text>★ AUTEUR</Text>).accessibilityLabel).toBe('AUTEUR');
    expect(hostProps(<Text>◆ FIRST WATCH</Text>).accessibilityLabel).toBe('FIRST WATCH');
  });

  it('through nested Texts, as the phone reads them: one string', () => {
    expect(hostProps(<Text>◈ FROM <Text>THE FRONT DESK</Text> ◈</Text>).accessibilityLabel).toBe('FROM THE FRONT DESK');
  });

  it('a Text of only ornament, or only a separator, is hidden', () => {
    for (const only of ['✦', '◈', '⊗', '·', '—', ' · ']) {
      expect(hostProps(<Text>{only}</Text>)).toEqual(expect.objectContaining(HIDDEN));
    }
  });

  it('plain words are left exactly as they were', () => {
    const p = hostProps(<Text>Tokyo Story · 1953 — Ozu</Text>);
    expect(p.accessibilityLabel).toBeUndefined();
    expect(p.accessibilityElementsHidden).toBeUndefined();
  });

  it('what is not ornament is not touched: a "+", a member\'s own "()," ', () => {
    expect(hostProps(<Text>+</Text>).accessibilityElementsHidden).toBeUndefined();
    expect(hostProps(<Text>(),</Text>).accessibilityElementsHidden).toBeUndefined();
  });

  it('a label or hiding the Text sets itself always wins', () => {
    expect(hostProps(<Text accessibilityLabel="Founding member">✦ FOUNDING MEMBER</Text>).accessibilityLabel).toBe('Founding member');
    expect(hostProps(<Text importantForAccessibility="yes">✦</Text>).accessibilityElementsHidden).toBeUndefined();
  });

  it('an animated Text keeps the promise too', () => {
    expect(hostProps(<AnimatedText>✦ ARCHIVIST</AnimatedText>).accessibilityLabel).toBe('ARCHIVIST');
  });
});

describe('a word that shrinks to fit stops at the floor', () => {
  const shrunk = (style: object, scale: number, extra: object = {}) =>
    hostProps(<Text style={style} adjustsFontSizeToFit minimumFontScale={scale} {...extra}>The Nitrate Circle</Text>).minimumFontScale;

  it('a 10pt label asked to shrink to 0.75 does not shrink at all', () => {
    expect(shrunk({ fontSize: 10 }, 0.75)).toBe(1);
  });

  it('a larger word may shrink, down to 10pt and no further', () => {
    expect(shrunk({ fontSize: 20 }, 0.3)).toBeCloseTo(0.5);
    expect(shrunk({ fontSize: 26 }, 0.7)).toBe(0.7);
  });

  it('a word grown by the member’s text size may give that back, to the floor', async () => {
    await setFontScale(1.35);
    // 10pt drawn at 13.5pt may shrink to 10pt again.
    expect(shrunk({ fontSize: 10 }, 0.5)).toBeCloseTo(10 / 13.5);
  });

  it('a frozen word cannot use a growth it never had', async () => {
    await setFontScale(1.35);
    expect(shrunk({ fontSize: 10 }, 0.5, { allowFontScaling: false })).toBe(1);
  });

  it('a word set below the floor by design never shrinks below its own size', () => {
    expect(shrunk({ fontSize: 9 }, 0.8)).toBe(1);
  });

  it('reads the size through a style array, as screens write it', () => {
    expect(shrunk([{ fontSize: 30 }, { fontSize: 12 }], 0.5)).toBeCloseTo(10 / 12);
  });

  it('leaves a word that does not shrink exactly as it was', () => {
    expect(hostProps(<Text style={{ fontSize: 10 }} minimumFontScale={0.5}>Lobby</Text>).minimumFontScale).toBe(0.5);
  });
});
