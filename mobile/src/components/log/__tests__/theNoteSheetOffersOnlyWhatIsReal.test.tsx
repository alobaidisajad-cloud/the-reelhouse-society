/**
 * Opening a note, and taking it back.
 *
 * The sheet offers only what the server will honour: EDIT on the viewing the
 * log is on now, for a member who holds the rank; REMOVE always, because taking
 * your own writing back is never gated. Removing asks first, says exactly what
 * is lost — the note, not the viewing — and says one true thing afterwards.
 */
import React from 'react';
import { Alert } from 'react-native';
import { act, fireEvent, render, renderHook } from '@testing-library/react-native';
// Loaded under the mocks below: jest hoists every jest.mock above the imports.
import NoteSheet from '../NoteSheet';
import { useVault } from '@/src/hooks/useVault';

jest.mock('react-native-reanimated', () => {
  const React = require('react');
  const { View } = require('react-native');
  const animated = (C: any) => React.forwardRef((p: any, ref: any) => React.createElement(C, { ...p, ref }));
  return {
    __esModule: true,
    default: { View: animated(View), createAnimatedComponent: animated },
    createAnimatedComponent: animated,
    useSharedValue: (v: any) => ({ value: v }),
    useAnimatedStyle: (fn: any) => fn(),
    withTiming: (v: any, _o?: any, cb?: any) => { if (cb) cb(true); return v; },
    runOnJS: (fn: any) => fn,
    Easing: { out: () => 'e', cubic: 'c' },
  };
});
jest.mock('react-native-gesture-handler', () => {
  const React = require('react');
  const { View } = require('react-native');
  const pan: any = { onChange: () => pan, onEnd: () => pan };
  return {
    GestureHandlerRootView: ({ children }: any) => React.createElement(View, null, children),
    GestureDetector: ({ children }: any) => React.createElement(View, null, children),
    Gesture: { Pan: () => pan },
  };
});
jest.mock('expo-blur', () => {
  const React = require('react');
  const { View } = require('react-native');
  return { BlurView: ({ children }: any) => React.createElement(View, null, children) };
});

// Built inside the factory: jest hoists it above every declaration here, so a
// toast defined out here would not exist yet when the hook's module loads.
jest.mock('@/src/utils/reelToast', () => ({
  __esModule: true,
  default: Object.assign(jest.fn(), { error: jest.fn(), success: jest.fn() }),
}));
const mockToast = require('@/src/utils/reelToast').default as jest.Mock & { error: jest.Mock };

const mockDrop = jest.fn();
const mockLoad = jest.fn().mockResolvedValue(undefined);
jest.mock('@/src/stores/vaultStore', () => {
  const state = {
    notes: { 'v-now': 'about tonight', 'v-then': 'about that night' } as Record<string, string>,
    loaded: {} as Record<string, true>,
    unreachable: {} as Record<string, true>,
    loadForLog: (...a: unknown[]) => mockLoad(...a),
    dropNote: (...a: unknown[]) => mockDrop(...a),
  };
  return { useVaultStore: (sel: (s: typeof state) => unknown) => sel(state) };
});

const LOG = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

beforeEach(() => jest.clearAllMocks());

describe('the sheet', () => {
  const sheet = (canEdit: boolean) => {
    const onEdit = jest.fn();
    const onRemove = jest.fn();
    const r = render(
      <NoteSheet visible note="about tonight" viewingLabel="◆ CURRENT" canEdit={canEdit} onClose={jest.fn()} onEdit={onEdit} onRemove={onRemove} />,
    );
    return { r, onEdit, onRemove };
  };

  it('shows the whole note, and which viewing it belongs to', () => {
    const { r } = sheet(true);
    expect(r.getByText('about tonight')).toBeTruthy();
    expect(r.getByText('◆ CURRENT')).toBeTruthy();
  });

  it('offers EDIT only where editing is real', () => {
    expect(sheet(true).r.queryByLabelText('Edit this note')).toBeTruthy();
    // A past viewing, or a member whose rank has ended: nothing offered that
    // the database would then refuse.
    expect(sheet(false).r.queryByLabelText('Edit this note')).toBeNull();
  });

  it('always offers REMOVE — taking your own writing back is never gated', async () => {
    const { r, onRemove } = sheet(false);
    await fireEvent.press(r.getByLabelText('Remove this note'));
    expect(onRemove).toHaveBeenCalledTimes(1);
  });

  it('REMOVE says what stays and what goes, before anything happens', () => {
    const { r } = sheet(false);
    expect(r.getByLabelText('Remove this note').props.accessibilityHint)
      .toBe('The viewing stays. The note is gone for good.');
  });
});

describe('removing, through the page', () => {
  const alertSpy = () => jest.spyOn(Alert, 'alert');

  it('opens the Vault only for the owner — a visitor’s device never asks', async () => {
    await renderHook(() => useVault(LOG, false));
    expect(mockLoad).not.toHaveBeenCalled();
    await renderHook(() => useVault(LOG, true));
    expect(mockLoad).toHaveBeenCalledWith(LOG);
  });

  it('asks first, and Keep keeps it', async () => {
    const spy = alertSpy();
    const { result } = await renderHook(() => useVault(LOG, true));
    await act(async () => result.current.openNote('v-now', '◆ CURRENT', true));
    await act(async () => result.current.confirmRemove());
    expect(spy).toHaveBeenCalledWith('Remove this note?', 'The viewing stays. The note is gone for good.', expect.any(Array), expect.anything());
    const buttons = spy.mock.calls[0][2] as { text: string; style?: string; onPress?: () => void }[];
    expect(buttons.map(b => b.text)).toEqual(['Keep', 'Remove']);
    expect(buttons[0].style).toBe('cancel');
    expect(mockDrop).not.toHaveBeenCalled();
  });

  it('Remove takes back that viewing’s note — and only that one', async () => {
    const spy = alertSpy();
    mockDrop.mockResolvedValueOnce({ queuedOffline: false });
    const { result } = await renderHook(() => useVault(LOG, true));
    await act(async () => result.current.openNote('v-then', 'VIEWING 2', false));
    await act(async () => result.current.confirmRemove());
    const remove = (spy.mock.calls[0][2] as any[]).find(b => b.text === 'Remove');
    await act(async () => { remove.onPress(); });
    expect(mockDrop).toHaveBeenCalledWith(LOG, 'v-then');
    expect(mockToast).toHaveBeenCalledWith('Note removed.');
    // The sheet closes; there is nothing left in it to show.
    expect(result.current.openedNote).toBeNull();
  });

  it('with no signal, says it will sync — not that it is done', async () => {
    const spy = alertSpy();
    mockDrop.mockResolvedValueOnce({ queuedOffline: true });
    const { result } = await renderHook(() => useVault(LOG, true));
    await act(async () => result.current.openNote('v-now', '◆ CURRENT', true));
    await act(async () => result.current.confirmRemove());
    const remove = (spy.mock.calls[0][2] as any[]).find(b => b.text === 'Remove');
    await act(async () => { remove.onPress(); });
    expect(mockToast).toHaveBeenCalledWith('Note removed. Will sync when connected.');
  });

  it('a failure is said once, as a failure', async () => {
    const spy = alertSpy();
    mockDrop.mockRejectedValueOnce(new Error('no'));
    const { result } = await renderHook(() => useVault(LOG, true));
    await act(async () => result.current.openNote('v-now', '◆ CURRENT', true));
    await act(async () => result.current.confirmRemove());
    const remove = (spy.mock.calls[0][2] as any[]).find(b => b.text === 'Remove');
    await act(async () => { remove.onPress(); });
    expect(mockToast.error).toHaveBeenCalledWith('The note could not be removed. Try again.');
    expect(mockToast).not.toHaveBeenCalled();
  });

  it('reads each viewing’s note by its own name', async () => {
    const { result } = await renderHook(() => useVault(LOG, true));
    expect(result.current.noteFor('v-then')).toBe('about that night');
    expect(result.current.noteFor(null)).toBe('');
    expect(result.current.noteFor('nobody')).toBe('');
  });
});
