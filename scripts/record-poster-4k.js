import { chromium } from 'playwright';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

(async () => {
  console.log("🎬 Booting ReelHouse 4K Video Recording Engine...");
  
  const browser = await chromium.launch();
  const context = await browser.newContext({
    recordVideo: {
      dir: './',
      size: { width: 3840, height: 3840 }
    },
    viewport: { width: 1080, height: 1080 },
    deviceScaleFactor: 3840/1080
  });

  const page = await context.newPage();
  const fileUrl = 'file://' + path.resolve(__dirname, '../public/social/slide-ads-free-poster.html');
  
  console.log("📽️ Loading the propaganda poster...");
  await page.goto(fileUrl);
  
  console.log("🎞️ Recording 10 seconds of animated sunburst glory in 4K...");
  await new Promise(resolve => setTimeout(resolve, 10000));
  
  console.log("🎞️ Processing final video...");
  const videoPath = await page.video().path();
  
  await context.close();
  await browser.close();

  const finalPath = path.resolve(__dirname, '../public/social/slide-ads-free-poster-animated-4k.webm');
  if (fs.existsSync(finalPath)) {
    fs.unlinkSync(finalPath);
  }
  fs.renameSync(videoPath, finalPath);

  console.log("✅ SUCCESS!");
  console.log(`Your 4K animated poster is ready here: ${finalPath}`);
})();
