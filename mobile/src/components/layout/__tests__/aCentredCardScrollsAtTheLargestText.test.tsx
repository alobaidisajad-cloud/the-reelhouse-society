/**
 * A card centred in a <Modal> stays between the window's edges, and scrolls when it is taller.
 *
 * The Nitrate File, the Oracle, the Initiation, password recovery and the
 * security code each stood in the middle of the whole window: at the largest
 * text sizes, or on a small phone, their tops and feet ran under the status bar
 * and the home indicator, and nothing scrolled to their buttons. Each is drawn
 * here at the largest text size iOS offers (×3.1, the repo's largest pass) and
 * must draw ONE scroll (CentredCard) that:
 *
 *   · fills the overlay: no box between it and the <Modal> pads, centres or sizes it;
 *   · holds every word the <Modal> says;
 *   · grows its content to the room and centres it there (flexGrow, centre);
 *   · pads its content the same above and below, by navMetrics' overlay room;
 *   · ends above the keyboard while one is up.
 *
 * A card that fits is centred in the window, where it always stood; a taller one
 * starts below the status bar and its scroll ends above the home indicator.
 * A press on the ground beside a card closes it, where it did before; a press on
 * the card never does.
 *
 * Every <Modal> in app/ and src/ is listed below with its kind, so a new one fails
 * here until someone says what it is: a centred card must be drawn in a CentredCard.
 */
import React, { act } from 'react';
import { StyleSheet } from 'react-native';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { join, relative } from 'path';
import { readCode } from '@/test-utils/readCode';
import { files as universe } from '@/test-utils/universe';
import { overlayRoomEdge, overlayRoomKeyboardClearance } from '@/src/components/layout/navMetrics';
import { ShareCardModal } from '@/src/components/film/ShareCardModal';
import { WatchlistRoulette } from '@/src/components/profile/WatchlistRoulette';
import InitiationModal from '@/src/components/InitiationModal';
import { PasswordRecoveryModal } from '@/src/components/auth/PasswordRecoveryModal';
import { SettingsScreen } from '@/src/features/settings/SettingsScreen';

const ts = require('typescript');

jest.setTimeout(60_000);

/** The largest text size the layout passes measure (mockups/tools/layout.cjs: iOS ×3.1). */
const LARGEST = 3.1;
const TOP = 59;
let mockInsetBottom = 34;
jest.mock('react-native-safe-area-context', () => {
  const mockReact = require('react');
  const { View } = require('react-native');
  return {
    SafeAreaProvider: ({ children }: { children: React.ReactNode }) => mockReact.createElement(View, null, children),
    useSafeAreaInsets: () => ({ top: 59, bottom: mockInsetBottom, left: 0, right: 0 }),
    useSafeAreaFrame: () => ({ x: 0, y: 0, width: 390, height: 844 }),
  };
});
jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({
  __esModule: true,
  default: () => ({ width: 390, height: 844, scale: 3, fontScale: 3.1 }),
}));
/** The keyboard's height, as a Modal hears it. */
let mockKeyboard = 0;
jest.mock('@/src/hooks/useModalKeyboardPadding', () => ({
  ...jest.requireActual('@/src/hooks/useModalKeyboardPadding'),
  useModalKeyboardHeight: () => ({ value: mockKeyboard }),
}));
jest.mock('react-native-view-shot', () => {
  const R = require('react');
  return { __esModule: true, default: R.forwardRef(({ children }: { children: React.ReactNode }, _ref: unknown) => children) };
});
// The settings page, drawn only to open its security code: as settings.redesign draws it.
const mockAlert = jest.fn();
jest.mock('react-native/Libraries/Alert/Alert', () => {
  const Alert = { alert: (...a: unknown[]) => mockAlert(...a) };
  return { __esModule: true, default: Alert, ...Alert };
});
jest.mock('@react-navigation/native', () => ({
  usePreventRemove: jest.fn(),
  useNavigation: () => ({ dispatch: jest.fn() }),
  useIsFocused: () => true,
}));
jest.mock('@/src/stores/auth', () => {
  const user = { id: 'u1', username: 'kane', email: 'member@example.com', created_at: '2026-03-04T00:00:00Z', preferences: {} };
  const state = { user, logout: jest.fn(), setPreference: jest.fn(() => Promise.resolve()) };
  const useAuthStore = (sel?: (s: unknown) => unknown) => (sel ? sel(state) : state);
  (useAuthStore as unknown as { getState: () => unknown }).getState = () => state;
  return { useAuthStore };
});
jest.mock('@/src/features/settings/DataVault', () => ({ __esModule: true, default: () => null }));
jest.mock('@/src/lib/pushNotifications', () => ({
  getPushPermissionState: jest.fn(() => Promise.resolve('granted')),
  requestPushPermission: jest.fn(),
  registerForPushNotifications: jest.fn(),
}));

type J = { type: string; props: Record<string, unknown>; children: (J | string)[] | null };

/** Every node, with the chain of nodes above it. */
function walk(tree: unknown, fn: (n: J, above: J[]) => void) {
  const go = (n: J | string | null, above: J[]) => {
    if (!n || typeof n === 'string') return;
    fn(n, above);
    (n.children ?? []).forEach((c) => go(c, [...above, n]));
  };
  (Array.isArray(tree) ? tree : [tree]).forEach((n) => go(n as J, []));
}
const words = (n: J): string[] => {
  const out: string[] = [];
  walk(n, (x) => { if (x.type === 'Text') (x.children ?? []).forEach((c) => { if (typeof c === 'string' && c.trim()) out.push(c.trim()); }); });
  return out;
};

const FILM = { id: 843, title: 'In the Mood for Love', poster_path: null, release_date: '2000-09-29' };
const QUEUE = [{ id: 603, filmId: 603, title: 'The Matrix', poster_path: null, year: 1999 }];
const RECOVERY = {
  visible: true, purpose: 'reset' as const, forgotEmail: 'kane@example.com', forgotLoading: false,
  onEmailChange: jest.fn(), onSubmit: jest.fn(), onBackToSignIn: jest.fn(),
};

type Card = {
  file: string;
  name: string;
  draw: (close: () => void) => React.ReactElement;
  /** What opens it, once drawn. */
  open?: (r: ReturnType<typeof render>) => Promise<void>;
  /** A press beside the card closes it. */
  ground: boolean;
};

const CARDS: Card[] = [
  { file: 'src/components/film/ShareCardModal.tsx', name: 'the Nitrate File', ground: true,
    draw: (close) => <ShareCardModal visible film={FILM} onClose={close} username="kane" memberNo={12} /> },
  { file: 'src/components/profile/WatchlistRoulette.tsx', name: 'the Oracle', ground: true,
    draw: (close) => <WatchlistRoulette visible watchlist={QUEUE} onClose={close} onSelect={jest.fn()} /> },
  { file: 'src/components/profile/WatchlistRoulette.tsx', name: 'the Oracle’s verdict', ground: true,
    draw: (close) => <WatchlistRoulette visible watchlist={QUEUE} onClose={close} onSelect={jest.fn()} />,
    open: async (r) => { await act(async () => { await fireEvent.press(r.getByLabelText('Consult the oracle — pick a film from your watchlist')); }); } },
  { file: 'src/components/InitiationModal.tsx', name: 'the Initiation', ground: false,
    draw: (close) => <InitiationModal visible username="kane" memberNo={12} onComplete={close} /> },
  { file: 'src/components/auth/PasswordRecoveryModal.tsx', name: 'password recovery', ground: true,
    draw: (close) => <PasswordRecoveryModal {...RECOVERY} forgotSent={false} onClose={close} /> },
  { file: 'src/components/auth/PasswordRecoveryModal.tsx', name: 'password recovery, sent', ground: true,
    draw: (close) => <PasswordRecoveryModal {...RECOVERY} forgotSent onClose={close} /> },
  { file: 'src/features/settings/SettingsScreen.tsx', name: 'the security code', ground: false,
    draw: () => <SettingsScreen />,
    open: async (r) => {
      await waitFor(() => expect(r.getByLabelText('DELETE ACCOUNT')).toBeTruthy());
      await act(async () => { await fireEvent.press(r.getByLabelText('DELETE ACCOUNT')); });
      const [, , buttons] = mockAlert.mock.calls[mockAlert.mock.calls.length - 1] as [string, string, { text: string; onPress?: () => Promise<void> }[]];
      await act(async () => { await buttons.find((b) => b.text === 'DELETE')!.onPress!(); });
    } },
];

/** The card drawn and opened: its <Modal>, the one scroll in it, and what lies between them. */
/** The one item a list must hold: a test that finds none, or more, says how many. */
function one<T>(list: readonly T[], what: string): T {
  if (list.length !== 1) throw new Error(`expected one ${what}, found ${list.length}`);
  return list[0] as T;
}
/** The first item of a list that must hold some. */
function firstOf<T>(list: readonly T[], what: string): T {
  if (list.length === 0) throw new Error(`expected a ${what}, found none`);
  return list[0] as T;
}

async function drawn(card: Card, close: () => void) {
  let r!: ReturnType<typeof render>;
  await act(async () => { r = render(card.draw(close)); });
  await card.open?.(r);
  const tree = r.toJSON();
  const modals: J[] = [];
  walk(tree, (n) => { if (n.type === 'Modal') modals.push(n); });
  expect(modals).toHaveLength(1);
  const rooms: { node: J; above: J[] }[] = [];
  const modal = one(modals, '<Modal>');
  walk(modal, (n, above) => { if (n.props.testID === 'centred-card') rooms.push({ node: n, above }); });
  return { r, modal, rooms };
}

afterEach(() => { mockKeyboard = 0; mockInsetBottom = 34; });

it('draws every card at the largest text size', () => {
  let seen = 0;
  const Probe = () => { seen = require('react-native').useWindowDimensions().fontScale; return null; };
  render(<Probe />);
  expect(seen).toBe(LARGEST);
});

describe.each(CARDS.map((c) => [c.name, c] as const))('%s', (_name, card) => {
  it.each([0, 34])('at ×3.1 and a %ipt foot: one scroll fills the overlay, holds every word, and clears both edges', async (b) => {
    mockInsetBottom = b;
    const { r, modal, rooms } = await drawn(card, jest.fn());
    expect(rooms).toHaveLength(1);
    const { node: room, above } = one(rooms, 'centred card');

    // It scrolls, vertically, and a tap on a field or a button lands with the keyboard up.
    expect(room.type).toBe('RCTScrollView');
    expect(room.props.horizontal).toBeFalsy();
    expect(room.props.scrollEnabled).not.toBe(false);
    expect(room.props.keyboardShouldPersistTaps).toBe('handled');

    // It fills the overlay: nothing between it and the <Modal> pads it in, centres it or sizes it.
    expect(StyleSheet.flatten(room.props.style as never)).toMatchObject({ flex: 1, marginBottom: 0 });
    for (const box of above) {
      const st = (StyleSheet.flatten(box.props.style as never) ?? {}) as Record<string, unknown>;
      expect({ at: box.type, paddingTop: st.paddingTop, paddingBottom: st.paddingBottom, height: st.height, padding: st.padding })
        .toEqual({ at: box.type, paddingTop: undefined, paddingBottom: undefined, height: undefined, padding: undefined });
      expect(st.justifyContent).not.toBe('center');
    }

    // Its content grows to the room, centres there, and keeps the same room from both edges.
    const content = StyleSheet.flatten(room.props.contentContainerStyle as never) as Record<string, unknown>;
    const edge = overlayRoomEdge({ top: TOP, bottom: b });
    expect(content).toMatchObject({ flexGrow: 1, justifyContent: 'center', paddingTop: edge, paddingBottom: edge });

    // And every word the <Modal> says is inside it.
    const said = words(modal);
    expect(said.length).toBeGreaterThan(0);
    expect(words(room)).toEqual(said);
    r.unmount();
  });

  it('ends above the keyboard while one is up', async () => {
    mockKeyboard = 336;
    const { r, rooms } = await drawn(card, jest.fn());
    const lift = 336 - overlayRoomKeyboardClearance({ top: TOP, bottom: 34 });
    expect(lift).toBe(277);
    expect(StyleSheet.flatten(one(rooms, 'centred card').node.props.style as never)).toMatchObject({ flex: 1, marginBottom: lift });
    r.unmount();
  });

  it(card.ground ? 'closes on a press beside the card, and never on one inside it' : 'closes only by its own buttons', async () => {
    const close = jest.fn();
    const { r, rooms } = await drawn(card, close);
    // A press on the card's first words reaches only the card.
    const first = firstOf(words(one(rooms, 'centred card').node), 'word on the card');
    await act(async () => { await fireEvent.press(firstOf(r.getAllByText(first, { exact: false, includeHiddenElements: true }), 'match')); });
    expect(close).not.toHaveBeenCalled();
    const ground = r.queryAllByTestId('centred-card-ground', { includeHiddenElements: true });
    expect(ground).toHaveLength(card.ground ? 1 : 0);
    if (card.ground) {
      await act(async () => { await fireEvent.press(one(ground, 'ground')); });
      expect(close).toHaveBeenCalledTimes(1);
    }
    r.unmount();
  });
});

describe('the room’s arithmetic', () => {
  it('is the same above and below: the larger of the overlay’s top and the foot', () => {
    expect(overlayRoomEdge({ top: 59, bottom: 34 })).toBe(69);
    expect(overlayRoomEdge({ top: 0, bottom: 0 })).toBe(30);
    expect(overlayRoomEdge({ top: 24, bottom: 48 })).toBe(58);
  });

  it('a keyboard lifts the card to OVERLAY_GAP above its keys on both platforms', () => {
    // iOS: the keyboard's height runs to the screen's foot, under the home indicator's room.
    const ios = { top: 59, bottom: 34 };
    expect(336 - overlayRoomKeyboardClearance(ios, 'ios') + overlayRoomEdge(ios)).toBe(336 + 10);
    // Android: React Native's height stops at the navigation bar, which the keyboard covers too.
    const android = { top: 24, bottom: 48 };
    expect(280 - overlayRoomKeyboardClearance(android, 'android') + overlayRoomEdge(android)).toBe(280 + 48 + 10);
  });
});

// ── every <Modal>, and what it is ─────────────────────────────────────────────

type Kind = 'centred card' | 'bottom sheet' | 'anchored menu' | 'whole screen';

/**
 * Every <Modal> in app/ and src/, in the order each file draws them. A centred
 * card is drawn in a CentredCard and rendered above; a sheet rises from the foot
 * (its own helpers: everyModalSheetAndOverlayEndsAboveItsFoot); the Concierge's
 * menu hangs under its button; the trailer is the whole screen, its close at the
 * overlay's top (everyModalAndOverlayStartsAtItsTop).
 */
const MODALS: Record<string, Kind[]> = {
  'app/(admin)/tribunal.tsx': ['bottom sheet'],
  'src/components/InitiationModal.tsx': ['centred card'],
  'src/components/ShareToLoungeModal.tsx': ['bottom sheet'],
  'src/components/auth/PasswordRecoveryModal.tsx': ['centred card'],
  'src/components/film/ShareCardModal.tsx': ['centred card'],
  'src/components/film/TrailerModal.tsx': ['whole screen'],
  'src/components/layout/ConciergeButton.tsx': ['anchored menu'],
  'src/components/log/NoteSheet.tsx': ['bottom sheet'],
  'src/components/lounge/ActionSheet.tsx': ['bottom sheet'],
  'src/components/lounge/AtTheDoorPanel.tsx': ['bottom sheet'],
  'src/components/lounge/CreateLoungeSheet.tsx': ['bottom sheet'],
  'src/components/lounge/LoungeSettingsPanel.tsx': ['bottom sheet'],
  'src/components/moderation/ContentActionSheet.tsx': ['bottom sheet'],
  'src/components/moderation/ReportSheet.tsx': ['bottom sheet'],
  'src/components/profile/FollowRequestsPanel.tsx': ['bottom sheet'],
  'src/components/profile/ProfileTriptych.tsx': ['bottom sheet'],
  'src/components/profile/WatchlistRoulette.tsx': ['centred card'],
  'src/features/settings/SettingsScreen.tsx': ['centred card'],
};

const MOBILE = join(__dirname, '..', '..', '..', '..');
const rel = (f: string) => relative(MOBILE, f).replace(/\\/g, '/');

/** Every React Native <Modal> in a file, under any name, and whether it draws a CentredCard. */
export function modalsIn(name: string, src: string): { line: number; card: boolean }[] {
  const sf = ts.createSourceFile(name, src, ts.ScriptTarget.Latest, true, name.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const names = new Set<string>();
  for (const st of sf.statements) {
    if (!ts.isImportDeclaration(st) || st.moduleSpecifier.text !== 'react-native') continue;
    const bindings = st.importClause?.namedBindings;
    if (bindings && ts.isNamedImports(bindings)) {
      for (const el of bindings.elements) if ((el.propertyName ?? el.name).text === 'Modal') names.add(el.name.text);
    }
  }
  const tag = (n: any): string | null => (ts.isJsxElement(n) ? n.openingElement.tagName.getText()
    : ts.isJsxSelfClosingElement(n) ? n.tagName.getText() : null);
  const found: { line: number; card: boolean }[] = [];
  const visit = (n: any, inModal: { card: boolean } | null) => {
    const t = tag(n);
    if (t && names.has(t)) {
      const m = { line: sf.getLineAndCharacterOfPosition(n.getStart()).line + 1, card: false };
      found.push(m);
      ts.forEachChild(n, (c: any) => visit(c, m));
      return;
    }
    if (t === 'CentredCard' && inModal) inModal.card = true;
    ts.forEachChild(n, (c: any) => visit(c, inModal));
  };
  visit(sf, null);
  return found;
}

const FOUND = universe('appCode')
  .flatMap((f) => modalsIn(rel(f), readCode(f)).map((m) => ({ file: rel(f), ...m })));

describe('every <Modal> is named, with its kind', () => {
  it('the scan finds the modals: it is not passing on an empty list', () => {
    expect(FOUND.length).toBeGreaterThanOrEqual(18);
  });

  it('no <Modal> is drawn that is not listed, and none listed is gone', () => {
    const unlisted = FOUND.filter((m) => FOUND.filter((n) => n.file === m.file).indexOf(m) >= (MODALS[m.file]?.length ?? 0))
      .map((m) => `${m.file}:${m.line} draws a <Modal> no one has said the kind of`);
    const gone = Object.entries(MODALS).filter(([file, kinds]) => FOUND.filter((m) => m.file === file).length < kinds.length)
      .map(([file]) => `${file} is listed with a <Modal> it no longer draws`);
    expect([...unlisted, ...gone]).toEqual([]);
  });

  it('every centred card is drawn in a CentredCard, and only a centred card is', () => {
    const wrong = FOUND.filter((m) => (MODALS[m.file]?.[FOUND.filter((n) => n.file === m.file).indexOf(m)] === 'centred card') !== m.card)
      .map((m) => `${m.file}:${m.line} ${m.card ? 'draws a CentredCard but is not listed as a centred card' : 'is a centred card with no CentredCard'}`);
    expect(wrong).toEqual([]);
  });

  it('every centred card is drawn above, at the largest text size', () => {
    const centred = Object.entries(MODALS).filter(([, kinds]) => kinds.includes('centred card')).map(([file]) => file);
    expect(centred.filter((file) => !CARDS.some((c) => c.file === file))).toEqual([]);
  });

  it('the scan can say NO', () => {
    const one = (code: string) => modalsIn('a.tsx', `import { Modal as M, View } from 'react-native';\n${code}`);
    expect(one('export const A = () => <M visible><View /></M>;')).toEqual([{ line: 2, card: false }]);
    expect(one('export const A = () => <M visible><CentredCard><View /></CentredCard></M>;')).toEqual([{ line: 2, card: true }]);
    expect(one('export const A = () => <View><CentredCard><View /></CentredCard></View>;')).toEqual([]);
    expect(modalsIn('b.tsx', 'export const B = () => <Modal visible />;')).toEqual([]);
  });
});
