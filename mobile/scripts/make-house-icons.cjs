/**
 * The app's icons, made from the house's official logo and nothing else.
 *
 *   node scripts/make-house-icons.cjs        (from mobile/)
 *
 * Until this, every icon in assets/images was Expo's template placeholder (a caret on a grid): the
 * home screen, Android's adaptive and themed icons, and with them every notice. Each is drawn here
 * from the official files at the repo's root (public/): the full logo (its vector, with rays) where
 * there is room, the micro cut (eye and reel, no rays, made for small sizes) where there is not.
 *
 *   icon.png                      1024, opaque: the full logo in its brass on the house's ink (iOS)
 *   android-icon-background.png   the house's ink
 *   android-icon-foreground.png   the full logo inside the adaptive icon's safe circle
 *   android-icon-monochrome.png   the same, its shape alone (Android's themed icons tint it)
 *   notification-icon.png         96, the micro cut in white on clear (Android reads its alpha)
 *
 * theAppWearsTheHouseIcon.test.ts holds the files to this: none is Expo's, each is the house's.
 */
const path = require('path');
const sharp = require('sharp');

const MOBILE = path.join(__dirname, '..');
const OUT = path.join(MOBILE, 'assets', 'images');
const SVG = path.join(MOBILE, '..', 'public', 'reelhouse-logo.svg');
const MICRO = path.join(MOBILE, '..', 'public', 'reelhouse-logo-micro.png');
/** The house's ink, the app's ground (colors.ink). */
const INK = { r: 0x0d, g: 0x0b, b: 0x09, alpha: 1 };
const CLEAR = { r: 0, g: 0, b: 0, alpha: 0 };

/** The full logo drawn `side` px square, from its vector. */
async function logo(side) {
  const { width } = await sharp(SVG).metadata();
  return sharp(SVG, { density: Math.ceil((72 * side) / width) + 1 })
    .resize(side, side, { fit: 'contain', background: CLEAR }).png().toBuffer();
}

/** An image's shape alone, in one colour: every pixel `rgb`, its alpha kept. */
async function shapeIn(buffer, rgb) {
  const { data, info } = await sharp(buffer).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  for (let i = 0; i < data.length; i += 4) { [data[i], data[i + 1], data[i + 2]] = rgb; }
  return sharp(data, { raw: info }).png().toBuffer();
}

/** `img` centred on a `size` canvas of `ground`. */
const centred = (size, ground, img) => sharp({ create: { width: size, height: size, channels: 4, background: ground } })
  .composite([{ input: img, gravity: 'center' }]);

async function main() {
  // iOS: opaque. The logo at 72% of the square leaves the corner rounding its margin.
  await centred(1024, INK, await logo(Math.round(1024 * 0.72))).flatten({ background: INK }).png().toFile(path.join(OUT, 'icon.png'));
  // Android adaptive: 108dp drawn at 512; the safe circle is 66dp (61%), the logo inside it at 56%.
  const fore = await logo(Math.round(512 * 0.56));
  await sharp({ create: { width: 512, height: 512, channels: 4, background: INK } }).png().toFile(path.join(OUT, 'android-icon-background.png'));
  await centred(512, CLEAR, fore).png().toFile(path.join(OUT, 'android-icon-foreground.png'));
  await centred(512, CLEAR, await shapeIn(fore, [255, 255, 255])).png().toFile(path.join(OUT, 'android-icon-monochrome.png'));
  // The notice icon: the micro cut sits on solid black, so its shape is its brightness.
  const micro = await sharp(MICRO).trim({ background: '#000000', threshold: 24 }).toBuffer();
  const { data, info } = await sharp(micro).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  for (let i = 0; i < data.length; i += 4) {
    const lum = Math.max(data[i], data[i + 1], data[i + 2]);
    data[i + 3] = Math.min(255, Math.round(lum * 1.4));
    data[i] = 255; data[i + 1] = 255; data[i + 2] = 255;
  }
  const mark = await sharp(data, { raw: info }).resize(80, 80, { fit: 'contain', background: CLEAR }).png().toBuffer();
  await centred(96, CLEAR, mark).png().toFile(path.join(OUT, 'notification-icon.png'));
  console.log('icon.png, android-icon-{background,foreground,monochrome}.png, notification-icon.png written from the official logo');
}

main().catch((e) => { console.error(e); process.exit(1); });
