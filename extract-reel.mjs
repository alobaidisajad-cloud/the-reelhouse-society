import sharp from 'sharp';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const inputPath = path.join(__dirname, 'public/reelhouse-logo-master.png');
const outputPath = path.join(__dirname, 'public/rating-reel.png');

async function extractReel() {
  const metadata = await sharp(inputPath).metadata();
  console.log(`Input size: ${metadata.width}x${metadata.height}`);
  
  // The full logo is 1024x1024. The reel in the center is approx 1/3 of the width.
  // We'll crop a 360x360 square from the absolute center.
  const width = Math.floor(metadata.width * 0.35);
  const left = Math.floor(metadata.width / 2 - width / 2);
  const top = Math.floor(metadata.height / 2 - width / 2);
  
  await sharp(inputPath)
    .extract({ width, height: width, left, top })
    .toFile(outputPath);
    
  console.log(`Saved rating reel to ${outputPath}`);
}

extractReel().catch(console.error);
