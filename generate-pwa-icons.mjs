import sharp from 'sharp';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function generateIcons() {
    const inputPath = path.join(__dirname, 'public/reelhouse-logo-micro.png');
    const outDir = path.join(__dirname, 'public');

    const microBuf = await sharp(inputPath).png().toBuffer();
    
    const createPWAIcon = async (size) => {
        const bg = Buffer.from(`<svg width="${size}" height="${size}"><rect width="${size}" height="${size}" fill="#0A0703" /></svg>`);
        
        const paddedLogo = await sharp(microBuf)
            .resize(Math.floor(size * 0.65), Math.floor(size * 0.65), { fit: 'contain', background: { r:0, g:0, b:0, alpha:0 } })
            .toBuffer();

        await sharp(bg)
            .composite([{ input: paddedLogo, gravity: 'center' }])
            .png()
            .toFile(path.join(outDir, `icon-${size}.png`));
    };

    await createPWAIcon(192);
    await createPWAIcon(512);

    console.log('Successfully generated PWA maskable icons');
}

generateIcons().catch(console.error);
