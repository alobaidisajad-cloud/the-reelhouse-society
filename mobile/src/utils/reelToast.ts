/**
 * reelToast — Cinematic toast notification API.
 *
 * Drop-in replacement for Alert.alert(). Call from anywhere:
 *   reelToast.success('Saved to watchlist ✦')
 *   reelToast.error('Connection failed')
 *
 * This file is the voice only — the haptic and the call. Where a toast waits,
 * for how long, and which host draws it live in toastBus, deliberately apart:
 * dozens of suites mock THIS module, and a host must still work beside them.
 */
import TactileEngine from './TactileEngine';
import { showToast, type ToastPayload } from './toastBus';

export type { ToastType, ToastPayload } from './toastBus';

function emitToast(message: string, type: ToastPayload['type'], action?: ToastPayload['action']) {
  // Route through TactileEngine so the user's tactile setting is respected.
  if (type === 'error') {
    TactileEngine.error();
  } else {
    TactileEngine.success();
  }
  showToast(message, type, action);
}

// ── Public API ──
const reelToast = Object.assign(
  (msg: string) => emitToast(msg, 'info'),
  {
    success: (msg: string, action?: ToastPayload['action']) => emitToast(msg, 'success', action),
    error: (msg: string, action?: ToastPayload['action']) => emitToast(msg, 'error', action),
    info: (msg: string, action?: ToastPayload['action']) => emitToast(msg, 'info', action),
  }
);

export default reelToast;
