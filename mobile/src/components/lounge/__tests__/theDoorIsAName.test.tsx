/**
 * theDoorIsAName.test.tsx — what stands at the Lounge's door is membership.
 * ─────────────────────────────────────────────────────────────────────────────
 * The LoungeGate once met every member without the Archivist rank. The corridor
 * then opened to every member, and the tab began showing this gate ONLY to a
 * visitor who is not signed in — while it kept saying CLEARANCE REQUIRED, the
 * ranks hold the key, ✦ ASCEND THE RANKS, and sent them to the paid ranks for a
 * room that costs nothing to enter. The same false line survived on the other
 * side too: an Archivist's corridor read ARCHIVIST EXCLUSIVE.
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';

const mockPush = jest.fn();
jest.mock('@/src/utils/typedRouter', () => ({ nav: { push: (...a: unknown[]) => mockPush(...a) } }));
jest.mock('@/src/components/theme/CrestGlow', () => ({ CrestGlow: () => null }));
jest.mock('@/src/components/theme/OrnamentalRule', () => ({ OrnamentalRule: () => null }));

// eslint-disable-next-line import/first
import { LoungeGate } from '../LoungeGate';

const ROOT = join(__dirname, '..', '..', '..', '..');
const code = (p: string) => readFileSync(join(ROOT, p), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/.*$/gm, ' ');

beforeEach(() => mockPush.mockReset());

describe('the door is a name, not a rank', () => {
  it('tells a visitor what they actually lack — membership, which is free', async () => {
    const r = render(<LoungeGate />);
    expect(r.getByText('[ MEMBERS ONLY ]')).toBeTruthy();
    expect(r.getByText('FREE TO JOIN · ARCHIVISTS TAKE A SEAT')).toBeTruthy();
    // The rank language that sold a paid key for a room anyone may enter.
    const all = JSON.stringify(r.toJSON());
    for (const lie of ['CLEARANCE REQUIRED', 'ASCEND THE RANKS', 'HOLD THE KEY']) {
      expect(`${lie}: ${all.includes(lie)}`).toBe(`${lie}: false`);
    }
  });

  it('and the button joins — the sign-UP form, not the ranks', async () => {
    const r = render(<LoungeGate />);
    await fireEvent.press(r.getByTestId('lounge-gate-cta'));
    expect(mockPush).toHaveBeenCalledWith('/login', { action: 'signup' });
    expect(r.getByLabelText('Join the Society — free. Opens sign up.')).toBeTruthy();
  });

  it('an Archivist’s corridor no longer claims to be exclusive', () => {
    const corridor = code('app/(tabs)/lounge.tsx');
    expect(corridor).not.toMatch(/ARCHIVIST EXCLUSIVE/);
    expect(corridor).toMatch(/isArchivist \? 'READ ANY SALON · TAKE YOUR SEAT' : 'READ ANY SALON · ARCHIVISTS TAKE A SEAT'/);
  });

  it('the device flow that walks this door checks the truth, not the old gate', () => {
    // .maestro/lounge_flow.yaml runs on a real Android device in CI. It signed
    // in and then asserted CLEARANCE REQUIRED — which a signed-in member has not
    // seen since the corridor opened.
    //
    // Read as PARSED STEPS, not text: the file's own comment explains the old
    // gate, and it rightly asserts CLEARANCE REQUIRED is NOT visible. A raw text
    // match failed on both. Each flow is two YAML documents — config, then steps.
    const yaml = require('js-yaml') as { loadAll: (s: string) => unknown[] };
    const [, steps] = yaml.loadAll(readFileSync(join(ROOT, '.maestro', 'lounge_flow.yaml'), 'utf8')) as [unknown, Record<string, unknown>[]];
    const visible = steps.map((s) => s.assertVisible).filter((v): v is string => typeof v === 'string');
    const notVisible = steps.map((s) => s.assertNotVisible).filter((v): v is string => typeof v === 'string');
    expect(visible).not.toContain('CLEARANCE REQUIRED');
    expect(visible).toEqual(expect.arrayContaining(['MEMBERS ONLY', 'READ ANY SALON · ARCHIVISTS TAKE A SEAT']));
    expect(notVisible).toContain('CLEARANCE REQUIRED');
  });
});

describe('two more ropes that answered on their own', () => {
  it('the archive shows its rope from the rope’s own answer', () => {
    const archive = code('app/dispatch/archive.tsx');
    expect(archive).toMatch(/\{!gathering\.held && !film && matches\.length > 0 \?/);
    expect(archive).not.toMatch(/isArchivistPlusTier/);
  });

  it('a member’s own Vault room ropes the Physical Archive by name', () => {
    const profile = code('app/user/[username].tsx');
    expect(profile).toMatch(/const shelfRope = useClearance\('physical-archive'\);/);
    const vault = profile.slice(profile.indexOf('title="The Vault"'), profile.indexOf('title="The Vault"') + 300);
    expect(vault).toMatch(/onAscend=\{shelfRope\.open\}/);
  });
});
