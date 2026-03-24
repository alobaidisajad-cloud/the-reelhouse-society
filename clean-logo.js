import sharp from 'sharp';
import fs from 'fs';

const inputFile = 'C:/Users/OMEN/.gemini/antigravity/brain/1e5867db-8ee0-4d40-b90a-8f4fa7e4d6ab/media__1774348253004.png';
const outputFile = './public/reelhouse-logo-master.png';

async function processImage() {
  console.log('Reading image...');
  // Read image and get raw pixel data
  const { data, info } = await sharp(inputFile)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const { width, height, channels } = info;
  
  console.log(`Processing ${width}x${height} pixels...`);

  // Target colors
  // ReelHouse Gold: #C5A55A -> RGB(197, 165, 90)
  const targetR = 197;
  const targetG = 165;
  const targetB = 90;

  for (let i = 0; i < data.length; i += channels) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    
    // Calculate luminance to determine if pixel is dark (background) or light (logo ink)
    // The image is a noisy dark background with yellowish ink
    // Luminance formula
    const luminance = 0.299 * r + 0.587 * g + 0.114 * b;
    
    // Threshold to separate logo lines from background stains
    // The stains are mostly dark gray/brown, the logo lines are much brighter
    if (luminance > 120) {
      // It's part of the logo -> Color it pure ReelHouse Gold
      data[i] = targetR;
      data[i + 1] = targetG;
      data[i + 2] = targetB;
      // Make it fully opaque
      data[i + 3] = 255;
    } else {
      // It's background or stain -> Color it pure Black
      data[i] = 0;
      data[i + 1] = 0;
      data[i + 2] = 0;
      data[i + 3] = 255; 
      
      // Alternatively, we could make it transparent:
      // data[i] = 0; data[i+1] = 0; data[i+2] = 0; data[i+3] = 0;
      // But the app expects a black background or we can use black for the base PNGs.
    }
  }

  // Create a new sharp image from the processed raw data
  console.log('Saving cleaned master image...');
  const cleanedImage = sharp(data, {
    raw: {
      width,
      height,
      channels
    }
  });

  // Save the master cleaned image
  await cleanedImage.png().toFile(outputFile);

  // Generate icon sizes
  console.log('Generating icon sizes...');
  await cleanedImage.clone().resize(512, 512, { fit: 'contain', background: { r:0, g:0, b:0, alpha:1 } }).png().toFile('./public/icon-512.png');
  await cleanedImage.clone().resize(192, 192, { fit: 'contain', background: { r:0, g:0, b:0, alpha:1 } }).png().toFile('./public/icon-192.png');
  await cleanedImage.clone().resize(64, 64, { fit: 'contain', background: { r:0, g:0, b:0, alpha:1 } }).png().toFile('./public/icon-64.png');
  
  // Also create a transparent version just in case
  const transData = Buffer.from(data);
  for (let i = 0; i < transData.length; i += channels) {
    if (transData[i] === 0 && transData[i+1] === 0 && transData[i+2] === 0) {
      transData[i+3] = 0; // make black pixels transparent
    }
  }
  await sharp(transData, { raw: { width, height, channels } })
    .png()
    .toFile('./public/reelhouse-logo-transparent.png');

  console.log('Done! Assets are ready in public/ directory.');
}

processImage().catch(console.error);
