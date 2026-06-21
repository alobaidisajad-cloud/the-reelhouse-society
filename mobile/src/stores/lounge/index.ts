/**
 * Barrel re-export for backward compatibility.
 * 
 * All consumers importing from '@/src/stores/lounge' continue to work.
 * Types are extracted to loungeTypes.ts for cleaner architecture.
 */
export { useLoungeStore } from '../lounge';
export type { LoungeRoom, LoungeMessage, LoungeState, RawLoungePayload } from './loungeTypes';
export {
  CREATE_COOLDOWN,
  MAX_RECONNECT_ATTEMPTS,
  RECONNECT_BASE_MS,
  RECONNECT_MAX_MS,
  MESSAGE_DEDUP_CAP,
  MESSAGE_DEDUP_RETAIN,
} from './loungeTypes';
