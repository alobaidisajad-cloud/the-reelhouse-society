import { chromium } from 'playwright';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({
    viewport: { width: 1080, height: 1080 },
    deviceScaleFactor: 2
  });
  
  const fileUrl = 'file://' + path.resolve(__dirname, '../public/social/slide-ads-free-poster.html');
  await page.goto(fileUrl);
  
  // Wait a bit for fonts to load
  await new Promise(resolve => setTimeout(resolve, 1000));
  
  await page.screenshot({ path: path.resolve(__dirname, '../public/social/slide-ads-free-poster.png') });
  
  await browser.close();
})();
