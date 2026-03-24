const sharp = require('sharp');
const path = require('path');

const inputPath = path.join(__dirname, 'public/reelhouse-logo-master.png');
const artifactDir = 'C:\\Users\\OMEN\\.gemini\\antigravity\\brain\\1e5867db-8ee0-4d40-b90a-8f4fa7e4d6ab';
const outputPath = path.join(artifactDir, 'rating-reel-crop.png');

async function extractReel() {
  const metadata = await sharp(inputPath).metadata();
  
  // Try a central crop first:
  const width = Math.floor(metadata.width * 0.35);
  const left = Math.floor(metadata.width / 2 - width / 2);
  const top = Math.floor(metadata.height * 0.40); // Reel is slightly above true center relative to full 1024 canvas
  
  await sharp(inputPath)
    .extract({ width, height: width, left, top })
    .toFile(outputPath);
    
  console.log(`Extracted crop to ${outputPath}`);
}

extractReel().catch(console.error);
