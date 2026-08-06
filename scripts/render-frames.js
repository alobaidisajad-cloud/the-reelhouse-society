import { chromium } from 'playwright';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

(async () => {
  console.log("🎬 Booting ReelHouse Perfect Frame Renderer...");
  
  const browser = await chromium.launch();
  const page = await browser.newPage({
    viewport: { width: 1080, height: 1080 },
    deviceScaleFactor: 3840/1080 // Native 4K scale
  });

  const fileUrl = 'file://' + path.resolve(__dirname, '../public/social/slide-ads-free-poster-masterpiece.html');
  await page.goto(fileUrl);
  
  // Pause all animations so we can step through them manually
  await page.evaluate(() => {
    document.getAnimations({ subtree: true }).forEach(anim => {
      anim.pause();
    });
  });

  const fps = 30;
  const duration = 12; // 12 seconds
  const totalFrames = fps * duration;
  
  const frameDir = path.resolve(__dirname, '../frames');
  if (fs.existsSync(frameDir)) {
    fs.rmSync(frameDir, { recursive: true, force: true });
  }
  fs.mkdirSync(frameDir);

  console.log(`📸 Capturing ${totalFrames} frames at 4K resolution...`);
  
  for (let i = 0; i < totalFrames; i++) {
    await page.evaluate((timeMs) => {
      document.getAnimations({ subtree: true }).forEach(anim => {
        anim.currentTime = timeMs;
      });
    }, (i / fps) * 1000);
    
    await page.screenshot({ 
      path: path.join(frameDir, `frame_${i.toString().padStart(4, '0')}.jpg`),
      type: 'jpeg',
      quality: 95
    });
    
    // Tiny delay to let Node garbage collect and not freeze
    await new Promise(r => setTimeout(r, 10));
    
    if (i % 10 === 0) console.log(`... captured frame ${i}/${totalFrames}`);
  }

  await browser.close();
  console.log("✅ Frame extraction complete!");
})();
