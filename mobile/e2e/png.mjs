/**
 * png.mjs — a PNG read into its pixels, for the E2E judges that look at a capture
 * (e2e/grounds-judges.mjs). Node's own zlib only: the captures are Android's screencap, 8-bit
 * RGB or RGBA, not interlaced, and anything else is refused by name rather than misread.
 */
import { Buffer } from 'node:buffer';
import { inflateSync } from 'node:zlib';

const SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/** The Paeth predictor of the PNG filters. */
function paeth(a, b, c) {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
}

/** Width, height and RGBA pixels (4 bytes each, row after row) of a PNG's bytes. */
export function decodePng(bytes) {
  if (!bytes.subarray(0, 8).equals(SIGNATURE)) throw new Error('not a PNG');
  let at = 8;
  let header = null;
  const data = [];
  while (at < bytes.length) {
    const length = bytes.readUInt32BE(at);
    const type = bytes.toString('latin1', at + 4, at + 8);
    const body = bytes.subarray(at + 8, at + 8 + length);
    if (type === 'IHDR') header = { width: body.readUInt32BE(0), height: body.readUInt32BE(4), depth: body[8], color: body[9], interlace: body[12] };
    else if (type === 'IDAT') data.push(body);
    else if (type === 'IEND') break;
    at += 12 + length;
  }
  if (!header) throw new Error('a PNG with no header');
  const { width, height, depth, color, interlace } = header;
  if (depth !== 8 || (color !== 2 && color !== 6) || interlace !== 0) {
    throw new Error(`a PNG this reader does not take: depth ${depth}, colour type ${color}, interlace ${interlace}`);
  }
  const channels = color === 6 ? 4 : 3;
  const stride = width * channels;
  const raw = inflateSync(Buffer.concat(data));
  if (raw.length < height * (stride + 1)) throw new Error('a PNG cut short');
  const rows = Buffer.alloc(height * stride);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    const line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    for (let x = 0; x < stride; x++) {
      const a = x >= channels ? rows[y * stride + x - channels] : 0;
      const b = y > 0 ? rows[(y - 1) * stride + x] : 0;
      const c = x >= channels && y > 0 ? rows[(y - 1) * stride + x - channels] : 0;
      const v = line[x];
      const out = filter === 0 ? v : filter === 1 ? v + a : filter === 2 ? v + b : filter === 3 ? v + ((a + b) >> 1) : filter === 4 ? v + paeth(a, b, c) : -1;
      if (out < 0) throw new Error(`a PNG row with filter ${filter}`);
      rows[y * stride + x] = out & 0xff;
    }
  }
  if (channels === 4) return { width, height, pixels: rows };
  const pixels = Buffer.alloc(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    pixels[i * 4] = rows[i * 3];
    pixels[i * 4 + 1] = rows[i * 3 + 1];
    pixels[i * 4 + 2] = rows[i * 3 + 2];
    pixels[i * 4 + 3] = 255;
  }
  return { width, height, pixels };
}
