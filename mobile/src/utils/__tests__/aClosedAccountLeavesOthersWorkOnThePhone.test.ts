/**
 * aClosedAccountLeavesOthersWorkOnThePhone.test.ts — review round 13 (othersKeptHere)
 * ─────────────────────────────────────────────────────────────────────────────
 * On a shared iPad, Ana's session ended elsewhere: her critiques written offline were set aside for
 * her return, and her essay draft kept. Ben then signed in there and deleted his own account, and
 * the deletion erased every key on the phone (storage.clearAll): when Ana came back, her critiques
 * and her essay were gone, unsent and unsaid. Now a closed account takes what is its own and the
 * phone's own marks, and leaves every key that names another member.
 *
 * The second half reads the app's code: every key a member's id is written into is one of the forms
 * the erasure knows, so a key made tomorrow for a member is never wiped from another's phone.
 */
import { relative, sep } from 'path';
import { readCode, MOBILE } from '@/test-utils/readCode';
import { files as universe } from '@/test-utils/universe';
import { eraseAllButOthers, keptForAnother, memberNamedBy, MEMBER_KEY_HEADS } from '../othersKeptHere';
import { draftKey } from '../memberDrafts';
import { DEAD_LETTER_KEY, QUEUE_KEY, heldKey } from '../queueOwnership';

const mockDisk = new Map<string, string>();
jest.mock('@/src/stores/mmkv-storage', () => ({
  storage: {
    getString: (k: string) => mockDisk.get(k),
    set: (k: string, v: string) => { mockDisk.set(k, String(v)); },
    delete: (k: string) => { mockDisk.delete(k); },
    getAllKeys: () => [...mockDisk.keys()],
    contains: (k: string) => mockDisk.has(k),
  },
  setSensitive: (k: string, v: string) => { mockDisk.set(k, v); },
  isStorageEncrypted: () => true,
  withinKeystoreDeadline: <T,>(ask: Promise<T>) => ask,
  storageReady: () => Promise.resolve(),
}));

const ANA = '11111111-1111-4111-8111-111111111111';
const BEN = '22222222-2222-4222-8222-222222222222';

describe('a closed account on a shared phone', () => {
  beforeEach(() => {
    mockDisk.clear();
    // What the phone keeps for Ana, who is away.
    mockDisk.set(heldKey(ANA), '[{"type":"add_comment"}]');
    mockDisk.set(draftKey(ANA, 'dossier'), '{"v":2}');
    mockDisk.set(draftKey(ANA, 'critique', '33333333-3333-4333-8333-333333333333'), '{"v":2}');
    mockDisk.set(`dirty_prefs_${ANA}`, '{"theme":"dark"}');
    mockDisk.set(`ironvault_user_cache_${ANA}`, '{"id":"ana"}');
    mockDisk.set(`kept_paper_${ANA}`, '[]');
    mockDisk.set(DEAD_LETTER_KEY, JSON.stringify([{ id: 'd-ana', owner: ANA, type: 'add_comment', payload: {} }]));
    // Ben's own, and the phone's own.
    mockDisk.set(draftKey(BEN, 'log'), '{"v":2}');
    mockDisk.set(`ironvault_user_cache_${BEN}`, '{"id":"ben"}');
    mockDisk.set(`reelhouse_initiation_${BEN}`, 'true');
    mockDisk.set(QUEUE_KEY, '[]');
    mockDisk.set('import_receipt_last', '{}');
    mockDisk.set('review_prompt_count', '2');
  });

  it('Ben\'s deletion leaves Ana\'s set-aside writes, drafts, preferences and caches', () => {
    eraseAllButOthers(BEN);
    expect([...mockDisk.keys()].sort()).toEqual([
      heldKey(ANA),
      draftKey(ANA, 'dossier'),
      draftKey(ANA, 'critique', '33333333-3333-4333-8333-333333333333'),
      `dirty_prefs_${ANA}`,
      `ironvault_user_cache_${ANA}`,
      `kept_paper_${ANA}`,
      DEAD_LETTER_KEY,
    ].sort());
  });

  it('and, of the two lists every member\'s writes share, keeps Ana\'s alone, though logout\'s own sweep of them failed', () => {
    const write = (id: string, owner: string) => ({ id, owner, type: 'add_comment', payload: {}, createdAt: 0 });
    mockDisk.set(DEAD_LETTER_KEY, JSON.stringify([write('d-ben', BEN), write('d-ana', ANA)]));
    mockDisk.set(QUEUE_KEY, JSON.stringify([write('q-ben', BEN), write('q-ana', ANA)]));
    eraseAllButOthers(BEN);
    const ids = (k: string) => (JSON.parse(mockDisk.get(k) ?? '[]') as { id: string }[]).map((m) => m.id);
    expect([ids(DEAD_LETTER_KEY), ids(QUEUE_KEY)]).toEqual([['d-ana'], ['q-ana']]);
  });

  it('and takes everything of Ben\'s and every mark of the phone\'s own', () => {
    eraseAllButOthers(BEN);
    for (const gone of [draftKey(BEN, 'log'), `ironvault_user_cache_${BEN}`, `reelhouse_initiation_${BEN}`, QUEUE_KEY, 'import_receipt_last', 'review_prompt_count']) {
      expect(mockDisk.has(gone)).toBe(false);
    }
  });

  it('reads which member a key names, by the place their id stands', () => {
    expect(memberNamedBy(draftKey(ANA, 'edit', '44444444-4444-4444-8444-444444444444'))).toBe(ANA);
    expect(memberNamedBy(heldKey(BEN))).toBe(BEN);
    expect(memberNamedBy('review_prompt_count')).toBeNull();
    expect(keptForAnother(`reelhouse_blocks_${ANA}`, BEN)).toBe(true);
    expect(keptForAnother(`reelhouse_blocks_${BEN}`, BEN)).toBe(false);
    expect(keptForAnother('last_tab', BEN)).toBe(false);
  });
});

/** Each key written with a member's id in it: the literal before the id, by file. */
function memberKeyHeadsIn(code: string): string[] {
  const heads: string[] = [];
  // `head${...member...}`, or `head${kind}_${...member...}` (the kept pages): the head with each
  // piece before the member's id, a piece written `*`.
  const re = /`([A-Za-z][\w-]*_)((?:\$\{[^}]+\}_)*)\$\{([^}]+)\}/g;
  for (const m of code.matchAll(re)) {
    const who = m[3] ?? '';
    if (!/\b(user|uid|userId|memberId|member|owner|previousUserId|staleUserId|lastUserId|authedUser|updatedUser|reverted)\b/.test(who)
      && !/^(id|userId|uid|owner)$/.test(who.trim())) continue;
    heads.push(`${m[1]}${(m[2] ?? '').replace(/\$\{[^}]+\}/g, '*')}`);
  }
  return heads;
}

/** A head written with a piece before the id (`kept_*_`) is known when a listed head fills it. */
const known = (head: string) => MEMBER_KEY_HEADS.some((listed) =>
  new RegExp(`^${head.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '[a-z]+')}$`).test(listed));

describe('every key a member\'s id is written into is one the erasure knows', () => {
  it('the reader sees a key built with a member\'s id, and one with a piece before it', () => {
    expect(memberKeyHeadsIn('storage.set(`brandnewcache_${userId}`, x); const k = (kind, userId) => `kept_${kind}_${userId}`;'))
      .toEqual(['brandnewcache_', 'kept_*_']);
    expect(known('kept_*_')).toBe(true);
    expect(known('brandnewcache_')).toBe(false);
  });

  it('none in the app\'s code is unknown', () => {
    const files = universe('appCode').filter((f) => !f.endsWith('.d.ts') && !f.split(sep).join('/').includes('/src/utils/othersKeptHere'));
    expect(files.length).toBeGreaterThanOrEqual(440);
    const unknown: string[] = [];
    let found = 0;
    for (const f of files) {
      const code = readCode(f);
      // Only keys: a template beside the phone's storage, a key helper or a key constant.
      if (!/storage\.|setSensitive|Key\b|KEY\b/.test(code)) continue;
      for (const head of memberKeyHeadsIn(code)) {
        found++;
        if (!known(head)) unknown.push(`${relative(MOBILE, f).split(sep).join('/')}: ${head}`);
      }
    }
    // The heads the app writes by template today are found (ironvault_user_cache_, dirty_prefs_, ...).
    expect(found).toBeGreaterThanOrEqual(8);
    expect(unknown).toEqual([]);
  });

  it('the heads built from constants are the ones the erasure lists', () => {
    // draftKey and heldKey build their keys from constants the reader above cannot see.
    expect(MEMBER_KEY_HEADS).toContain(draftKey(ANA, 'log').slice(0, -`${ANA}_log`.length));
    expect(MEMBER_KEY_HEADS).toContain(heldKey(ANA).slice(0, -ANA.length));
    // The profile counts are `${KEY}_${uid}` with KEY 'reelhouse_profile_counts'.
    expect(readCode('src/utils/profileCountsCache.ts')).toMatch(/const KEY = 'reelhouse_profile_counts';/);
    expect(MEMBER_KEY_HEADS).toContain('reelhouse_profile_counts_');
  });
});
