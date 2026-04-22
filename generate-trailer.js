import { chromium } from 'playwright';
import path from 'path';
import fs from 'fs';

(async () => {
  console.log("====================================================");
  console.log("     >> BOOTING PROJECTOR: THE NATIVE TRAILER <<    ");
  console.log("====================================================");
  
  const browser = await chromium.launch();
  const context = await browser.newContext({
    recordVideo: {
      dir: './',
      size: { width: 1080, height: 1920 }
    },
    viewport: { width: 1080, height: 1920 }
  });

  const page = await context.newPage();
  const htmlPath = 'file://' + path.resolve('trailer.html');
  
  console.log("Igniting celluloid sequence...");
  await page.goto(htmlPath);
  
  console.log("ROLLING... (Capturing 16s Masterpiece Trailer)");
  console.log("ACT I   - The Premise [0s]");
  await page.waitForTimeout(3500);
  
  console.log("ACT II  - The Mandate [3.5s]");
  await page.waitForTimeout(3500);
  
  console.log("ACT III - The Assault [7.0s]");
  await page.waitForTimeout(3500);
  
  console.log("ACT IV  - The Dawn    [10.5s]");
  await page.waitForTimeout(5500);

  console.log("Finalizing the nitrate dump...");
  const videoPath = await page.video().path();
  
  await context.close();
  await browser.close();

  const finalPath = path.resolve('reelhouse-masterpiece.webm');
  if (fs.existsSync(finalPath)) {
    fs.unlinkSync(finalPath);
  }
  fs.renameSync(videoPath, finalPath);

  console.log("====================================================");
  console.log("                 MASTERPIECE COMPILED               ");
  console.log("====================================================");
  console.log(`Payload saved to: ${finalPath}`);
  console.log("ACTION REQUIRED FOR AUDIO:");
  console.log("1. Send this video to your phone.");
  console.log("2. Upload to Instagram/TikTok.");
  console.log("3. Add a trending, heavy cinematic bass audio track natively in the app.");
  console.log("   (This guarantees maximum algorithm reach).");
  console.log("====================================================");
})();
