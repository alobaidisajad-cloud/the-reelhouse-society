import sharp from 'sharp';
import fs from 'fs';
import path from 'path';

const brainDir = 'C:/Users/OMEN/.gemini/antigravity/brain/1e5867db-8ee0-4d40-b90a-8f4fa7e4d6ab';
const outputFile = './public/reelhouse-logo-master.png';

async function processImage() {
  console.log('Finding newest media file...');
  const files = fs.readdirSync(brainDir)
    .filter(f => f.startsWith('media__') && f.endsWith('.png'))
    .map(f => ({
      name: f,
      time: fs.statSync(path.join(brainDir, f)).mtime.getTime()
    }))
    .sort((a, b) => b.time - a.time);

  let targetFile = null;
  let targetData = null;
  let targetInfo = null;

  for (const file of files) {
    const filePath = path.join(brainDir, file.name);
    // Read raw pixels exactly as they are without any median/blur filters
    const { data, info } = await sharp(filePath).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    
    // Skip small cropped reference images (like the 26x100 one)
    if (info.width > 150 && info.height > 150) {
      targetFile = filePath;
      targetData = data;
      targetInfo = info;
      break;
    }
  }

  if (!targetFile) {
    console.error('No main logo image found (all files too small)!');
    return;
  }

  console.log(`Using main logo file: ${targetFile}`);
  const data = targetData;
  const { width, height, channels } = targetInfo;
  console.log(`Processing ${width}x${height} pixels...`);

  // Step 1: Create a binary map of "ink" vs "background" based on luminance.
  // We keep the threshold somewhat low so we don't accidentally thin out the smooth lines.
  const isInk = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * channels;
      const r = data[idx];
      const g = data[idx+1];
      const b = data[idx+2];
      const luminance = 0.299 * r + 0.587 * g + 0.114 * b;
      
      // If bright enough, mark as ink
      if (luminance > 40) {
        isInk[y * width + x] = 1;
      } else {
        isInk[y * width + x] = 0;
      }
    }
  }

  // Step 2: Connected Components Analysis (BFS) to find blobs of ink
  const visited = new Uint8Array(width * height);
  const blobs = [];

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const pIdx = y * width + x;
      // If it's ink and we haven't visited it yet, it's a new blob
      if (isInk[pIdx] === 1 && visited[pIdx] === 0) {
        let blobPixels = [];
        let queue = [pIdx];
        visited[pIdx] = 1;

        let qIdx = 0;

        // BFS to find all connected pixels in this blob
        while(qIdx < queue.length) {
          const curr = queue[qIdx++];
          blobPixels.push(curr);
          
          const cy = Math.floor(curr / width);
          const cx = curr % width;

          // Check 8-way neighbors
          for (let dy = -1; dy <= 1; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
              if (dx === 0 && dy === 0) continue;
              const ny = cy + dy;
              const nx = cx + dx;
              
              if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
                const nIdx = ny * width + nx;
                if (isInk[nIdx] === 1 && visited[nIdx] === 0) {
                  visited[nIdx] = 1;
                  queue.push(nIdx);
                }
              }
            }
          }
        }
        blobs.push(blobPixels);
      }
    }
  }

  // Step 3: Delete small blobs (stains) and keep big blobs (logo lines)
  // A tiny stain might be a few pixels. The main lines will be hundreds or thousands.
  // We'll set a strict threshold: keep only blobs larger than 50 pixels.
  // This will obliterate the tiny paint spatter stains effortlessly.
  console.log(`Found ${blobs.length} distinct ink groupings.`);
  
  const keepMap = new Uint8Array(width * height);
  let keptCount = 0;
  for (const blob of blobs) {
    if (blob.length > 50) {
      keptCount++;
      for (const p of blob) {
        keepMap[p] = 1;
      }
    }
  }
  console.log(`Kept ${keptCount} massive logo components, erased ${blobs.length - keptCount} tiny stains.`);

  // Step 4: Write output. Keep EXACT original colors for 'kept' ink. Wipe 'erased' stains and background to black.
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const pIdx = y * width + x;
      const rgbIdx = pIdx * channels;
      
      if (keepMap[pIdx] === 1) {
        // Keep the exact beautiful vintage color and smooth geometry!
        // We do absolutely nothing to the RGB channels.
        data[rgbIdx + 3] = 255; // Ensure opaque
      } else {
        // It's background OR an erased stain. Overwrite to pure black.
        data[rgbIdx] = 0;
        data[rgbIdx + 1] = 0;
        data[rgbIdx + 2] = 0;
        data[rgbIdx + 3] = 255;
      }
    }
  }

  console.log('Saving pristine master image...');
  const cleanedImage = sharp(data, {
    raw: { width, height, channels }
  });

  await cleanedImage.png().toFile(outputFile);

  console.log('Generating icon sizes...');
  await cleanedImage.clone().resize(512, 512, { fit: 'contain', background: { r:0, g:0, b:0, alpha:1 } }).png().toFile('./public/icon-512.png');
  await cleanedImage.clone().resize(192, 192, { fit: 'contain', background: { r:0, g:0, b:0, alpha:1 } }).png().toFile('./public/icon-192.png');
  await cleanedImage.clone().resize(64, 64, { fit: 'contain', background: { r:0, g:0, b:0, alpha:1 } }).png().toFile('./public/icon-64.png');
  await cleanedImage.clone().resize(32, 32, { fit: 'contain', background: { r:0, g:0, b:0, alpha:1 } }).png().toFile('./public/favicon-32.png');

  console.log('Done! Flawless vintage assets are ready.');
}

processImage().catch(console.error);
