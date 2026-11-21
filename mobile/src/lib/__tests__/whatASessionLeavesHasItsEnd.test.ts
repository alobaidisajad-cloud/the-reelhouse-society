/**
 * What a session leaves on the phone has its end (the kinds pass, kind 15: what a session leaves when
 * it ends).
 * ─────────────────────────────────────────────────────────────────────────────
 * A signed-out phone was still pushed (round 13), its delivered notices stayed on the lock screen, and
 * closing an account erased another member's kept work on a shared iPad: each found alone, because
 * nothing listed what a member leaves on a phone. Here every key the app writes to the phone's
 * storage (storage.set, setSensitive, kv.set, SecureStore, AsyncStorage, a persisted store's name),
 * read from every file of the app (universe appCode), is in the inventory below by its file and key:
 * the phone's own (no member in it), or the member's, with where each way a session ends takes it,
 * so a new key is judged before it ships. A member's thing is taken at their sign-out (auth.ts
 * signOut), kept apart from the next member (a key that names its member, a read that checks whose it
 * is, or its taking at a switch), and erased with a closed account (eraseAllButOthers keeps only what
 * names another member). The things a session leaves beside the phone's storage (the push token at
 * the house, the delivered notices, the error reporter's member, the session) are listed with theirs.
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import { files, rel } from '@/test-utils/universe';
import { stripComments } from '@/test-utils/readCode';

/**
 * Each write of a key to the phone's storage, as "file: key", the key as written (a template's text
 * to its first ${): a write by storage.set, setSensitive, kv.set, SecureStore or AsyncStorage, and a
 * persisted store's name in a file that persists one (zustand's persist).
 */
export function keysWritten(sources: { file: string; text: string }[]): Set<string> {
  const out = new Set<string>();
  const WRITE = /\b(?:storage|kv|SecureStore|AsyncStorage)\s*\.\s*(?:set|setItem|setItemAsync|setString)\s*\(\s*([^,)]+)|\bsetSensitive\s*\(\s*([^,)]+)/g;
  for (const { file, text } of sources) {
    for (const m of text.matchAll(WRITE)) out.add(`${file}: ${(m[1] ?? m[2] ?? '').trim().replace(/\$\{[\s\S]*$/, '${')}`);
    if (/\bpersist\s*\(/.test(text)) for (const m of text.matchAll(/^\s*name\s*:\s*([^,\n}]+?),?\s*$/gm)) out.add(`${file}: ${m[1]!.trim()}`);
  }
  return out;
}

/** Where a way a session ends takes a thing: a file and words of its code there, or why nothing need. */
type End = { in: string; by: string } | string;
type Kept = { what: string } & ({ phone: string } | { signOut: End; apart: End; closed: End });

const ERASED: End = { in: 'src/utils/othersKeptHere.ts', by: 'storage.delete(key)' };
const KEYED = 'its key names the member: another member reads only their own';
const PROFILE_GONE: End = { in: 'src/stores/auth.ts', by: 'storage.delete(`ironvault_user_cache_${previousUserId}`)' };

/** The keys the app writes, by file and key as written, and what each is. */
const INVENTORY: Record<string, Kept> = {
  "src/components/Preloader.tsx: 'reelhouse_has_launched'": { what: 'the phone has launched the app once', phone: 'names no member' },
  'src/utils/lastTab.ts: LAST_TAB_KEY': { what: 'the tab the app last showed', phone: 'names a screen, never a member or their words' },
  'src/utils/lastRoom.ts: LAST_ROOM_KEY': { what: 'the room the app last showed', phone: 'names a screen, never a member or their words' },
  'src/utils/requestReview.ts: MMKV_KEY': { what: 'when the store review was last asked', phone: 'names no member' },
  'src/utils/requestReview.ts: MMKV_COUNT_KEY': { what: 'how often the store review was asked', phone: 'names no member' },
  'src/lib/pushPrimer.ts: PRIMER_ASKED_KEY': { what: 'when the phone was asked to allow notices', phone: 'the permission is the phone\'s' },
  'src/hooks/useAuthThrottle.ts: STORAGE_KEY': { what: 'the sign-in attempts held back on this phone', phone: 'the phone\'s, before anyone is signed in' },
  'src/stores/mmkv-storage.ts: KEY_NAME': { what: 'the phone\'s key to its encrypted store', phone: 'the store\'s own, under which every member\'s things are kept' },
  'src/stores/mmkv-storage.ts: key': { what: 'the shared writer (setSensitive): each key it writes is listed by its caller', phone: 'a writer, not a key' },
  'src/stores/mmkv-storage.ts: key: string': { what: 'the shared writer\'s own signature', phone: 'a writer, not a key' },
  'src/stores/mmkv-storage.ts: name': { what: 'the persisted stores\' storage: each store is listed by its name', phone: 'a writer, not a key' },
  'app/(tabs)/darkroom.tsx: cacheKey': { what: 'the Darkroom\'s last sheet of films for some words', phone: 'films from the catalogue, never a member or their words' },
  'src/lib/endSession.ts: OWED_KEY': { what: 'what an ended session still owes the house (its refresh token, its push token)', phone: 'kept past its session by design, until the house has forgotten that session (settleOwedSignOut erases it)' },
  'src/lib/endSession.ts: OTHERS_OWED_KEY': { what: 'a forget of the member\'s other phones still owed', phone: 'kept past its session by design, let go once that member is no longer signed in here (settleOwedOthers)' },
  "src/stores/settings.ts: 'reelhouse-settings'": { what: 'the phone\'s sound and touch settings (persisted store)', phone: 'a setting of the phone\'s feel, set back to its start at a sign-out (settings.ts)' },

  'src/stores/blockStore.ts: MMKV_KEY(userId': { what: 'the member\'s blocks and mutes, for the hiding before the house answers', signOut: { in: 'src/stores/blockStore.ts', by: 'clearOnLogout(previousUserId)' }, apart: KEYED, closed: ERASED },
  'src/features/archive/undoImport.ts: RECEIPT_KEY': { what: 'the member\'s last import, the rows it made, for UNDO', signOut: { in: 'src/stores/auth.ts', by: 'clearReceipt();' }, apart: { in: 'src/features/archive/undoImport.ts', by: 'parseReceipt(JSON.parse(raw), userId)' }, closed: ERASED },
  "app/auth-callback.tsx: 'recovery_pending'": { what: 'a password reset begun by a link', signOut: { in: 'src/stores/auth.ts', by: "storage.delete('recovery_pending')" }, apart: { in: 'src/stores/auth.ts', by: "storage.delete('recovery_pending')" }, closed: ERASED },
  "src/stores/auth.ts: 'last_user_id'": { what: 'who was signed in last, to tell a switch', signOut: { in: 'src/stores/auth.ts', by: "storage.delete('last_user_id')" }, apart: 'written over by the next member, which is how the switch is told', closed: ERASED },
  'src/lib/queryClient.ts: CACHE_KEY': { what: 'the read cache of the house\'s answers', signOut: { in: 'src/stores/auth.ts', by: 'forgetCache();' }, apart: { in: 'src/stores/auth.ts', by: 'forgetCache();' }, closed: ERASED },
  'src/hooks/useUpdateUser.ts: CACHE_KEYS.USER(updatedUser.id': { what: 'the member\'s own profile, kept for a launch without the network', signOut: PROFILE_GONE, apart: KEYED, closed: ERASED },
  'src/hooks/useUpdateUser.ts: CACHE_KEYS.USER(reverted.id': { what: 'as above, put back after a refused change', signOut: PROFILE_GONE, apart: KEYED, closed: ERASED },
  'src/hooks/useEditProfile.ts: `ironvault_user_cache_${': { what: 'as above, as the member amends it', signOut: PROFILE_GONE, apart: KEYED, closed: ERASED },
  'src/stores/auth.ts: `ironvault_user_cache_${': { what: 'as above', signOut: PROFILE_GONE, apart: KEYED, closed: ERASED },
  'src/stores/auth.ts: `dirty_prefs_${': { what: 'the member\'s preferences not yet saved at the house', signOut: { in: 'src/stores/auth.ts', by: 'dirty_prefs_' }, apart: KEYED, closed: ERASED },
  'src/stores/auth.ts: `dirty_profile_${': { what: 'the member\'s profile change not yet saved at the house', signOut: { in: 'src/stores/auth.ts', by: 'dirty_profile_' }, apart: KEYED, closed: ERASED },
  'src/stores/followStore.ts: `reelhouse_following_${': { what: 'whom the member follows', signOut: { in: 'src/stores/followStore.ts', by: 'registerStoreReset((previousUserId)' }, apart: KEYED, closed: ERASED },
  'src/stores/followStore.ts: `reelhouse_requested_${': { what: 'whom the member asked to follow', signOut: { in: 'src/stores/followStore.ts', by: 'registerStoreReset((previousUserId)' }, apart: KEYED, closed: ERASED },
  'src/utils/profileCountsCache.ts: `${': { what: 'the member\'s profile counts', signOut: { in: 'src/utils/profileCountsCache.ts', by: 'registerStoreReset((previousUserId)' }, apart: KEYED, closed: ERASED },
  'src/utils/handleHistory.ts: KEY': { what: 'the member\'s old handles', signOut: { in: 'src/stores/auth.ts', by: 'clearHandleHistory();' }, apart: { in: 'src/stores/auth.ts', by: 'clearHandleHistory();' }, closed: ERASED },
  'src/utils/handleNotice.ts: KEY': { what: 'the handle the member asked for', signOut: { in: 'src/stores/auth.ts', by: 'clearRequestedHandle();' }, apart: { in: 'src/stores/auth.ts', by: 'clearRequestedHandle();' }, closed: ERASED },
  'src/utils/memberDrafts.ts: draftKey(userId': { what: 'the member\'s unfinished writing', signOut: { in: 'src/stores/auth.ts', by: 'clearAllDrafts(previousUserId)' }, apart: KEYED, closed: ERASED },
  'src/hooks/useInitiation.ts: flagKey(id': { what: 'that the member was shown the Initiation', signOut: 'a mark that holds no words, kept for their next sign-in here so they are not initiated twice', apart: KEYED, closed: ERASED },
  'src/utils/keptPages.ts: keyOf(kind': { what: 'the pages the member kept to read without the network', signOut: { in: 'src/stores/auth.ts', by: 'keptAfterSignOutElsewhere' }, apart: KEYED, closed: ERASED },
  'src/utils/queueOwnership.ts: QUEUE_KEY': { what: 'the member\'s writes waiting for the network', signOut: { in: 'src/stores/auth.ts', by: 'clearOfflineQueue(previousUserId)' }, apart: { in: 'src/utils/queueOwnership.ts', by: 'QUEUE_KEY' }, closed: ERASED },
  'src/utils/queueOwnership.ts: key': { what: 'the queue\'s writes under their owner', signOut: { in: 'src/stores/auth.ts', by: 'clearOfflineQueue(previousUserId)' }, apart: { in: 'src/utils/queueOwnership.ts', by: 'QUEUE_KEY' }, closed: ERASED },
  'src/lib/authSessionStorage.ts: key': { what: 'the member\'s session (supabase-js\'s own key)', signOut: { in: 'src/lib/endSession.ts', by: 'authSessionStorage.removeItem(key)' }, apart: 'one session at a time: a sign-in writes its own over it', closed: { in: 'src/lib/endSession.ts', by: 'authSessionStorage.removeItem(key)' } },
  'src/lib/pushNotifications.ts: PUSH_TOKEN_KEY': { what: 'this phone\'s push token, as registered for the member', signOut: { in: 'src/lib/pushNotifications.ts', by: 'storage.delete(PUSH_TOKEN_KEY)' }, apart: { in: 'src/lib/endSession.ts', by: 'tokenRegisteredAgain' }, closed: ERASED },
  'src/lib/pushNotifications.ts: PUSH_REGISTERED_AT_KEY': { what: 'when this phone\'s token was registered', signOut: { in: 'src/lib/pushNotifications.ts', by: 'storage.delete(PUSH_REGISTERED_AT_KEY)' }, apart: 'written again at the next member\'s registration', closed: ERASED },
  'src/stores/vaultStore.ts: STORAGE_KEY': { what: 'the member\'s Vault (persisted store)', signOut: { in: 'src/stores/vaultStore.ts', by: 'zustandMMKVStorageSensitive.removeItem(STORAGE_KEY)' }, apart: { in: 'src/stores/vaultStore.ts', by: 'registerStoreReset' }, closed: ERASED },
  "src/stores/notificationStore.ts: 'reelhouse-notifications'": { what: 'the member\'s notices (persisted store)', signOut: { in: 'src/stores/notificationStore.ts', by: 'useNotificationStore.setState(noticesAtStart())' }, apart: { in: 'src/stores/notificationStore.ts', by: 'registerStoreReset' }, closed: ERASED },
  "src/stores/films.ts: 'reelhouse-films'": { what: 'the member\'s records and stacks as last read (persisted store)', signOut: { in: 'src/stores/films.ts', by: 'registerStoreReset' }, apart: { in: 'src/stores/films.ts', by: 'registerStoreReset' }, closed: ERASED },
  "src/stores/discover.ts: 'reelhouse-discover'": { what: 'the Darkroom\'s last words and filters (persisted store)', signOut: { in: 'src/stores/discover.ts', by: 'forgetKeptSheets()' }, apart: { in: 'src/stores/discover.ts', by: 'registerStoreReset' }, closed: ERASED },
};

/** What a session leaves beside the phone's storage, and where each way it ends takes it. */
const BESIDE: Record<string, { signOut: End; elsewhere: End }> = {
  'the push token at the house': { signOut: { in: 'src/stores/auth.ts', by: 'removePushToken' }, elsewhere: { in: 'src/lib/endSession.ts', by: "supabase.rpc('forget_other_devices'" } },
  'the notices delivered to the lock screen, and the badge': { signOut: { in: 'src/lib/pushNotifications.ts', by: 'dismissAllNotificationsAsync' }, elsewhere: { in: 'src/stores/auth.ts', by: 'clearDeliveredNotices' } },
  'the error reporter\'s member': { signOut: { in: 'src/stores/auth.ts', by: 'setSentryUser(null)' }, elsewhere: { in: 'src/lib/sentry.ts', by: 'Sentry.setUser(null)' } },
  'the supabase session': { signOut: { in: 'src/lib/endSession.ts', by: "signOut({ scope: 'local' })" }, elsewhere: { in: 'src/lib/endSession.ts', by: "signOut({ scope: 'others' })" } },
};

const MOBILE = join(__dirname, '..', '..', '..');
const code = (path: string) => stripComments(readFileSync(join(MOBILE, path), 'utf8'), path);
const ended = (end: End) => typeof end === 'string' || code(end.in).includes(end.by);

describe('the rules, on planted text', () => {
  it('read a key as written: a literal, a constant, a call, a template to its first ${, and a persisted store\'s name', () => {
    const found = keysWritten([{ file: 'a.ts', text: "storage.set('plain', v); setSensitive(KEY, v); kv.set(keyOf(kind, id), v); storage.set(`member_${id}_x`, v);\ncreate(persist((set) => ({}), {\n  name: 'reelhouse-x',\n  storage,\n}));" }]);
    expect([...found].sort()).toEqual(["a.ts: 'plain'", "a.ts: 'reelhouse-x'", 'a.ts: KEY', 'a.ts: `member_${', 'a.ts: keyOf(kind']);
  });

  it('say no to a new key written with no entry, and to an end its file does not hold', () => {
    const found = keysWritten([{ file: 'src/stores/auth.ts', text: "storage.set('a_new_members_secret', v);" }]);
    expect([...found].filter((k) => !(k in INVENTORY))).toEqual(["src/stores/auth.ts: 'a_new_members_secret'"]);
    expect(ended({ in: 'src/stores/auth.ts', by: 'words no file holds' })).toBe(false);
    expect(ended({ in: 'src/stores/auth.ts', by: 'clearReceipt();' })).toBe(true);
  });
});

describe('every key the app writes to the phone', () => {
  const sources = files('appCode').map((f) => ({ file: rel(f), text: stripComments(readFileSync(f, 'utf8'), f) }));
  const found = keysWritten(sources);

  it('reads the app\'s writes, the persisted stores among them', () => {
    expect(found.size).toBeGreaterThan(30);
    for (const k of ['src/stores/vaultStore.ts: STORAGE_KEY', 'src/lib/pushNotifications.ts: PUSH_TOKEN_KEY', 'src/utils/memberDrafts.ts: draftKey(userId']) expect(found.has(k)).toBe(true);
  });

  it('is in the inventory, and no entry stands for a key no longer written', () => {
    expect({ unlisted: [...found].filter((k) => !(k in INVENTORY)), stale: Object.keys(INVENTORY).filter((k) => !found.has(k)) })
      .toEqual({ unlisted: [], stale: [] });
  });

  it('a member\'s is taken at their sign-out, kept apart from the next member and erased with a closed account, each where its entry says', () => {
    const unended = Object.entries(INVENTORY).flatMap(([k, v]) => ('phone' in v ? [] : (['signOut', 'apart', 'closed'] as const)
      .filter((way) => !ended(v[way])).map((way) => `${k}: ${way}`)));
    expect(unended).toEqual([]);
  });

  it('what a session leaves beside the phone\'s storage is taken at a sign-out here and at one elsewhere', () => {
    const unended = Object.entries(BESIDE).flatMap(([k, v]) => (['signOut', 'elsewhere'] as const).filter((way) => !ended(v[way])).map((way) => `${k}: ${way}`));
    expect(unended).toEqual([]);
  });
});
