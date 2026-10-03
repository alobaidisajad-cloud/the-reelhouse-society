/**
 * The letter on a portrait with no photograph is the first of the name the
 * member's file shows, on every screen that draws one (the file's plate, the
 * portrait you are about to change, the Cinema DNA card): one member, one letter.
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import { portraitInitial } from '../portraitInitial';

const ROOT = join(__dirname, '..', '..', '..', '..');

describe('portraitInitial', () => {
  it('takes the name the file shows: persona, else display name, else handle', () => {
    expect(portraitInitial({ persona: 'midnight usher', display_name: 'Ada', username: 'ada' })).toBe('M');
    expect(portraitInitial({ persona: '', display_name: 'ada lovelace', username: 'zed' })).toBe('A');
    expect(portraitInitial({ persona: null, display_name: null, username: 'kane' })).toBe('K');
  });

  it('never leaves a portrait blank', () => {
    expect(portraitInitial(null)).toBe('?');
    expect(portraitInitial({})).toBe('?');
  });

  it('is the one rule: every screen that draws the letter asks it, and none works it out alone', () => {
    const askers = [
      'app/user/[username].tsx',
      'src/features/profile/EditProfileScreen.tsx',
      'src/components/profile/CinemaDNACard.tsx',
    ];
    for (const file of askers) {
      const text = readFileSync(join(ROOT, file), 'utf8');
      expect([file, text.includes('portraitInitial(')]).toEqual([file, true]);
      expect([file, /\.charAt\(0\)\.toUpperCase\(\)/.test(text)]).toEqual([file, false]);
    }
  });
});
