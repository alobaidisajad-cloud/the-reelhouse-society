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

  if (files.length === 0) {
    console.error('No media files found!');
    return;
  }

  let targetFile = null;
  let targetData = null;
  let targetInfo = null;

  for (const file of files) {
    const filePath = path.join(brainDir, file.name);
    const { data, info } = await sharp(filePath).median(5).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    // Skip small cropped reference images
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
  const info = targetInfo;

  const { width, height, channels } = info;
  
  console.log(`Processing ${width}x${height} pixels...`);

  // Target colors
  const targetR = 197;
  const targetG = 165;
  const targetB = 90;

  for (let i = 0; i < data.length; i += channels) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    
    // Luminance
    const luminance = 0.299 * r + 0.587 * g + 0.114 * b;
    
    if (luminance > 120) {
      data[i] = targetR;
      data[i + 1] = targetG;
      data[i + 2] = targetB;
      data[i + 3] = 255;
    } else {
      data[i] = 0;
      data[i + 1] = 0;
      data[i + 2] = 0;
      data[i + 3] = 255; 
    }
  }

  console.log('Saving cleaned master image...');
  const cleanedImage = sharp(data, {
    raw: { width, height, channels }
  });

  await cleanedImage.png().toFile(outputFile);

  console.log('Generating icon sizes...');
  await cleanedImage.clone().resize(512, 512, { fit: 'contain', background: { r:0, g:0, b:0, alpha:1 } }).png().toFile('./public/icon-512.png');
  await cleanedImage.clone().resize(192, 192, { fit: 'contain', background: { r:0, g:0, b:0, alpha:1 } }).png().toFile('./public/icon-192.png');
  await cleanedImage.clone().resize(64, 64, { fit: 'contain', background: { r:0, g:0, b:0, alpha:1 } }).png().toFile('./public/icon-64.png');
  await cleanedImage.clone().resize(32, 32, { fit: 'contain', background: { r:0, g:0, b:0, alpha:1 } }).png().toFile('./public/favicon-32.png');

  console.log('Done! Assets are cleanly processed and ready.');
}

processImage().catch(console.error);
