/**
 * stackCritiques.test.ts — the one list a stack's critiques sheet draws.
 *
 * Review round 3: a member reported with "also block", or the curator blocked from the stack's
 * ···, stayed in the open sheet under the toast that said their words were hidden. The sheet's
 * list is drawn through who is hidden now; the house's own filter only took the next read.
 */
import { useBlockStore } from '@/src/stores/blockStore';
import type { QueuedMutation } from '@/src/utils/offlineQueue';
import { stackCritiques } from '../stackCritiques';

const sent = (id: string, user: string, content: string) => ({
  id, user_id: user, username: user, avatar_url: null, content, created_at: '2026-11-15T10:00:00.000Z',
});
const queuedAdd = (id: string, content: string): QueuedMutation => ({
  id: 'q-' + id, type: 'add_list_comment', timestamp: Date.parse('2026-11-15T11:00:00.000Z'), owner: 'me',
  payload: { id, list_id: 'L1', user_id: 'me', content },
} as unknown as QueuedMutation);
const queuedRemove = (commentId: string): QueuedMutation => ({
  id: 'r-' + commentId, type: 'remove_list_comment', timestamp: 0, owner: 'me', payload: { comment_id: commentId },
} as unknown as QueuedMutation);

const me = { username: 'me', avatar_url: null };

beforeEach(() => {
  useBlockStore.setState({ blocked: [], muted: [], _blockedIndex: new Set(), _mutedIndex: new Set() });
});

describe("a stack's critiques, as its sheet draws them", () => {
  it('draws those sent and this member\'s own still waiting, each once', () => {
    const drawn = stackCritiques([sent('c1', 'u2', 'Sent.')], [queuedAdd('c2', 'Mine, waiting.'), queuedAdd('c1', 'Already sent.')], 'L1', me);
    expect(drawn.map((c) => [c.id, c.body])).toEqual([['c1', 'Sent.'], ['c2', 'Mine, waiting.']]);
  });

  it('draws none taken back while the taking back waits to be sent', () => {
    const drawn = stackCritiques([sent('c1', 'u2', 'Sent.'), sent('c3', 'me', 'Taken back.')], [queuedRemove('c3')], 'L1', me);
    expect(drawn.map((c) => c.id)).toEqual(['c1']);
  });

  it('draws no member hidden now: blocked, or muted', () => {
    const list = [sent('c1', 'u2', 'Stays.'), sent('c2', 'u3', 'Blocked.'), sent('c4', 'u4', 'Muted.')];
    useBlockStore.setState({ blocked: ['u3'], _blockedIndex: new Set(['u3']), muted: ['u4'], _mutedIndex: new Set(['u4']) });
    expect(stackCritiques(list, [], 'L1', me).map((c) => c.id)).toEqual(['c1']);
  });

  it("draws another stack's waiting critique nowhere here", () => {
    const other = { ...queuedAdd('c9', 'Elsewhere.'), payload: { id: 'c9', list_id: 'L2', user_id: 'me', content: 'Elsewhere.' } } as unknown as QueuedMutation;
    expect(stackCritiques([], [other], 'L1', me)).toEqual([]);
  });
});
