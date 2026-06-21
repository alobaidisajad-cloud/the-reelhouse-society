import { chromium } from 'playwright';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

(async () => {
  console.log("🎬 Booting ReelHouse Video Recording Engine...");
  
  const browser = await chromium.launch();
  const context = await browser.newContext({
    recordVideo: {
      dir: './',
      size: { width: 1080, height: 1080 }
    },
    viewport: { width: 1080, height: 1080 },
    deviceScaleFactor: 2
  });

  const page = await context.newPage();
  const fileUrl = 'file://' + path.resolve(__dirname, '../public/social/slide-tiers-poster.html');
  
  console.log("📽️ Loading the Tiers classification poster...");
  await page.goto(fileUrl);
  
  console.log("🎞️ Recording 10 seconds of animated sunburst glory...");
  await new Promise(resolve => setTimeout(resolve, 10000));
  
  console.log("🎞️ Processing final video...");
  const videoPath = await page.video().path();
  
  await context.close();
  await browser.close();

  const finalPath = path.resolve(__dirname, '../public/social/slide-tiers-poster-animated.webm');
  if (fs.existsSync(finalPath)) {
    fs.unlinkSync(finalPath);
  }
  fs.renameSync(videoPath, finalPath);

  console.log("✅ SUCCESS!");
  console.log(`Your animated tiers poster is ready here: ${finalPath}`);
})();
