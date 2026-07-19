import { buildFaceStackModel, type SalonFace } from '../MemberFaceStack';

const face = (u: string): SalonFace => ({ username: u, avatar_url: null });

describe('buildFaceStackModel — the bounded reliability core', () => {
  it('a 200-member salon shows 3 faces and "+197"', () => {
    const m = buildFaceStackModel([face('a'), face('b'), face('c'), face('d')], 200);
    expect(m.shown).toHaveLength(3);
    expect(m.overflowLabel).toBe('+197');
  });

  it('a 2-member salon shows 2 faces and no overflow', () => {
    const m = buildFaceStackModel([face('a'), face('b')], 2);
    expect(m.shown).toHaveLength(2);
    expect(m.overflowLabel).toBeNull();
  });

  it('exactly 3 members → 3 faces, no overflow', () => {
    const m = buildFaceStackModel([face('a'), face('b'), face('c')], 3);
    expect(m.shown).toHaveLength(3);
    expect(m.overflowLabel).toBeNull();
  });

  it('5 members with 3 fetched → "+2"', () => {
    const m = buildFaceStackModel([face('a'), face('b'), face('c')], 5);
    expect(m.overflowLabel).toBe('+2');
  });

  it('caps huge counts at "999+" so width stays bounded', () => {
    const m = buildFaceStackModel([face('a'), face('b'), face('c')], 5000);
    expect(m.overflowLabel).toBe('999+');
  });

  it('never caps faces above 3, even with more fetched', () => {
    const m = buildFaceStackModel([face('a'), face('b'), face('c'), face('d'), face('e')], 5);
    expect(m.shown).toHaveLength(3);
  });

  it('empty faces → nothing shown (component keys off this to render the count fallback)', () => {
    // shown.length === 0 is the signal the component uses to fall back to the
    // plain "N members" count; the model's overflow value is unused in that path.
    const m = buildFaceStackModel([], 8);
    expect(m.shown).toHaveLength(0);
  });

  it('undefined inputs are safe', () => {
    const m = buildFaceStackModel(undefined, undefined);
    expect(m.shown).toEqual([]);
    expect(m.overflow).toBe(0);
  });

  it('never returns negative overflow when count lags faces (data race)', () => {
    const m = buildFaceStackModel([face('a'), face('b'), face('c')], 1);
    expect(m.overflow).toBe(0);
    expect(m.overflowLabel).toBeNull();
  });
});
