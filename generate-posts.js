import { chromium } from '@playwright/test';
import path from 'path';

(async () => {
  console.log("Starting up the ReelHouse Archival Press (Playwright)...");
  const browser = await chromium.launch();
  const page = await browser.newPage({ 
    viewport: { width: 1080, height: 1080 } 
  });
  
  const filePath = path.resolve('final-posts.html');
  console.log(`Opening template: ${filePath}`);
  await page.goto(`file://${filePath}`, { waitUntil: 'networkidle' });
  
  const slides = await page.$$('.slide');
  console.log(`Found ${slides.length} slides to render.`);
  
  for (let i = 0; i < slides.length; i++) {
    const filename = `reelhouse-native-post-slide-${i + 1}.png`;
    await slides[i].screenshot({ path: filename });
    console.log(`Generated: ${filename}`);
  }
  
  await browser.close();
  console.log("All 5 native app posts have been successfully synthesized and saved to the root directory!");
})();
