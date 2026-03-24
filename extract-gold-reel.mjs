import sharp from 'sharp';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const inputPath = path.join(__dirname, 'public/reelhouse-logo-master.png');
const outputPath = path.join(__dirname, 'public/rating-reel.png');

async function processImage() {
    const { data, info } = await sharp(inputPath).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const { width, height, channels } = info;
    
    const cropSize = Math.floor(width * 0.35); 
    const cx = Math.floor(width / 2);
    const cy = 130 + Math.floor(cropSize / 2);
    const radius = Math.floor(cropSize / 2) + 1; // Exactly the reel size
    
    let keptPixels = 0;
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const idx = (y * width + x) * channels;
            const r = data[idx];
            const g = data[idx+1];
            const b = data[idx+2];
            
            const dist = Math.hypot(x - cx, y - cy);
            const lum = (r + g + b) / 3;
            
            if (dist > radius || lum < 40) {
                // Erase black ink and everything outside the perfect reel circle
                data[idx+3] = 0; 
            } else {
                keptPixels++;
            }
        }
    }
    
    console.log(`Kept ${keptPixels} pure gold pixels.`);

    // Output transparent PNG directly
    await sharp(data, { raw: info })
        .extract({ width: cropSize, height: cropSize, left: cx - Math.floor(cropSize/2), top: cy - Math.floor(cropSize/2) })
        .png()
        .toFile(outputPath);
        
    console.log(`Saved pure gold transparent reel to ${outputPath}`);
}

processImage().catch(console.error);
