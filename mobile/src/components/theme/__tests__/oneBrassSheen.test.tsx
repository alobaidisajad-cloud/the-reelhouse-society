/**
 * oneBrassSheen.test.tsx — the brass plates' sheen sweeps only where it is seen.
 *
 * The Reel's "curate a collection" plate had its own copy of the Lobby's sheen,
 * the same in every pixel but one: it never stopped. Tabs stay mounted, so it
 * swept on behind whichever tab the member had moved to. Then the Reel's plate
 * lost its sheen when the Reel's light was calmed (theReelSaysWhenItCouldNotRead
 * holds it still); the Lobby's join button draws the one BrassSheen, which sweeps
 * only on the screen in front, and holds still for a member who has asked the
 * system to stop motion.
 */
import React from 'react';
import { readFileSync } from 'fs';
import { join } from 'path';
import { render } from '@testing-library/react-native';
import { BrassSheen } from '../BrassSheen';

let mockFocused = true;
jest.mock('expo-router/react-navigation', () => ({ ...require('@/test-utils/navigationMock').navigationMock(), useIsFocused: () => mockFocused }));

const reanimated = jest.requireMock('react-native-reanimated') as { withRepeat: jest.Mock; useReducedMotion: () => boolean };
const originalReduced = reanimated.useReducedMotion;
afterEach(() => { reanimated.useReducedMotion = originalReduced; mockFocused = true; });

const sweeps = () => {
  reanimated.withRepeat.mockClear();
  render(<BrassSheen />);
  return reanimated.withRepeat.mock.calls.length;
};

describe('the brass sheen', () => {
  it('sweeps on the screen in front', () => {
    expect(sweeps()).toBe(1);
  });

  it('holds still behind another tab', () => {
    mockFocused = false;
    expect(sweeps()).toBe(0);
  });

  it('holds still under Reduce Motion', () => {
    reanimated.useReducedMotion = () => true;
    expect(sweeps()).toBe(0);
  });

  it('is the one the Lobby\'s plate draws, and the Reel keeps no copy of its own', () => {
    const root = join(__dirname, '..', '..', '..', '..');
    const lobby = 'app/(tabs)/index.tsx';
    expect(`${lobby}: ${/import \{ BrassSheen \} from '@\/src\/components\/theme\/BrassSheen'/.test(readFileSync(join(root, lobby), 'utf8'))}`).toBe(`${lobby}: true`);
    expect(readFileSync(join(root, 'src/components/reels/ReelsCards.tsx'), 'utf8')).not.toMatch(/Sheen = memo/);
  });
});
