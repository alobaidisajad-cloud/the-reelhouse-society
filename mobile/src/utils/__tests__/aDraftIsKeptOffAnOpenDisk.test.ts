/**
 * aDraftIsKeptOffAnOpenDisk.test.ts — on a phone whose keystore failed, a
 * draft is not written to the disk.
 *
 * Everything else a member writes is kept off an unencrypted store
 * (`setSensitive`, the member-content stores), and drafts were the exception:
 * an unfiled review, an essay, and the private note of a log, written in the
 * clear. The room is told the draft was not saved (writeDraft answers false).
 */
import { writeDraft, readDraft, draftKey } from '../memberDrafts';

const mockStore: Record<string, string> = {};
let mockEncrypted = true;

jest.mock('@/src/stores/mmkv-storage', () => ({
  storage: {
    set: (k: string, v: string) => { mockStore[k] = v; },
    getString: (k: string) => mockStore[k],
    delete: (k: string) => { delete mockStore[k]; },
    getAllKeys: () => Object.keys(mockStore),
  },
  isStorageEncrypted: () => mockEncrypted,
}));

beforeEach(() => { for (const k of Object.keys(mockStore)) delete mockStore[k]; });

it('with encryption, the draft is kept', () => {
  mockEncrypted = true;
  expect(writeDraft('u1', 'log', { review: 'A quiet noir.', privateNote: 'Dad loved this one.' })).toBe(true);
  expect(readDraft('u1', 'log')?.data).toEqual({ review: 'A quiet noir.', privateNote: 'Dad loved this one.' });
});

it('without it, nothing reaches the disk, and the room is told', () => {
  mockEncrypted = false;
  expect(writeDraft('u1', 'log', { review: 'A quiet noir.', privateNote: 'Dad loved this one.' })).toBe(false);
  expect(mockStore[draftKey('u1', 'log')]).toBeUndefined();
  expect(Object.keys(mockStore)).toEqual([]);
});
