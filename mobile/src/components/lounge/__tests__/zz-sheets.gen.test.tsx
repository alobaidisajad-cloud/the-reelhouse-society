/**
 * A GENERATOR, not a test. The three sheets round 14 found cramped or cut, drawn as the phone
 * draws them so CI's layout step judges them at every width and text size (mockups/tools/layout.cjs):
 *
 *   sheet-salon-settings  a salon's settings sheet at the house's longest name (60) and description
 *                         (300): the one place its words are read whole (mockups/shown-whole.txt).
 *   sheet-share-keys      SHARE TO LOUNGE with the keys up, seated in three salons: its title and X
 *                         never above the status bar (OFF), its body scrolls.
 *   sheet-report-keys     the report form with a reason chosen and the keys up: the details field
 *                         never taller than the room its scroll gives it (CUT).
 *
 * Run: MOCKUPS=1 npx jest zz-sheets.gen  (see mockups/README.md)
 */
import React, { act } from 'react';
import { Keyboard } from 'react-native';
import { fireEvent, render } from '@testing-library/react-native';
import { toHtml } from '@/src/components/profile/__tests__/zz-render.lib';
import { LAYOUTS, PHONE, atLayout, whenRendering, writeScreen } from '@/mockups/paths';

jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({
  __esModule: true,
  default: () => ({ ...require('@/mockups/paths').PHONE, scale: 3, fontScale: require('@/mockups/paths').textSize.scale }),
}));
/** The phone's own insets: a home indicator and a notch on a tall phone, a bare status bar on a short one. */
jest.mock('react-native-safe-area-context', () => {
  const mockReact = require('react');
  const { View } = require('react-native');
  const phone = require('@/mockups/paths').PHONE;
  const insets = phone.height < 700 ? { top: 20, bottom: 0, left: 0, right: 0 } : { top: 59, bottom: 34, left: 0, right: 0 };
  return {
    SafeAreaProvider: ({ children, style }: any) => mockReact.createElement(View, { style: [{ flex: 1 }, style] }, children),
    SafeAreaView: ({ children, ...props }: any) => mockReact.createElement(View, props, children),
    useSafeAreaInsets: () => insets,
    useSafeAreaFrame: () => ({ x: 0, y: 0, ...phone }),
  };
});
jest.mock('@shopify/flash-list', () => require('@/mockups/tabs/flashListMock').makeFlashListMock());
// As the real ones draw: the root keeps its style, and a detector draws no view of its own.
jest.mock('react-native-gesture-handler', () => {
  const mockReact = require('react');
  const { View } = require('react-native');
  return {
    GestureHandlerRootView: ({ children, style }: any) => mockReact.createElement(View, { style }, children),
    GestureDetector: ({ children }: any) => children,
    Gesture: { Pan: () => ({ onChange: jest.fn().mockReturnThis(), onEnd: jest.fn().mockReturnThis() }) },
  };
});
jest.mock('expo-blur', () => {
  const mockReact = require('react');
  const { View } = require('react-native');
  return { BlurView: ({ children, ...props }: any) => mockReact.createElement(View, props, children) };
});
jest.mock('@/src/stores/auth', () => {
  const { create: mockCreate } = jest.requireActual('zustand');
  return { useAuthStore: mockCreate(() => ({ user: { id: 'me', username: 'kane', role: 'archivist', tier: 'archivist' }, isAuthenticated: true })) };
});
jest.mock('@/src/stores/reportStore', () => ({
  useReportStore: (sel: (s: unknown) => unknown) => sel({ submitReport: jest.fn(), isSubmitting: false }),
}));
jest.mock('@/src/utils/typedRouter', () => ({ nav: { push: jest.fn(), dismissTo: jest.fn(), back: jest.fn() } }));

// eslint-disable-next-line import/first
import { LoungeSettingsPanel } from '../LoungeSettingsPanel';
// eslint-disable-next-line import/first
import ShareToLoungeModal from '@/src/components/ShareToLoungeModal';
// eslint-disable-next-line import/first
import ReportSheet from '@/src/components/moderation/ReportSheet';
// eslint-disable-next-line import/first
import { useLoungeStore } from '@/src/stores/lounge';

// The house's longest: a name of sixty, a description of three hundred.
const NAME = 'The Society for the Appreciation of Lost Nitrate Melodramas!';
const DESCRIPTION = ('We gather on Sunday evenings to watch the pictures the studios let rot: two-reelers, serials, '
  + 'the lost Murnau fragments, and whatever the archives have found this season. Bring a programme '
  + 'note, a sharp eye and patience for a scratched print; leave the phone in the cloakroom. Seats go to '
  + 'whoever comes, and the kettle is always on.').slice(0, 300);

const room = (id: string, name: string) => ({
  id, name, description: null, is_private: false, creator_id: 'host', created_at: '2026-01-01T00:00:00Z',
  member_count: 4, membership_status: 'approved', mine: true, unread_count: 0,
});

/** The keys the phone shows: a tall phone's, a short one's, an iPad's with its prediction bar. */
const KEYS = PHONE.width >= 700 ? 400 : PHONE.height < 700 ? 260 : 336;

/** Draws `ui`, raises the keys when asked, and returns the html, at one layout. */
async function draw(ui: React.ReactElement, then?: (r: ReturnType<typeof render>) => Promise<void>, keys = false) {
  const listeners: Record<string, ((e: unknown) => void)[]> = {};
  const spy = jest.spyOn(Keyboard, 'addListener').mockImplementation(((ev: string, fn: (e: unknown) => void) => {
    (listeners[ev] ??= []).push(fn);
    return { remove: () => {} };
  }) as never);
  let r!: ReturnType<typeof render>;
  await act(async () => { r = render(ui); await new Promise((res) => setTimeout(res, 0)); });
  if (then) await then(r);
  if (keys) {
    await act(async () => {
      for (const ev of ['keyboardWillShow', 'keyboardDidShow']) {
        (listeners[ev] ?? []).forEach((fn) => fn({ duration: 250, endCoordinates: { height: KEYS, screenY: 0, screenX: 0, width: 0 } }));
      }
    });
    // The jest Reanimated draws a style as it renders (a new element, or React keeps the old drawing).
    await act(async () => { r.rerender(React.cloneElement(ui)); });
  }
  const out = toHtml(r.toJSON());
  await r.unmount();
  spy.mockRestore();
  return out;
}

const STATES: [string, () => Promise<string>][] = [
  ['sheet-salon-settings', () => draw(
    <LoungeSettingsPanel lounge={{ id: 'l1', name: NAME, description: DESCRIPTION, creator_id: 'host', is_private: false, cover_image: null, member_count: 12 } as never}
      members={[]} visible isCreator={false} standing="approved" onClose={() => {}} />,
  )],
  ['sheet-share-keys', () => {
    useLoungeStore.setState({
      lounges: [room('a', 'The Back Row'), room('b', 'Nitrate Club'), room('c', 'Silents Only')],
      loungesFailed: false, loungesLoading: false, loungesRead: true, fetchLounges: async () => {},
    } as never);
    return draw(<ShareToLoungeModal visible onClose={() => {}} filmTitle="Sunrise: A Song of Two Humans" filmId={631} posterPath={null} />,
      async (r) => { await act(async () => { await fireEvent(r.getByLabelText('Share message'), 'focus'); }); }, true);
  }],
  ['sheet-report-keys', () => draw(
    <ReportSheet visible contentType="log" contentId="c" targetUserId="t" targetUsername="cinephile42" onDismiss={() => {}} />,
    async (r) => {
      await act(async () => { await fireEvent.press(r.getAllByRole('radio')[2]!); });
      await act(async () => { await fireEvent(r.getByLabelText('Additional details'), 'focus'); });
    }, true,
  )],
];

const RUNS = STATES.flatMap(([name, make]) => LAYOUTS.map((l) => [`${name}${l.suffix}`, make, l] as const));

whenRendering('round 14 sheets generator', () => {
  it.each(RUNS)('writes %s', async (name, make, layout) => {
    const html = await atLayout(layout, make);
    writeScreen(name, html);
    // Each sheet was drawn with its words: one that drew nothing proves nothing.
    expect(html.length).toBeGreaterThan(2000);
    expect(/Society for the Appreciation|Share to Lounge|REPORT TO THE TRIBUNAL/.test(html)).toBe(true);
  });
});
