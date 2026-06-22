/**
 * reelToast — Cinematic toast notification API.
 * 
 * Drop-in replacement for Alert.alert(). Call from anywhere:
 *   reelToast.success('Saved to watchlist ✦')
 *   reelToast.error('Connection failed')
 */
import TactileEngine from './TactileEngine';

// ── Global toast state (singleton pattern) ──
export type ToastType = 'success' | 'error' | 'info';
export interface ToastPayload {
  message: string;
  type: ToastType;
  id: number;
  action?: {
    label: string;
    onPress: () => void;
  };
}

let _toastId = 0;
const _listeners = new Set<(payload: ToastPayload) => void>();

export function setToastListener(fn: (payload: ToastPayload) => void) {
  _listeners.add(fn);
  return () => {
    _listeners.delete(fn);
  };
}

function emitToast(message: string, type: ToastType, action?: ToastPayload['action']) {
  _toastId++;
  // Route through TactileEngine so the user's tactile setting is respected.
  if (type === 'error') {
    TactileEngine.error();
  } else {
    TactileEngine.success();
  }
  _listeners.forEach(fn => fn({ message, type, id: _toastId, action }));
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
