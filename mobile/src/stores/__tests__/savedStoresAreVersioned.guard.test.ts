/**
 * Every saved store is versioned, and opens what the last release saved (P4.11).
 *
 * The saved stores had no version and no migration: an update that changed what one saves would
 * open the last release's shape as its own, and draw it wrong or not at all. A finder over every
 * persist( call, read from its syntax tree, fails on one without `version` and `migrate`, or whose
 * name has no fixture of the last release's shape (fixtures/saved/<name>.json: TestFlight build
 * 41, ae569c0f, which saved unversioned, as zustand's 0). Each fixture is then written where its
 * store reads, the store is rehydrated through its own storage, and what it held is there.
 */
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import ts from 'typescript';
import { files, rel } from '@/test-utils/universe';
import { storage } from '../mmkv-storage';
import { rehydrateFilmStore, useFilmStore } from '../films';
import { useDiscoverStore } from '../discover';
import { useNotificationStore } from '../notificationStore';
import { useSettingsStore } from '../settings';
import { useVaultStore } from '../vaultStore';

// The storage as the real module reads it, over one map: every store reads storage.getString(name),
// the film store's async storage parsing it (jest.setup's stand-in answers that one nothing).
jest.mock('../mmkv-storage', () => {
  const disk = new Map<string, string>();
  const kv = { getItem: (k: string) => disk.get(k) ?? null, setItem: (k: string, v: string) => { disk.set(k, v); }, removeItem: (k: string) => { disk.delete(k); } };
  return {
    storage: {
      set: (k: string, v: string) => { disk.set(k, v); }, getString: (k: string) => disk.get(k), delete: (k: string) => { disk.delete(k); },
      contains: (k: string) => disk.has(k), getAllKeys: () => [...disk.keys()], getNumber: () => undefined, getBoolean: () => undefined, clearAll: () => disk.clear(),
    },
    zustandMMKVStorage: kv,
    zustandMMKVStorageSensitive: kv,
    setSensitive: (k: string, v: string) => { disk.set(k, v); },
    isStorageEncrypted: () => true,
    createAsyncMMKVStorage: () => ({
      getItem: (k: string) => { const s = disk.get(k); return s ? JSON.parse(s) : null; },
      setItem: (k: string, v: unknown) => { disk.set(k, JSON.stringify(v)); },
      removeItem: (k: string) => { disk.delete(k); },
    }),
    initEncryptedStorage: async () => {},
  };
});

const ROOT = join(__dirname, '..', '..', '..');
const FIXTURES = join(__dirname, 'fixtures', 'saved');
const fixture = (name: string) => readFileSync(join(FIXTURES, `${name}.json`), 'utf8');

type Store = { file: string; line: number; name: string | null; version: boolean; migrate: boolean };

/** Every persist( call in a file: its saved name (a string, or a const of one) and whether it versions. */
export function storesIn(file: string, text: string): Store[] {
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const consts = new Map<string, string>();
  const out: Store[] = [];
  const visit = (n: ts.Node) => {
    if (ts.isVariableDeclaration(n) && ts.isIdentifier(n.name) && n.initializer && ts.isStringLiteral(n.initializer)) {
      consts.set(n.name.text, n.initializer.text);
    }
    if (ts.isCallExpression(n) && ts.isIdentifier(n.expression) && n.expression.text === 'persist') {
      const opts = n.arguments[1];
      const props = opts && ts.isObjectLiteralExpression(opts) ? opts.properties : ts.factory.createNodeArray<ts.ObjectLiteralElementLike>();
      const prop = (k: string) => props.find((p) => p.name && p.name.getText(sf) === k);
      const nameProp = prop('name');
      const value = nameProp && ts.isPropertyAssignment(nameProp) ? nameProp.initializer : null;
      out.push({
        file, line: sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1,
        name: !value ? null : ts.isStringLiteral(value) ? value.text : ts.isIdentifier(value) ? consts.get(value.text) ?? null : null,
        version: !!prop('version'),
        migrate: !!prop('migrate'),
      });
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return out;
}

const stores = files('appCode', { ext: ['.ts', '.tsx'] }).map(rel)
  .flatMap((f) => storesIn(f, readFileSync(join(ROOT, f), 'utf8')));

describe('every saved store', () => {
  it('is found (the scan has not gone blind)', () => {
    expect(stores.map((s) => s.name).sort()).toEqual(
      ['reelhouse-discover', 'reelhouse-films', 'reelhouse-notifications', 'reelhouse-settings', 'reelhouse-vault']);
  });

  it('names its version and its migration, and has a fixture of what the last release saved', () => {
    const faults = stores.flatMap((s) => [
      ...(s.version && s.migrate ? [] : [`${s.file}:${s.line} has no version or no migrate`]),
      ...(s.name && existsSync(join(FIXTURES, `${s.name}.json`)) ? [] : [`${s.file}:${s.line} (${s.name}) has no last-release fixture`]),
    ]);
    expect(faults).toEqual([]);
  });

  it('says NO to a store that does not', () => {
    const one = (src: string) => storesIn('probe.ts', src)[0];
    expect(one("persist(f, { name: 'x', storage })")).toMatchObject({ name: 'x', version: false, migrate: false });
    expect(one("const K = 'y'; persist(f, { name: K, version: 1, migrate: m })")).toMatchObject({ name: 'y', version: true, migrate: true });
  });
});

describe('opens what the last release saved', () => {
  it('the film store: logs, watchlist, stacks, marks and the shelf', async () => {
    storage.set('reelhouse-films', fixture('reelhouse-films'));
    await rehydrateFilmStore();
    const s = useFilmStore.getState();
    expect([s.logs[0]?.title, s.logs[0]?.watchedDate, s.watchlist[0]?.title, s.lists[0]?.films[0]?.title, s.interactions[0]?.type, s.physicalArchive[0]?.formats])
      .toEqual(['Tokyo Story', '2026-10-09', 'Cinema Paradiso', 'Tokyo Story', 'endorse', ['bluray']]);
  });

  it('the notices, and where their paging stood', async () => {
    storage.set('reelhouse-notifications', fixture('reelhouse-notifications'));
    await useNotificationStore.persist.rehydrate();
    const s = useNotificationStore.getState();
    expect([s.notifications[0]?.message, s._unreadCount, s._hasMore, !!s._cursor]).toEqual(['certified your log of Tokyo Story', 1, true, true]);
  });

  it('the Darkroom\'s chosen filters and search', async () => {
    storage.set('reelhouse-discover', fixture('reelhouse-discover'));
    await useDiscoverStore.persist.rehydrate();
    const s = useDiscoverStore.getState();
    expect([s.filters.genreId, s.filters.decade?.label, s.query]).toEqual([18, '2000s', 'ozu']);
  });

  it('the settings', async () => {
    storage.set('reelhouse-settings', fixture('reelhouse-settings'));
    await useSettingsStore.persist.rehydrate();
    expect(useSettingsStore.getState().tactileAudioEnabled).toBe(false);
  });

  it('the Vault\'s notes, by viewing and by log', async () => {
    storage.set('reelhouse-vault', fixture('reelhouse-vault'));
    await useVaultStore.persist.rehydrate();
    const s = useVaultStore.getState();
    expect([s.noteFor('55555555-5555-4555-8555-555555555551'), s.notesLog['55555555-5555-4555-8555-555555555551']])
      .toEqual(['Watched with my father, the week before he moved.', '44444444-4444-4444-8444-444444444441']);
  });
});
