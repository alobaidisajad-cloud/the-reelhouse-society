import { chromium } from 'playwright';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

(async () => {
  console.log("📸 Booting ReelHouse Screenshot Engine...");
  
  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: 1080, height: 1080 },
    deviceScaleFactor: 2
  });

  const page = await context.newPage();

  const slides = [
    { file: 'slide-tier-0-cover.html', output: 'slide-tier-0-cover.png' },
    { file: 'slide-tier-1-cinephile.html', output: 'slide-tier-1-cinephile.png' },
    { file: 'slide-tier-2-archivist.html', output: 'slide-tier-2-archivist.png' },
    { file: 'slide-tier-3-auteur.html', output: 'slide-tier-3-auteur.png' }
  ];

  for (const slide of slides) {
    const fileUrl = 'file://' + path.resolve(__dirname, '../public/social/', slide.file);
    const outputPath = path.resolve(__dirname, '../public/social/', slide.output);
    
    console.log(`📽️ Capturing ${slide.file}...`);
    await page.goto(fileUrl);
    // Wait a tiny bit for fonts to render
    await page.waitForTimeout(500);
    
    await page.screenshot({ path: outputPath });
    console.log(`✅ Saved: ${slide.output}`);
  }

  await context.close();
  await browser.close();

  console.log("🎬 All slides captured successfully!");
})();
