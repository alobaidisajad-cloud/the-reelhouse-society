import sharp from 'sharp';
import fs from 'fs';
import path from 'path';

const brainDir = 'C:/Users/OMEN/.gemini/antigravity/brain/1e5867db-8ee0-4d40-b90a-8f4fa7e4d6ab';
const outputFile = './public/reelhouse-logo-micro.png';

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
    const { data, info } = await sharp(filePath).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    
    // Skip small cropped reference images
    if (info.width > 150 && info.height > 150) {
      targetFile = filePath;
      targetData = data;
      targetInfo = info;
      break;
    }
  }

  if (!targetFile) {
    console.error('No main logo image found.');
    return;
  }

  console.log(`Using main logo file: ${targetFile}`);
  const data = targetData;
  const { width, height, channels } = targetInfo;

  // Create bright/dark binary map
  const isInk = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * channels;
      const luminance = 0.299 * data[idx] + 0.587 * data[idx+1] + 0.114 * data[idx+2];
      isInk[y * width + x] = luminance > 40 ? 1 : 0;
    }
  }

  // Connected Components BFS
  const visited = new Uint8Array(width * height);
  const blobs = [];

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const pIdx = y * width + x;
      if (isInk[pIdx] === 1 && visited[pIdx] === 0) {
        let blobPixels = [];
        let queue = [pIdx];
        visited[pIdx] = 1;

        let qIdx = 0;
        while(qIdx < queue.length) {
          const curr = queue[qIdx++];
          blobPixels.push(curr);
          
          const cy = Math.floor(curr / width);
          const cx = curr % width;

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

  // To make the micro mark, we only want the central eye/reel structure.
  // The eyelashes are disconnected and smaller.
  // We'll sort blobs by size and only keep the absolute largest ones.
  // If the reel is somehow separated from the eye outline, the top 2-3 blobs will definitely capture both,
  // while omitting the eyelashes because the eyelashes are much smaller individually.
  blobs.sort((a, b) => b.length - a.length);
  
  // Let's assume the main eye + reel make up the top 1 or 2 largest blobs.
  // The eyelashes are 7 separate blobs. So taking the top 1 or 2 will drop all lashes.
  // Let's print sizes to debug.
  for (let i = 0; i < Math.min(10, blobs.length); i++) {
    console.log(`Blob ${i}: ${blobs[i].length} pixels`);
  }

  // Keep any blob that is incredibly large (e.g. > 5000 pixels). 
  // An eyelash is likely around 500-1500 pixels. The main eye is likely > 20000.
  const keepMap = new Uint8Array(width * height);
  let keptCount = 0;
  for (const blob of blobs) {
    if (blob.length > 3000) { // Stricter threshold to drop lashes
      keptCount++;
      for (const p of blob) {
        keepMap[p] = 1;
      }
    }
  }
  
  console.log(`Kept ${keptCount} massive core components for the micro mark.`);

  // Write output
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const pIdx = y * width + x;
      const rgbIdx = pIdx * channels;
      
      if (keepMap[pIdx] === 1) {
        data[rgbIdx + 3] = 255; 
      } else {
        // Erase lashes and background to black
        data[rgbIdx] = 0;
        data[rgbIdx + 1] = 0;
        data[rgbIdx + 2] = 0;
        data[rgbIdx + 3] = 255;
      }
    }
  }

  // Save the micro image
  const microImage = sharp(data, {
    raw: { width, height, channels }
  });

  // Trim the black space perfectly around the eye so it scales as large as possible in a square Favicon format.
  await microImage
    .trim({ background: { r: 0, g: 0, b: 0, alpha: 255 } }) 
    .png()
    .toFile(outputFile);

  // Generate the actual favicon sizes using the trimmed micro mark
  const trimmed = await sharp(outputFile).toBuffer();
  await sharp(trimmed).resize(64, 64, { fit: 'contain', background: { r:0, g:0, b:0, alpha:1 } }).png().toFile('./public/favicon-64-micro.png');
  await sharp(trimmed).resize(32, 32, { fit: 'contain', background: { r:0, g:0, b:0, alpha:1 } }).png().toFile('./public/favicon.png'); // Primary favicon

  console.log('Done! Micro assets created.');
}

processImage().catch(console.error);
