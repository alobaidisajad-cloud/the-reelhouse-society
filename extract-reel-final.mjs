import sharp from 'sharp';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const inputPath = path.join(__dirname, 'public/reelhouse-logo-master.png');
const outputPath = path.join(__dirname, 'public/rating-reel.png');

async function extractReel() {
  const metadata = await sharp(inputPath).metadata();
  const w = metadata.width;
  
  const cropSize = Math.floor(w * 0.35);
  const left = Math.floor(w / 2 - cropSize / 2);
  const top = 130; // Visually verified perfect center
  
  await sharp(inputPath)
    .extract({ width: cropSize, height: cropSize, left, top })
    .toFile(outputPath);
    
  console.log(`Saved perfect rating reel crop to ${outputPath}`);
}

extractReel().catch(console.error);
