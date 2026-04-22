import { chromium } from 'playwright';
import path from 'path';
import fs from 'fs';

(async () => {
  console.log("====================================================");
  console.log(">> BOOTING REELHOUSE CINEMATIC RENDERING ENGINE <<");
  console.log("====================================================");
  console.log("Initializing nitrate film core...");
  
  // Launch Playwright with internal video recording enabled
  const browser = await chromium.launch();
  const context = await browser.newContext({
    recordVideo: {
      dir: './',
      size: { width: 1080, height: 1920 }
    },
    viewport: { width: 1080, height: 1920 }
  });

  const page = await context.newPage();
  const htmlPath = 'file://' + path.resolve('reel.html');
  
  console.log("Injecting 4-Stage App UI Timeline...");
  await page.goto(htmlPath);
  
  console.log("ROLLING FILM... (Recording 17 seconds of God-Tier kinetics)");
  console.log("0s  - NATIVE APP DECLASSIFIED (Intro Sequence)");
  
  await page.waitForTimeout(3000);
  console.log("3s  - Pan & Scan: LOG YOUR CINEMA");
  
  await page.waitForTimeout(3000);
  console.log("6s  - Pan & Scan: SUBMIT DOSSIERS");
  
  await page.waitForTimeout(3000);
  console.log("9s  - Pan & Scan: BUILD THE STACKS");
  
  await page.waitForTimeout(3000);
  console.log("12s - Pan & Scan: INFILTRATE THE LOUNGE");
  
  await page.waitForTimeout(3000);
  console.log("15s - ARRIVING SHORTLY (Cut to black/Outro)");
  
  await page.waitForTimeout(2000);

  // Retrieve raw generated .webm artifact
  console.log("Processing raw nitrate film...");
  const videoPath = await page.video().path();
  
  await context.close();
  await browser.close();

  // Rename to the god-tier marketing payload
  const finalPath = path.resolve('reelhouse-launch.webm');
  if (fs.existsSync(finalPath)) {
    fs.unlinkSync(finalPath);
  }
  fs.renameSync(videoPath, finalPath);

  console.log("====================================================");
  console.log("                   SUCCESS                          ");
  console.log("====================================================");
  console.log(`Your Reel is compiled: ${finalPath}`);
  console.log("The .webm file is natively accepted by Instagram and TikTok.");
  console.log("Preview it in your browser or double click it on Windows.");
  console.log("====================================================");
})();
