/**
 * reelToast — Cinematic toast notification API.
 * 
 * Drop-in replacement for Alert.alert(). Call from anywhere:
 *   reelToast.success('Saved to watchlist ✦')
 *   reelToast.error('Connection failed')
 */
import * as Haptics from 'expo-haptics';

// ── Global toast state (singleton pattern) ──
export type ToastType = 'success' | 'error' | 'info';
export interface ToastPayload {
  message: string;
  type: ToastType;
  id: number;
}

let _toastId = 0;
let _listener: ((payload: ToastPayload) => void) | null = null;

export function setToastListener(fn: ((payload: ToastPayload) => void) | null) {
  _listener = fn;
}

function emitToast(message: string, type: ToastType) {
  _toastId++;
  if (type === 'error') {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
  } else {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  }
  _listener?.({ message, type, id: _toastId });
}

// ── Public API ──
const reelToast = Object.assign(
  (msg: string) => emitToast(msg, 'info'),
  {
    success: (msg: string) => emitToast(msg, 'success'),
    error: (msg: string) => emitToast(msg, 'error'),
    info: (msg: string) => emitToast(msg, 'info'),
  }
);

export default reelToast;
