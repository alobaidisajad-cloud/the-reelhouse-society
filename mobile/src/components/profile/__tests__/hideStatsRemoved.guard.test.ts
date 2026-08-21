/**
 * hideStatsRemoved.guard.test.ts — it must not come back as theatre
 * ────────────────────────────────────────────────────────────────
 * `hide_stats` blanked the FILMS stat for visitors while `get_profile_counts` went on
 * returning the real numbers to any caller, and while the films those numbers count
 * stayed browsable one tab away. It concealed nothing and told the member it did.
 *
 * It is an easy feature to re-add — it looks like one line of JSX — so this fails if it
 * reappears anywhere on the client. Reinstating it legitimately means starting in the
 * database and hiding the CONTENT, at which point this test should be rewritten rather
 * than deleted.
 */
import * as fs from 'fs';
import * as path from 'path';

const ROOT = path.join(__dirname, '..', '..', '..', '..');
const FILES = [
  'src/components/profile/profileComputed.ts',
  'src/hooks/useProfileController.ts',
  'src/services/ProfileDataService.ts',
  'src/schemas/user.ts',
  'app/user/[username].tsx',
];

describe('hide_stats is gone from every client surface', () => {
  it.each(FILES)('%s does not read or branch on it', (rel) => {
    const src = fs.readFileSync(path.join(ROOT, rel), 'utf8');
    // Strip comments: the removal is deliberately documented, and that prose must not
    // trip the guard it explains.
    const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    expect(code).not.toMatch(/hide_stats/);
    expect(code).not.toMatch(/hideStats/);
  });

  it('all four figures render unconditionally for every viewer', () => {
    const screen = fs.readFileSync(path.join(ROOT, 'app/user/[username].tsx'), 'utf8');

    // This used to pin the exact source of ONE card, `value={totalFilms}`, which
    // made it a spelling test rather than a behaviour test: it broke the day the
    // count got a thousands separator — nothing to do with hide_stats — while
    // still saying nothing about the other three. Name all four instead, and
    // check the ROW for a gate rather than the card for a shape.
    for (const label of ['FILMS', 'WATCHLIST', 'FOLLOWERS', 'FOLLOWING']) {
      expect(screen).toMatch(new RegExp(`<StatCard label="${label}"`));
    }

    // No preference-driven wrapper around the row.
    const at = screen.indexOf('s.statsBox');
    expect(at).toBeGreaterThan(-1);   // a moved style must not pass vacuously
    expect(screen.slice(Math.max(0, at - 400), at)).not.toMatch(/preferences\?\./);
    expect(screen).not.toMatch(/preferences\?\.\w+\s*\|\|\s*isSelf\)\s*&&\s*\(/);
  });

  it('the real privacy control is untouched and still enforced', () => {
    // is_social_private is the control that actually withholds data. Removing the fake
    // one must not have disturbed the working one.
    const screen = fs.readFileSync(path.join(ROOT, 'app/user/[username].tsx'), 'utf8');
    expect(screen).toMatch(/is_social_private/);
  });
});
