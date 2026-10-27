/**
 * bootStore — a small plain store of the install's own, opened before the member's store and read
 * synchronously at launch. It holds marks about this phone, never the member: that the member's
 * store was encrypted here (mmkv-storage's restore check), and whether crash reports are shared
 * (sentry.ts, read before Sentry starts).
 */
import { MMKV } from 'react-native-mmkv';

export const BOOT_ID = 'reelhouse-boot';

let store: MMKV | null = null;

export const bootStore = (): MMKV => (store ??= new MMKV({ id: BOOT_ID }));
