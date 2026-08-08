import { chromium } from 'playwright';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

(async () => {
  console.log("🎬 Booting ReelHouse 4K Video Recording Engine (Masterpiece Edition)...");
  
  const browser = await chromium.launch();
  const context = await browser.newContext({
    recordVideo: {
      dir: './',
      size: { width: 3840, height: 3840 }
    },
    viewport: { width: 3840, height: 3840 }
  });

  const page = await context.newPage();
  const fileUrl = 'file://' + path.resolve(__dirname, '../public/social/slide-ads-free-poster-masterpiece.html');
  
  console.log("📽️ Loading the masterpiece poster...");
  await page.goto(fileUrl);
  
  // Scale the 1080p canvas to fit the 4K viewport perfectly
  await page.evaluate(() => {
    document.body.style.width = '3840px';
    document.body.style.height = '3840px';
    const canvas = document.querySelector('.canvas');
    if (canvas) {
      canvas.style.transform = `scale(${3840/1080})`;
      canvas.style.transformOrigin = 'top left';
    }
  });
  
  console.log("🎞️ Recording 12 seconds of animated masterpiece glory in 4K...");
  await new Promise(resolve => setTimeout(resolve, 12000));
  
  console.log("🎞️ Processing final video...");
  const videoPath = await page.video().path();
  
  await context.close();
  await browser.close();

  const finalPath = path.resolve(__dirname, '../public/social/slide-ads-free-poster-animated-masterpiece.webm');
  if (fs.existsSync(finalPath)) {
    fs.unlinkSync(finalPath);
  }
  fs.renameSync(videoPath, finalPath);

  console.log("✅ SUCCESS!");
  console.log(`Your 4K animated masterpiece is ready here: ${finalPath}`);
})();
