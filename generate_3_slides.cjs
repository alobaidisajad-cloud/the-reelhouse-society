const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const inputDir = path.resolve(process.env.USERPROFILE, 'Downloads', 'Telegram Desktop', 'reelhouse post', 'reelhouse menefesto post');
const outputDir = path.join(inputDir, 'final_3_slides');
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

// Convert local image paths to file:/// URIs
const toFileUri = (fileName) => 'file:///' + path.join(inputDir, fileName).replace(/\\/g, '/');

const img1 = toFileUri('1.png');
const img2 = toFileUri('2.jpg');
const img3 = toFileUri('3.jpg');
const logo = toFileUri('logo transparent.png');

const slidesData = [
  {
    num: 1,
    titleWhite: "THE REELHOUSE",
    titleGold: "SOCIETY",
    content: `
      <div class="manifesto-intro">A secret fellowship for the devoted cinephile.</div>
      <div class="feature-block">
        <div class="feature-title">✦ THE LOBBY & THE DARKROOM</div>
        <div class="feature-desc">Track every screening. Discover films away from algorithmic gaze in the Darkroom. See what the Society is watching.</div>
      </div>
      <div class="feature-block">
        <div class="feature-title">✦ THE LOUNGE</div>
        <div class="feature-desc">Public discourse and private gatherings. Step into the hallway of curated salons where true film debate lives.</div>
      </div>
      <div class="feature-block">
        <div class="feature-title">✦ THE STACKS & DATA IMPORT</div>
        <div class="feature-desc">Your private ledger, watchlist, and custom lists. Seamlessly import your entire cinematic history from any other tracking app in seconds.</div>
      </div>
    `,
    img: img1
  },
  {
    num: 2,
    titleWhite: "THE RANKS",
    titleGold: "& ARCHIVES",
    content: `
      <div class="feature-block">
        <div class="feature-title">I. CINEPHILE</div>
        <div class="feature-desc">The foundation of the house. Access the Lobby, log your films, and build your digital Stacks.</div>
      </div>
      <div class="feature-block">
        <div class="feature-title">II. ARCHIVIST</div>
        <div class="feature-desc">Unlock <b>The Vault</b> to track your physical media collection (Blu-Rays, VHS, Criterion) and <b>The Viewing Calendar</b> to visualize your nightly attendance record. Enter the exclusive Lounge.</div>
      </div>
      <div class="feature-block">
        <div class="feature-title">III. AUTEUR</div>
        <div class="feature-desc">Ascend to true mastery. Unlock <b>The Cinematic Passport</b> (stamps of a lifetime), <b>The Projector Room</b> (deep global analytics), and your unique <b>Taste DNA</b> fingerprint.</div>
      </div>
    `,
    img: img2
  },
  {
    num: 3,
    titleWhite: "THE",
    titleGold: "PROMISE",
    content: `
      <div class="promise-large">NO ADS. EVER.</div>
      <div class="promise-desc">
        Cinema is not a product. We believe that members should pay for a deeper, more profound cinematic experience—not just to remove algorithmic distractions. Our house is built on passion, not corporate data mining.
      </div>
      <div class="status-block">
        <div class="status-title">✦ CURRENTLY IN CLOSED TESTING ✦</div>
        <div class="status-desc">The doors will open soon.</div>
      </div>
      <div class="cta-large">
        Help build the house, join the society.
      </div>
    `,
    img: img3
  }
];

const generateHtml = (slide) => `
<!DOCTYPE html>
<html>
<head>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Courier+Prime:ital,wght@0,400;0,700;1,400;1,700&display=swap');
  
  @font-face {
    font-family: 'Rye';
    src: url('https://fonts.gstatic.com/s/rye/v21/wbU6N-EJN-v_pzs.woff2') format('woff2');
  }

  body {
    margin: 0;
    padding: 0;
    width: 1080px;
    height: 1350px;
    background-color: #0A0A0A;
    background-image: radial-gradient(circle at 50% 50%, #151515 0%, #050505 100%);
    color: #F5F5DC;
    font-family: 'Courier Prime', monospace;
    display: flex;
    flex-direction: column;
    box-sizing: border-box;
    overflow: hidden;
    position: relative;
  }

  /* Grain overlay */
  body::before {
    content: "";
    position: absolute;
    top: 0; left: 0; right: 0; bottom: 0;
    background-image: url('data:image/svg+xml;utf8,<svg viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg"><filter id="noiseFilter"><feTurbulence type="fractalNoise" baseFrequency="0.65" numOctaves="3" stitchTiles="stitch"/></filter><rect width="100%" height="100%" filter="url(%23noiseFilter)"/></svg>');
    opacity: 0.04;
    pointer-events: none;
    z-index: 100;
  }

  .header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 50px 70px;
    border-bottom: 1px solid rgba(184, 137, 26, 0.3);
  }

  .logo {
    height: 60px;
    opacity: 0.9;
  }

  .slide-number {
    font-family: 'Rye', serif;
    font-size: 36px;
    color: #B8891A;
    letter-spacing: 2px;
  }

  .main-content {
    display: flex;
    flex-direction: column;
    padding: 60px 70px;
    flex: 1;
    z-index: 2;
  }

  .title-wrapper {
    margin-bottom: 50px;
  }

  h1 {
    font-family: 'Rye', serif;
    font-size: 80px;
    margin: 0;
    line-height: 1;
    text-transform: uppercase;
    text-shadow: 2px 4px 10px rgba(0,0,0,0.8);
  }

  .gold-text {
    color: #B8891A;
  }

  .white-text {
    color: #F5F5DC;
  }

  .content-wrapper {
    display: flex;
    flex: 1;
    gap: 50px;
  }

  .text-column {
    flex: 1.2;
    display: flex;
    flex-direction: column;
    justify-content: center;
  }

  .image-column {
    flex: 0.8;
    display: flex;
    align-items: center;
    justify-content: center;
    position: relative;
  }

  .image-column img {
    width: 100%;
    max-height: 800px;
    object-fit: cover;
    border-radius: 4px;
    border: 1px solid rgba(184, 137, 26, 0.4);
    box-shadow: 0 20px 50px rgba(0,0,0,0.6), 0 0 30px rgba(184, 137, 26, 0.15);
  }

  /* Specific typography styles */
  .manifesto-intro {
    font-size: 24px;
    font-style: italic;
    color: #B8891A;
    margin-bottom: 40px;
    line-height: 1.4;
  }

  .feature-block {
    margin-bottom: 35px;
    padding-left: 20px;
    border-left: 2px solid rgba(184, 137, 26, 0.5);
  }

  .feature-title {
    font-family: 'Rye', serif;
    font-size: 26px;
    color: #E2CD9D;
    margin-bottom: 10px;
    letter-spacing: 1px;
  }

  .feature-desc {
    font-size: 20px;
    line-height: 1.5;
    color: #CCCCCC;
  }

  .feature-desc b {
    color: #B8891A;
    font-weight: bold;
  }

  .promise-large {
    font-family: 'Rye', serif;
    font-size: 55px;
    color: #B8891A;
    margin-bottom: 30px;
    text-shadow: 0 0 20px rgba(184, 137, 26, 0.3);
  }

  .promise-desc {
    font-size: 24px;
    line-height: 1.6;
    color: #E2CD9D;
    margin-bottom: 60px;
    font-style: italic;
  }

  .status-block {
    text-align: center;
    margin-bottom: 60px;
    padding: 30px;
    background-color: rgba(184, 137, 26, 0.05);
    border: 1px solid rgba(184, 137, 26, 0.2);
    border-radius: 4px;
  }

  .status-title {
    font-family: 'Rye', serif;
    font-size: 28px;
    color: #B8891A;
    margin-bottom: 15px;
  }

  .status-desc {
    font-size: 22px;
    color: #CCCCCC;
  }

  .cta-large {
    font-family: 'Rye', serif;
    font-size: 40px;
    color: #F5F5DC;
    text-align: center;
    padding: 20px;
    border-top: 1px solid rgba(184, 137, 26, 0.3);
    border-bottom: 1px solid rgba(184, 137, 26, 0.3);
    text-shadow: 0 0 10px rgba(184, 137, 26, 0.5);
  }

</style>
</head>
<body>
  <div class="header">
    <img src="${logo}" class="logo" />
    <div class="slide-number">0${slide.num}</div>
  </div>
  
  <div class="main-content">
    <div class="title-wrapper">
      <h1 class="white-text">${slide.titleWhite}</h1>
      <h1 class="gold-text">${slide.titleGold}</h1>
    </div>
    
    <div class="content-wrapper">
      <div class="text-column">
        ${slide.content}
      </div>
      <div class="image-column">
        <img src="${slide.img}" />
      </div>
    </div>
  </div>
</body>
</html>
`;

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1080, height: 1350 } });

  for (const slide of slidesData) {
    console.log(`Rendering Slide ${slide.num}...`);
    const html = generateHtml(slide);
    await page.setContent(html, { waitUntil: 'networkidle' });
    await page.waitForTimeout(500); // Wait for fonts to be perfectly smooth
    const outPath = path.join(outputDir, `manifesto_slide_v2_${slide.num}.png`);
    await page.screenshot({ path: outPath });
    console.log(`Saved: ${outPath}`);
  }

  await browser.close();
  console.log('All slides rendered successfully.');
})();
