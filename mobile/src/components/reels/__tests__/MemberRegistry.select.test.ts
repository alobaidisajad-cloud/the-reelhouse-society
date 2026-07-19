import { selectRegistryMembers } from '../MemberRegistry';
import type { NotableMember } from '@/src/services/MemberDiscoveryService';

const mk = (id: string, username: string): NotableMember => ({
  id, username, avatar_url: null, role: null, member_no: null, is_founding: null, is_social_private: false,
});

const noBlocks = () => false;

describe('selectRegistryMembers', () => {
  it('returns empty for undefined or empty input', () => {
    expect(selectRegistryMembers(undefined, { myId: 'me', followingLower: new Set(), isBlocked: noBlocks })).toEqual([]);
    expect(selectRegistryMembers([], { myId: 'me', followingLower: new Set(), isBlocked: noBlocks })).toEqual([]);
  });

  it('excludes self', () => {
    const data = [mk('me', 'myself'), mk('u1', 'morpho')];
    const out = selectRegistryMembers(data, { myId: 'me', followingLower: new Set(), isBlocked: noBlocks });
    expect(out.map((m) => m.id)).toEqual(['u1']);
  });

  it('excludes already-followed (case-insensitive)', () => {
    const data = [mk('u1', 'Morpho'), mk('u2', 'vertigo')];
    const out = selectRegistryMembers(data, { myId: 'me', followingLower: new Set(['morpho']), isBlocked: noBlocks });
    expect(out.map((m) => m.id)).toEqual(['u2']);
  });

  it('excludes blocked members', () => {
    const data = [mk('u1', 'morpho'), mk('u2', 'vertigo')];
    const out = selectRegistryMembers(data, { myId: 'me', followingLower: new Set(), isBlocked: (id) => id === 'u2' });
    expect(out.map((m) => m.id)).toEqual(['u1']);
  });

  it('drops username-less rows', () => {
    const data = [{ ...mk('u1', ''), username: '' } as NotableMember, mk('u2', 'vertigo')];
    const out = selectRegistryMembers(data, { myId: 'me', followingLower: new Set(), isBlocked: noBlocks });
    expect(out.map((m) => m.id)).toEqual(['u2']);
  });

  it('caps at 6 rows', () => {
    const data = Array.from({ length: 12 }, (_, i) => mk(`u${i}`, `member${i}`));
    const out = selectRegistryMembers(data, { myId: 'me', followingLower: new Set(), isBlocked: noBlocks });
    expect(out).toHaveLength(6);
  });
});
