const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const slides = [
  {
    slideNum: 1,
    bgImagePath: null,
    tagText: '[ INCIDENT REPORT NO. 92 ]',
    title: 'The Construct is Leaking',
    subtitle: 'Early projections intercepted.',
    quote: 'Please remain seated.'
  },
  {
    slideNum: 2,
    bgImagePath: path.resolve(process.env.USERPROFILE, 'OneDrive', 'Desktop', 'reelhouse post', 'reelhouse app 1.jpg').replace(/\\/g, '/'),
    tagText: 'PROJECTION NO. 01',
    title: 'I. The Lobby',
    subtitle: 'The weekly feature. Decreed by the Committee.',
    quote: 'They have not been wrong since 1924. Allegedly.'
  },
  {
    slideNum: 3,
    bgImagePath: path.resolve(process.env.USERPROFILE, 'OneDrive', 'Desktop', 'reelhouse post', 'reelhouse app 2.jpg').replace(/\\/g, '/'),
    tagText: 'PROJECTION NO. 02',
    title: 'II. The Reel',
    subtitle: 'The living record. Submit your logs.',
    quote: 'We archive all of your cinematic opinions. Even the incorrect ones.'
  },
  {
    slideNum: 4,
    bgImagePath: path.resolve(process.env.USERPROFILE, 'OneDrive', 'Desktop', 'reelhouse post', 'reelhouse app 3.jpg').replace(/\\/g, '/'),
    tagText: 'PROJECTION NO. 03',
    title: 'III. The Darkroom',
    subtitle: 'The discovery archives. Develop a film by mood.',
    quote: 'We have cataloged every known human emotion. Most of them are tragic.'
  },
  {
    slideNum: 5,
    bgImagePath: path.resolve(process.env.USERPROFILE, 'OneDrive', 'Desktop', 'reelhouse post', 'reelhouse app 4.jpg').replace(/\\/g, '/'),
    tagText: 'PROJECTION NO. 04',
    title: 'IV. The Details',
    subtitle: 'The complete dossier. Director, cast, story, and reviews.',
    quote: 'We read the plot. We read the reviews. We judge both.'
  }
];

(async () => {
  const browser = await chromium.launch();
  const context = await browser.newContext({
    deviceScaleFactor: 2,
  });
  const page = await context.newPage();
  
  await page.setViewportSize({ width: 1080, height: 1080 });
  
  const htmlPath = `file:///${path.resolve(__dirname, 'carousel.html').replace(/\\/g, '/')}`;
  
  for (const slide of slides) {
    console.log(`Generating slide ${slide.slideNum}...`);
    
    await page.goto(htmlPath, { waitUntil: 'networkidle' });
    
    const bgUrl = slide.bgImagePath ? `file:///${encodeURI(slide.bgImagePath)}` : null;
    
    await page.evaluate(({ slideNum, bgImagePath, tagText, title, subtitle, quote }) => {
      window.setSlideData(slideNum, bgImagePath, tagText, title, subtitle, quote);
    }, {
      slideNum: slide.slideNum,
      bgImagePath: bgUrl,
      tagText: slide.tagText,
      title: slide.title,
      subtitle: slide.subtitle,
      quote: slide.quote
    });
    
    // Wait for styles, fonts, and background image to render
    await page.waitForTimeout(2000);
    
    const outPath = path.resolve(process.env.USERPROFILE, 'OneDrive', 'Desktop', 'reelhouse post', `carousel_slide_${slide.slideNum}.png`);
    await page.screenshot({ path: outPath });
    console.log(`Saved ${outPath}`);
  }
  
  await browser.close();
})();
