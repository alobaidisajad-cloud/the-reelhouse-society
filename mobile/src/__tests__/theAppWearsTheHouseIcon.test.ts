/**
 * The app wears the house's icon, on every phone and in every notice.
 *
 * Until 2026-10-30 every icon in assets/images was Expo's template placeholder, a caret on a grid:
 * the home screen, Android's adaptive and themed icons. scripts/make-house-icons.cjs draws each from
 * the official logo; this holds the files to it: each is the house's ink and brass (or the white a
 * themed icon and a notice are drawn in), none is the template's blue, and app.json uses them.
 */
import { readFileSync } from 'fs';
import { join } from 'path';

const { PNG } = require('pngjs') as { PNG: { sync: { read: (b: Buffer) => { width: number; height: number; data: Buffer } } } };

const MOBILE = join(__dirname, '..', '..');
const read = (name: string) => PNG.sync.read(readFileSync(join(MOBILE, 'assets', 'images', name)));
type Img = ReturnType<typeof read>;
/** The pixel at byte `i`, read by name (a read past the buffer throws). */
const pixel = (img: Img, i: number) => ({
  r: img.data.readUInt8(i), g: img.data.readUInt8(i + 1), b: img.data.readUInt8(i + 2), a: img.data.readUInt8(i + 3),
});
const at = (img: Img, x: number, y: number) => pixel(img, (y * img.width + x) * 4);
/** Every opaque pixel's colour, counted. */
const inks = (img: Img) => {
  const seen = { brass: 0, ink: 0, white: 0, blue: 0, other: 0, clear: 0 };
  for (let i = 0; i < img.data.length; i += 4) {
    const { r, g, b, a } = pixel(img, i);
    if (a < 16) { seen.clear++; continue; }
    if (r > 240 && g > 240 && b > 240) seen.white++;
    else if (r < 24 && g < 24 && b < 24) seen.ink++;
    else if (b > r + 40) seen.blue++;
    else if (r > g && g > b && r - b > 40) seen.brass++;
    else seen.other++;
  }
  return seen;
};
const INK = { r: 0x0d, g: 0x0b, b: 0x09, a: 255 };

describe('the icons are the house’s', () => {
  it('the app icon: the logo in brass on the house’s ink, square and whole', () => {
    const img = read('icon.png');
    expect([img.width, img.height]).toEqual([1024, 1024]);
    expect(at(img, 0, 0)).toEqual(INK);
    expect(at(img, 1023, 1023)).toEqual(INK);
    const seen = inks(img);
    expect(seen.clear).toBe(0);
    expect(seen.blue).toBe(0);
    expect(seen.brass).toBeGreaterThan(5000);
  });

  it('Android’s adaptive icon: an ink ground, the brass logo inside the safe circle', () => {
    const ground = read('android-icon-background.png');
    expect(at(ground, 0, 0)).toEqual(INK);
    expect(inks(ground)).toMatchObject({ blue: 0, brass: 0, clear: 0 });
    const fore = read('android-icon-foreground.png');
    expect(at(fore, 0, 0).a).toBe(0);
    expect(inks(fore)).toMatchObject({ blue: 0 });
    expect(inks(fore).brass).toBeGreaterThan(2000);
    // Nothing outside the 66dp safe circle of the 108dp canvas: its corners' quarter is clear.
    const edge = Math.round(fore.width * 0.2);
    const far = { x: fore.width - edge, y: fore.height - edge };
    for (const corner of [{ x: edge, y: edge }, { x: far.x, y: edge }, { x: edge, y: far.y }, far]) {
      expect(at(fore, corner.x, corner.y).a).toBe(0);
    }
  });

  it('Android’s themed icon and a notice’s: the mark’s shape alone, in white on clear', () => {
    for (const name of ['android-icon-monochrome.png', 'notification-icon.png']) {
      const seen = inks(read(name));
      expect({ name, blue: seen.blue, brass: seen.brass, ink: seen.ink }).toEqual({ name, blue: 0, brass: 0, ink: 0 });
      expect(seen.white).toBeGreaterThan(300);
      expect(seen.clear).toBeGreaterThan(seen.white);
    }
    const notice = read('notification-icon.png');
    expect([notice.width, notice.height]).toEqual([96, 96]);
  });
});

it('app.json dresses the app in them, and a notice in the house’s brass', () => {
  const expo = JSON.parse(readFileSync(join(MOBILE, 'app.json'), 'utf8')).expo;
  expect(expo.icon).toBe('./assets/images/icon.png');
  expect(expo.android.adaptiveIcon).toMatchObject({
    foregroundImage: './assets/images/android-icon-foreground.png',
    backgroundImage: './assets/images/android-icon-background.png',
    monochromeImage: './assets/images/android-icon-monochrome.png',
  });
  const notices = expo.plugins.find((p: unknown) => Array.isArray(p) && p.includes('expo-notifications')) as [string, object] | undefined;
  expect(notices?.slice(1)).toEqual([{ icon: './assets/images/notification-icon.png', color: require('@/src/theme/theme').colors.sepia }]);
});
