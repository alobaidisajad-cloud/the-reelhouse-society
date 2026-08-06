const { chromium } = require('playwright');
const path = require('path');

(async () => {
  const browser = await chromium.launch();
  const context = await browser.newContext({
    deviceScaleFactor: 2, // High resolution
  });
  const page = await context.newPage();
  
  // Set viewport to Instagram portrait dimensions
  await page.setViewportSize({ width: 1080, height: 1080 });
  
  // Get absolute path to the HTML file
  const filePath = `file://${path.resolve(__dirname, 'post.html')}`;
  
  await page.goto(filePath, { waitUntil: 'networkidle' });
  
  // Give it a small delay for fonts to render
  await page.waitForTimeout(1000);
  
  const outPath = path.resolve(process.env.USERPROFILE, 'OneDrive', 'Desktop', 'reelhouse post', 'lore_teaser.png');
  await page.screenshot({ path: outPath });
  
  console.log(`Saved screenshot to: ${outPath}`);
  
  await browser.close();
})();
