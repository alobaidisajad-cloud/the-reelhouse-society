/**
 * everyPersistedStoreWaitsForTheKey.guard.test.ts — a persisted store is read
 * only once storage is encrypted.
 *
 * Storage starts as a placeholder and becomes the encrypted instance in the
 * root layout (initEncryptedStorage). A persisted store that hydrates at
 * import reads the placeholder: the Vault did, so the notes it kept for a
 * restart were never read back. Every persisted store skips hydration and is
 * rehydrated by the root layout, after the key.
 */
import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';

const ROOT = join(__dirname, '..', '..', '..');
const STORES = join(ROOT, 'src', 'stores');
const LAYOUT = readFileSync(join(ROOT, 'app', '_layout.tsx'), 'utf8');

const persisted = readdirSync(STORES)
  .filter((f) => f.endsWith('.ts'))
  .map((f) => ({ f, src: readFileSync(join(STORES, f), 'utf8') }))
  .filter(({ src }) => /\bpersist\(/.test(src));

it('finds the persisted stores (a scan that finds none proves nothing)', () => {
  expect(persisted.map((p) => p.f).sort()).toEqual(['discover.ts', 'films.ts', 'notificationStore.ts', 'settings.ts', 'vaultStore.ts']);
});

it.each(persisted.map((p) => [p.f, p.src]))('%s skips hydration, and the root layout rehydrates it after the key', (_f, src) => {
  expect(src).toMatch(/skipHydration: true/);
  const name = /export const (rehydrate\w+) = /.exec(src)?.[1];
  expect(name).toBeDefined();
  expect(LAYOUT).toMatch(new RegExp(`${name}\\(\\)`));
  // After the key: the rehydrates follow initEncryptedStorage in prepare().
  expect(LAYOUT.indexOf(`${name}()`)).toBeGreaterThan(LAYOUT.indexOf('await initEncryptedStorage()'));
});
