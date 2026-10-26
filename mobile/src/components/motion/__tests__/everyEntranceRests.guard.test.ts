/**
 * A view that starts invisible comes to rest on a plain style.
 *
 * A shared value born at 0 that draws a view's opacity hides that view until its animated style
 * reaches it, and one can fail to (the film tray, Sealed E2E run 38790116312: open, and nothing of
 * it on the screen). So each such view rests on a plain style once its motion is past (ARRIVED,
 * IGNITED, SHOWN, risen), or is listed here with why it may stay hidden at rest. A new one is
 * neither until someone decides which, and says so below.
 */
import { readFileSync } from 'fs';
import { join, relative, sep } from 'path';
import { MOBILE } from '@/test-utils/readCode';
import { files as universe } from '@/test-utils/universe';

/** Each file holding such a view: the plain style it rests on (found in the file), or why it needn't. */
const REGISTER: Record<string, { rests: string } | { why: string }> = {
  'src/hooks/useArrival.ts': { rests: 'IGNITED' },
  'src/components/Buster.tsx': { rests: 'SHOWN' },
  'src/components/film/FilmActionTray.tsx': { rests: 'RISEN_SCRIM' },
  'src/components/layout/ConciergeButton.tsx': { rests: 'risen ?' },
  'app/person/[id].tsx': { why: 'its header fades in as the page scrolls, and is hidden at rest by design' },
  'app/stacks/[id].tsx': { why: 'its header fades in as the page scrolls, and is hidden at rest by design' },
  'src/features/settings/SettingsScreen.tsx': { why: 'its header title fades in as the page scrolls, and is hidden at rest by design' },
  'src/components/feed/ActivityCard.tsx': { why: 'the card’s back, hidden until it is turned' },
  'src/components/log/LogAtmosphere.tsx': { why: 'a wash of light behind the form, with nothing in it to read' },
  'src/components/Preloader.tsx': { why: 'the countdown’s digits come and go, and the splash itself ends' },
  'src/components/auth/SocietySeal.tsx': { why: 'the sheen is one glint across the mark, gone at rest; the mark rests on IGNITED' },
};

/** Each file, as `path: values`, whose view's opacity is drawn from a shared value born at 0. */
function hiddenAtBirth(files: string[]): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const file of files) {
    const text = readFileSync(file, 'utf8');
    const born = [...text.matchAll(/const (\w+) = useSharedValue\(0\)/g)].map((m) => m[1] ?? '');
    if (!born.length) continue;
    const styles = [...text.matchAll(/useAnimatedStyle\(\(\) => \(?\{([\s\S]*?)\}\)?\)/g)].map((m) => m[1] ?? '');
    const hidden = born.filter((v) => styles.some((s) => new RegExp(`opacity:[^,}]*\\b${v}\\.value`).test(s)));
    if (hidden.length) out[relative(MOBILE, file).split(sep).join('/')] = [...new Set(hidden)];
  }
  return out;
}

it('every view born invisible rests on a plain style, or is registered as hidden at rest', () => {
  const files = universe('appCode').filter((f) => !f.endsWith('.d.ts'));
  // A walker that read nothing would pass while proving nothing.
  expect(files.length).toBeGreaterThanOrEqual(440);
  const found = hiddenAtBirth(files);
  expect(Object.keys(found).sort()).toEqual(Object.keys(REGISTER).sort());
  for (const [file, entry] of Object.entries(REGISTER)) {
    if ('rests' in entry) expect([file, readFileSync(join(MOBILE, file), 'utf8').includes(entry.rests)]).toEqual([file, true]);
  }
});

it('says NO to a view born invisible, and passes one born seen', () => {
  const fixture = join(__dirname, 'fixtures', 'hiddenAtBirth.fixture.tsx');
  expect(hiddenAtBirth([fixture])).toEqual({ 'src/components/motion/__tests__/fixtures/hiddenAtBirth.fixture.tsx': ['shown'] });
});
