/**
 * Everything the app saves as JSON opens whole after an update (P4.11).
 *
 * The saved stores are versioned (savedStoresAreVersioned) and the query cache is the build's
 * own (queryClient.test); the rest of what the phone keeps is JSON under a key: the cached
 * member, edits not yet sent, the offline queue, the drafts, the caches. Nothing named the shape
 * any of them was written in, so an update that changed one would read the last release's as its
 * own: a draft opened empty, a queued critique dropped as malformed.
 *
 * A finder over every `storage.set` / `setSensitive` of JSON, read from the syntax tree, holds
 * each to a family below; a write in no family fails, and so does a family whose writer is gone.
 * Each family has a fixture of what TestFlight build 41 (ae569c0f, in members' hands) saved
 * (fixtures/saved-json/<family>.json; a key new since then holds this build's shape), and is
 * opened here by its own reader, or by the test named, which reads the same fixture. A change to
 * a family's shape fails its test: the reader then learns the old shape, or the change is undone.
 */
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import ts from 'typescript';
import { act, renderHook } from '@testing-library/react-native';
import { files, rel } from '@/test-utils/universe';
import { storage } from '@/src/stores/mmkv-storage';
import { readPendingPrefs, readPendingProfile, useAuthStore } from '@/src/stores/auth';
import { loadReceipt } from '@/src/features/archive/undoImport';
import { useAuthThrottle } from '@/src/hooks/useAuthThrottle';
import { __owedForTests } from '@/src/lib/endSession';
import { useBlockStore } from '@/src/stores/blockStore';
import { useSocialStore } from '@/src/stores/followStore';
import { wasMyHandle } from '@/src/utils/handleHistory';
import { readRequestedHandle } from '@/src/utils/handleNotice';
import { tabToReopen } from '@/src/utils/lastTab';
import { readCachedCounts } from '@/src/utils/profileCountsCache';
import { readDraft, type DraftKind } from '@/src/utils/memberDrafts';
import { DEAD_LETTER_KEY, __resetStampForTests, readList, readQueue, releaseHeldWrites, stampOwnerlessWrites } from '@/src/utils/queueOwnership';
import { MutationSchemaMap } from '@/src/types/mutations';
import { flushOfflineQueue } from '@/src/utils/offlineQueue';
import { supabase } from '@/src/lib/supabase';

const ROOT = join(__dirname, '..', '..', '..');
const FIXTURES = join(__dirname, 'fixtures', 'saved-json');
const HERE = 'src/utils/__tests__/savedJsonOpensWhole.guard.test.ts';

type Fixture = { written: string; now?: number; saved: Record<string, unknown> };
const fixture = (family: string): Fixture => JSON.parse(readFileSync(join(FIXTURES, `${family}.json`), 'utf8'));
/** The family's keys written as the phone holds them. */
const put = (family: string): Fixture => {
  const f = fixture(family);
  for (const [key, value] of Object.entries(f.saved)) storage.set(key, typeof value === 'string' ? value : JSON.stringify(value));
  return f;
};
const M = '77777777-7777-4777-8777-777777777777';

/** A member's cached copy, by any of the ways its key is written. */
const MEMBER_CACHE = /^`ironvault_user_cache_\$\{[\w.]+\}`$|^CACHE_KEYS\.USER\(/;

/**
 * Each family: its writers (file, the key as written there), who opens its fixture, and the
 * screens' tests that draw from it. The query cache keeps fixtures of its own, beside its test.
 */
const FAMILIES: Record<string, { writers: [string, RegExp][]; opened: string; screens?: string[]; ownFixtures?: true }> = {
  'member-cache': { writers: [['src/stores/auth.ts', MEMBER_CACHE], ['src/hooks/useEditProfile.ts', MEMBER_CACHE], ['src/hooks/useUpdateUser.ts', MEMBER_CACHE]], opened: HERE },
  'pending-profile': { writers: [['src/stores/auth.ts', /^`dirty_profile_\$\{user\.id\}`$/]], opened: HERE },
  'pending-prefs': { writers: [['src/stores/auth.ts', /^`dirty_prefs_\$\{user\.id\}`$/]], opened: HERE },
  'import-receipt': { writers: [['src/features/archive/undoImport.ts', /^RECEIPT_KEY$/]], opened: HERE },
  'auth-throttle': { writers: [['src/hooks/useAuthThrottle.ts', /^STORAGE_KEY$/]], opened: HERE },
  'sign-out-owed': { writers: [['src/lib/endSession.ts', /^OWED_KEY$/]], opened: HERE },
  blocks: { writers: [['src/stores/blockStore.ts', /^MMKV_KEY\(userId\)$/]], opened: HERE },
  following: { writers: [['src/stores/followStore.ts', /^`reelhouse_following_\$\{userId\}`$/]], opened: HERE },
  requested: { writers: [['src/stores/followStore.ts', /^`reelhouse_requested_\$\{userId\}`$/]], opened: HERE },
  'handle-history': { writers: [['src/utils/handleHistory.ts', /^KEY$/]], opened: HERE },
  'handle-notice': { writers: [['src/utils/handleNotice.ts', /^KEY$/]], opened: HERE },
  'last-tab': { writers: [['src/utils/lastTab.ts', /^LAST_TAB_KEY$/]], opened: HERE },
  'profile-counts': { writers: [['src/utils/profileCountsCache.ts', /^`\$\{KEY\}_\$\{uid\}`$/]], opened: HERE },
  drafts: {
    writers: [['src/utils/memberDrafts.ts', /^draftKey\(/]],
    opened: HERE,
    // Each room a build-41 draft opens in (the stack's draft is new since: list-modal.curate).
    screens: [
      'src/hooks/__tests__/aRestoredNoteIsSent.test.tsx',
      'src/components/dispatch/__tests__/theDraftIsTheWholePiece.test.tsx',
      'src/components/dispatch/__tests__/composeScreen.test.tsx',
      'src/components/dispatch/__tests__/readerScreen.test.tsx',
      'src/components/dispatch/__tests__/ballotDesk.test.tsx',
    ],
  },
  // The queue, its dead letter and the writes held for a member: each list through writeList or writeQueue.
  'offline-queue': { writers: [['src/utils/queueOwnership.ts', /^(QUEUE_KEY|key)$/]], opened: HERE },
  'held-writes': { writers: [], opened: HERE },
  'darkroom-films': { writers: [['app/(tabs)/darkroom.tsx', /^cacheKey$/]], opened: 'src/components/darkroom/__tests__/theTraySaysWhenTheCatalogueIsAway.test.tsx' },
  'query-cache': { writers: [['src/lib/queryClient.ts', /^CACHE_KEY$/]], opened: 'src/utils/__tests__/queryClient.test.ts', ownFixtures: true },
};

type Write = { file: string; line: number; key: string };

/** Every write of JSON to the phone's storage in a file: a stringified value, or a name the file stringifies into. */
export function jsonWritesIn(file: string, text: string): Write[] {
  // By its extension: a .ts file's `<T>x` cast read as TSX hides what follows it.
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, file.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const out: Write[] = [];
  const stringifies = (n: ts.Node | undefined) => !!n && ts.isCallExpression(n) && n.expression.getText(sf) === 'JSON.stringify';
  const stringified = new Set<string>();
  const names = (n: ts.Node) => {
    if (ts.isVariableDeclaration(n) && ts.isIdentifier(n.name) && stringifies(n.initializer)) stringified.add(n.name.text);
    ts.forEachChild(n, names);
  };
  names(sf);
  const visit = (n: ts.Node) => {
    if (ts.isCallExpression(n) && n.arguments.length >= 2 && /^(storage\.set|setSensitive)$/.test(n.expression.getText(sf))) {
      const value = n.arguments[1]!;
      if ((ts.isIdentifier(value) && stringified.has(value.text)) || stringifies(value)) {
        out.push({ file, line: sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1, key: n.arguments[0]!.getText(sf) });
      }
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return out;
}

// The storage module itself writes for every family (setSensitive, and the saved stores'
// adapters, held by savedStoresAreVersioned's finder over persist).
const writes = files('appCode', { ext: ['.ts', '.tsx'] }).map(rel)
  .filter((f) => f !== 'src/stores/mmkv-storage.ts')
  .flatMap((f) => jsonWritesIn(f, readFileSync(join(ROOT, f), 'utf8')));

const familiesOf = (w: Write) => Object.entries(FAMILIES)
  .filter(([, fam]) => fam.writers.some(([file, key]) => file === w.file && key.test(w.key))).map(([name]) => name);

describe('everything saved as JSON', () => {
  it('is found (the scan has not gone blind)', () => {
    expect(writes.length).toBeGreaterThanOrEqual(30);
    expect(writes.some((w) => w.file === 'src/utils/memberDrafts.ts')).toBe(true);
  });

  it('belongs to one family, and every family still has its writer', () => {
    const strays = writes.filter((w) => familiesOf(w).length !== 1).map((w) => `${w.file}:${w.line} ${w.key} (${familiesOf(w).join(', ') || 'no family'})`);
    const gone = Object.entries(FAMILIES).flatMap(([name, fam]) => fam.writers
      .filter(([file, key]) => !writes.some((w) => w.file === file && key.test(w.key))).map(([file, key]) => `${name}: ${file} ${key}`));
    expect({ strays, gone }).toEqual({ strays: [], gone: [] });
  });

  it('has a fixture of what build 41 saved, opened by its reader', () => {
    const faults = Object.entries(FAMILIES).flatMap(([name, fam]) => {
      if (fam.ownFixtures) return existsSync(join(ROOT, fam.opened)) ? [] : [`${name}: ${fam.opened} is gone`];
      const out: string[] = [];
      if (!existsSync(join(FIXTURES, `${name}.json`))) out.push(`${name}: no fixture`);
      const opener = readFileSync(join(ROOT, fam.opened), 'utf8');
      if (fam.opened === HERE ? !opener.includes(`put('${name}')`) : !opener.includes(`saved-json/${name}`)) out.push(`${name}: ${fam.opened} does not open it`);
      for (const screen of fam.screens ?? []) {
        if (!readFileSync(join(ROOT, screen), 'utf8').includes(`saved-json/${name}`)) out.push(`${name}: ${screen} draws no screen from it`);
      }
      return out;
    });
    expect(faults).toEqual([]);
  });

  it('says NO to a write it cannot place', () => {
    const keys = (src: string) => jsonWritesIn('probe.ts', src).map((w) => w.key);
    expect(keys("const held = JSON.stringify(y); storage.set(K, JSON.stringify(x)); setSensitive(`a_${id}`, held); storage.set('flag', 'true'); storage.set(T, token)"))
      .toEqual(['K', '`a_${id}`']);
    expect(familiesOf({ file: 'src/utils/lastTab.ts', line: 1, key: 'OTHER_KEY' })).toEqual([]);
  });
});

describe('opens what build 41 saved', () => {
  beforeEach(() => storage.clearAll());
  afterEach(() => jest.restoreAllMocks());

  it('the cached member, painted at launch', () => {
    const f = put('member-cache');
    useAuthStore.getState().hydrateFromCache();
    const s = useAuthStore.getState();
    expect(s.user).toEqual(f.saved[`ironvault_user_cache_${M}`]);
    expect(s.isAuthenticated).toBe(true);
  });

  it('the profile edits and preferences not yet sent', () => {
    const profile = put('pending-profile');
    const prefs = put('pending-prefs');
    expect(readPendingProfile(M)).toEqual(profile.saved[`dirty_profile_${M}`]);
    expect(readPendingPrefs(M)).toEqual(prefs.saved[`dirty_prefs_${M}`]);
  });

  it('the last import\'s receipt, still undoable', () => {
    const f = put('import-receipt');
    expect(loadReceipt(M)).toEqual(f.saved.import_receipt_last);
  });

  it('the sign-in attempts, still holding the door', async () => {
    const f = put('auth-throttle');
    jest.spyOn(Date, 'now').mockReturnValue(f.now!);
    const hook = await renderHook(() => useAuthThrottle());
    await act(async () => {});
    // Five in the minute: shut until the oldest is a minute old, 20 seconds on.
    expect([hook.result.current.secondsRemaining, hook.result.current.canAttempt]).toEqual([20, false]);
    await hook.unmount();
  });

  it('the sign-out the server is still owed', () => {
    expect(__owedForTests()).toBeNull();
    const f = put('sign-out-owed');
    expect(__owedForTests()).toEqual(f.saved.sign_out_owed);
  });

  it('the blocks and mutes, known', () => {
    put('blocks');
    useBlockStore.getState().hydrateFromCache(M);
    const s = useBlockStore.getState();
    expect([s.blocked, s.muted, s.blocksKnown]).toEqual([['88888888-8888-4888-8888-888888888888'], ['99999999-9999-4999-8999-999999999999'], true]);
  });

  it('who the member follows, and asked to', () => {
    const following = put('following').saved[`reelhouse_following_${M}`];
    const requested = put('requested').saved[`reelhouse_requested_${M}`];
    useSocialStore.getState().hydrateFromCache(M);
    const s = useSocialStore.getState();
    expect([s.following, s.followingKnown, s.requested]).toEqual([following, 'held', requested]);
  });

  it('the handles the member had, and the one they asked for', () => {
    put('handle-history');
    expect(wasMyHandle(M, 'older_handle')).toBe(true);
    const f = put('handle-notice');
    jest.spyOn(Date, 'now').mockReturnValue(f.now!);
    expect(readRequestedHandle()).toEqual(f.saved.reelhouse_pending_handle);
  });

  it('the tab the member left', () => {
    const f = put('last-tab');
    expect(tabToReopen(f.now)).toBe('darkroom');
  });

  it('the profile\'s counts', () => {
    const f = put('profile-counts');
    expect(readCachedCounts(M)).toEqual(f.saved[`reelhouse_profile_counts_${M}`]);
  });

  it('every kind of draft, whole', () => {
    const f = put('drafts');
    const opened = Object.entries(f.saved).map(([key, envelope]) => {
      const [, kind, scope] = /^reelhouse_draft_[\w-]+?_(dossier|edit|log|critique|ballot|stack)(?:_(.+))?$/.exec(key) ?? [];
      const { data, savedAt } = envelope as { data: unknown; savedAt: string };
      return [readDraft(M, kind as DraftKind, scope), { data, savedAt }];
    });
    expect(opened.length).toBe(5);
    for (const [read, saved] of opened) expect(read).toEqual(saved);
  });

  it('the offline queue: each write given its member, each still a write this build sends', () => {
    const f = put('offline-queue');
    __resetStampForTests();
    stampOwnerlessWrites(M);
    const saved = f.saved['reelhouse-offline-mutations'] as { id: string }[];
    const queue = readQueue();
    expect(queue.map((m) => [m.id, m.owner])).toEqual(saved.map((m) => [m.id, M]));
    // A payload this build's schema refuses goes to the dead letter, unsent.
    expect(queue.filter((m) => !MutationSchemaMap[m.type]?.safeParse(m.payload).success).map((m) => m.type)).toEqual([]);
    expect(readList(DEAD_LETTER_KEY).map((m) => m.owner)).toEqual([M]);
  });

  it('the offline queue, sent: none of it reaches the dead letter', async () => {
    const f = put('offline-queue');
    jest.spyOn(Date, 'now').mockReturnValue(Math.max(...(f.saved['reelhouse-offline-mutations'] as { timestamp: number }[]).map((m) => m.timestamp)) + 60_000);
    jest.spyOn(supabase.auth, 'getSession').mockResolvedValue({ data: { session: { user: { id: M } } }, error: null } as never);
    useAuthStore.setState({ user: { id: M } } as never);
    __resetStampForTests();
    stampOwnerlessWrites(M);
    await flushOfflineQueue();
    expect(readQueue().map((m) => m.type)).toEqual([]);
    expect(readList(DEAD_LETTER_KEY).map((m) => m.id)).toEqual((f.saved['reelhouse-offline-mutations_dead_letter'] as { id: string }[]).map((m) => m.id));
  });

  it('the writes kept for the member\'s return', () => {
    const f = put('held-writes');
    const held = f.saved[`reelhouse-offline-mutations_held_${M}`];
    expect(releaseHeldWrites(M)).toEqual(held);
    expect(readQueue()).toEqual(held);
  });
});
