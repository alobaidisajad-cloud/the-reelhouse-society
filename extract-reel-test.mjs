import sharp from 'sharp';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const inputPath = path.join(__dirname, 'public/reelhouse-logo-master.png');

async function testCrops() {
  const metadata = await sharp(inputPath).metadata();
  const w = metadata.width;
  const h = metadata.height;
  
  const cropSize = Math.floor(w * 0.35); // Approx 134
  const left = Math.floor(w / 2 - cropSize / 2); // Centered horizontally
  
  let html = '<html><body style="background: black; color: white;"><h1>Crops</h1><div style="display:flex; flex-wrap:wrap; gap:10px;">';
  
  // The height is 395. We will test different "top" values from 0 to 150
  for (let top = 0; top <= 200; top += 10) {
    const outName = `crop_top_${top}.png`;
    const outPath = path.join(__dirname, 'public', outName);
    
    await sharp(inputPath)
      .extract({ width: cropSize, height: cropSize, left, top })
      .toFile(outPath);
      
    html += `<div><img src="${outName}" style="border:1px solid red; background:#111"/><br/>top: ${top}</div>`;
  }
  
  html += '</div></body></html>';
  fs.writeFileSync(path.join(__dirname, 'public/crop-test.html'), html);
  console.log('Done generating crops.');
}

testCrops().catch(console.error);
