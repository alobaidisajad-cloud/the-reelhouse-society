const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const inputDir = path.resolve(process.env.USERPROFILE, 'Downloads', 'Telegram Desktop', 'reelhouse post', 'reelhouse menefesto post');
const outputDir = path.join(inputDir, 'masterpiece_slides');
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

// Function to convert local file to base64 data URI
const toBase64 = (fileName, mimeType) => {
  const filePath = path.join(inputDir, fileName);
  if (!fs.existsSync(filePath)) {
    console.warn(`WARNING: File not found: ${filePath}`);
    return '';
  }
  const data = fs.readFileSync(filePath);
  return `data:${mimeType};base64,${data.toString('base64')}`;
};

// Load assets
const logoBase64 = toBase64('reelhouse-logo.svg', 'image/svg+xml');
const screenLobby = toBase64('reelhouse app 2.jpg', 'image/jpeg');
const screenDarkroom = toBase64('reelhouse app 1.jpg', 'image/jpeg');
const screenProfile = toBase64('reelhouse app 3.jpg', 'image/jpeg');
const screenFilm = toBase64('reelhouse app 4.jpg', 'image/jpeg');
const screenLounge = toBase64('our lounge create your salon and chat with friends.jpg', 'image/jpeg');
const screenImport = toBase64('import you data screenshot.jpg', 'image/jpeg');

const generateHtml = (slideContent) => `
<!DOCTYPE html>
<html>
<head>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Courier+Prime:ital,wght@0,400;0,700;1,400;1,700&display=swap');
  @import url('https://fonts.googleapis.com/css2?family=Cinzel:wght@400;600;700&display=swap');

  :root {
    --bg: #030303;
    --gold: #C09858;
    --gold-dim: rgba(192, 152, 88, 0.25);
    --gold-border: rgba(192, 152, 88, 0.4);
    --text-light: #E8E3D2;
    --text-dim: #9A927C;
  }

  body {
    margin: 0;
    padding: 0;
    width: 1080px;
    height: 1350px;
    background-color: var(--bg);
    color: var(--text-light);
    font-family: 'Courier Prime', monospace;
    box-sizing: border-box;
    overflow: hidden;
    position: relative;
    display: flex;
    flex-direction: column;
  }

  /* Noise texture for vintage film look */
  body::before {
    content: "";
    position: absolute;
    top: 0; left: 0; right: 0; bottom: 0;
    background-image: url('data:image/svg+xml;utf8,<svg viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg"><filter id="noiseFilter"><feTurbulence type="fractalNoise" baseFrequency="0.8" numOctaves="3" stitchTiles="stitch"/></filter><rect width="100%" height="100%" filter="url(%23noiseFilter)"/></svg>');
    opacity: 0.05;
    pointer-events: none;
    z-index: 100;
  }

  /* Outer ornate frame */
  .frame {
    position: absolute;
    top: 30px; left: 30px; right: 30px; bottom: 30px;
    border: 1px solid var(--gold-border);
    pointer-events: none;
    z-index: 50;
  }
  .frame::before, .frame::after {
    content: "✦";
    color: var(--gold);
    position: absolute;
    font-size: 14px;
    width: 100%;
    text-align: center;
  }
  .frame::before { top: -10px; }
  .frame::after { bottom: -10px; }

  .header {
    text-align: center;
    padding: 60px 0 30px 0;
    position: relative;
    z-index: 10;
  }

  .logo {
    height: 50px;
    margin-bottom: 20px;
    filter: invert(72%) sepia(21%) saturate(795%) hue-rotate(352deg) brightness(90%) contrast(85%);
  }

  h1 {
    font-family: 'Cinzel', serif;
    font-size: 32px;
    font-weight: 600;
    letter-spacing: 8px;
    color: var(--gold);
    margin: 0 0 10px 0;
    text-transform: uppercase;
  }

  .subtitle {
    font-size: 14px;
    letter-spacing: 4px;
    color: var(--text-dim);
    text-transform: uppercase;
  }

  .subtitle::before, .subtitle::after {
    content: " — ";
    color: var(--gold-border);
  }

  .main-content {
    flex: 1;
    padding: 0 60px 60px 60px;
    display: flex;
    flex-direction: column;
    z-index: 10;
  }

  /* Grid Layouts */
  .grid {
    display: grid;
    gap: 30px;
  }

  .grid-3-col {
    grid-template-columns: 1fr 1fr 1fr;
  }

  .grid-2-col {
    grid-template-columns: 1fr 1fr;
  }

  /* Typography blocks */
  .block-title {
    font-family: 'Cinzel', serif;
    font-size: 18px;
    color: var(--gold);
    letter-spacing: 3px;
    margin-bottom: 15px;
    text-transform: uppercase;
    border-bottom: 1px solid var(--gold-border);
    padding-bottom: 8px;
  }

  .block-text {
    font-size: 13px;
    line-height: 1.6;
    color: var(--text-dim);
  }
  
  .block-text strong {
    color: var(--text-light);
    font-weight: bold;
  }

  /* Image framing */
  .phone-mockup {
    border: 1px solid var(--gold-border);
    border-radius: 20px;
    overflow: hidden;
    position: relative;
    box-shadow: 0 10px 30px rgba(0,0,0,0.8);
    background: #000;
  }

  .phone-mockup img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
    opacity: 0.95;
  }

  .phone-mockup::after {
    content: "";
    position: absolute;
    top: 0; left: 0; right: 0; bottom: 0;
    border: 1px solid rgba(255,255,255,0.05);
    border-radius: 20px;
    pointer-events: none;
  }

  /* Slide 1 specifics */
  .s1-top-row {
    display: grid;
    grid-template-columns: 250px 1fr 250px;
    gap: 40px;
    margin-bottom: 40px;
    height: 550px;
  }

  .s1-manifesto {
    display: flex;
    flex-direction: column;
    justify-content: center;
  }

  .big-statement {
    font-family: 'Cinzel', serif;
    font-size: 32px;
    color: var(--text-light);
    line-height: 1.2;
    margin-bottom: 20px;
  }

  .gold-accent {
    color: var(--gold);
  }

  .s1-bottom-row {
    display: grid;
    grid-template-columns: 1fr 1fr 1fr;
    gap: 30px;
    border-top: 1px solid var(--gold-border);
    padding-top: 30px;
  }

  /* Slide 2 specifics */
  .s2-layout {
    display: grid;
    grid-template-columns: 1fr 350px 1fr;
    gap: 40px;
    height: 100%;
  }

  .rank-box {
    border: 1px solid var(--gold-dim);
    padding: 20px;
    margin-bottom: 20px;
    background: linear-gradient(180deg, rgba(192,152,88,0.05) 0%, transparent 100%);
  }

  .rank-number {
    font-family: 'Cinzel', serif;
    font-size: 24px;
    color: var(--gold);
    margin-bottom: 10px;
  }

  /* Slide 3 specifics */
  .s3-layout {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 40px;
    margin-bottom: 40px;
  }

  .footer-cta {
    text-align: center;
    margin-top: auto;
    padding: 40px 0;
    border-top: 1px solid var(--gold-border);
  }

  .cta-text {
    font-family: 'Cinzel', serif;
    font-size: 28px;
    color: var(--gold);
    letter-spacing: 4px;
  }
  
  .testing-badge {
    display: inline-block;
    padding: 8px 16px;
    border: 1px solid var(--gold);
    color: var(--text-light);
    font-size: 12px;
    letter-spacing: 2px;
    margin-bottom: 20px;
  }

</style>
</head>
<body>
  <div class="frame"></div>
  <div class="header">
    <img src="${logoBase64}" class="logo" />
    <h1>The Reelhouse Society</h1>
    <div class="subtitle">EST. 1924</div>
  </div>
  <div class="main-content">
    ${slideContent}
  </div>
</body>
</html>
`;

const slide1 = `
  <div class="s1-top-row">
    <div class="s1-manifesto">
      <div class="big-statement">More Than An App.<br>It's A <span class="gold-accent">Society</span>.</div>
      <div class="block-text" style="margin-bottom: 20px;">
        The Reelhouse Society is a cinematic commune built for the devoted. We don't feed algorithms. We fuel obsession.
      </div>
      <div class="block-title" style="font-size: 14px; border:none;">ZERO ALGORITHM • PURE EXPERIENCE</div>
      <div class="block-text">
        You don't use this app to pass time.<br>
        You use it to become someone who pays attention.
      </div>
    </div>
    
    <div class="phone-mockup" style="height: 600px; transform: translateY(-20px);">
      <img src="${screenLobby}" />
    </div>
    
    <div class="phone-mockup" style="height: 500px; transform: translateY(40px);">
      <img src="${screenDarkroom}" />
    </div>
  </div>

  <div class="s1-bottom-row">
    <div>
      <div class="block-title">The Lobby & The Darkroom</div>
      <div class="block-text">
        Track every screening. Discover films away from algorithmic gaze in the Darkroom. See what the Society is watching.
      </div>
    </div>
    <div>
      <div class="block-title">This Is Not Doom Scrolling</div>
      <div class="block-text">
        <ul style="padding-left: 15px; margin:0;">
          <li style="margin-bottom: 5px;">You won't lose yourself. You will find yourself.</li>
          <li style="margin-bottom: 5px;">You won't consume content. You will experience cinema.</li>
          <li>You won't be a number. You will be a member.</li>
        </ul>
      </div>
    </div>
    <div>
      <div class="block-title">The Promise</div>
      <div class="block-text" style="color: var(--text-light);">
        <strong>Zero ads. Ever.</strong><br><br>
        Cinema is not a product. Members pay for a deeper experience, not just to remove distractions. We don't chase your attention. We earn it.
      </div>
    </div>
  </div>
`;

const slide2 = `
  <div class="block-title" style="text-align: center; font-size: 24px; border: none; margin-bottom: 40px;">The Archives & The Ranks</div>
  
  <div class="s2-layout">
    <div class="phone-mockup" style="height: 650px;">
      <img src="${screenProfile}" />
    </div>
    
    <div style="display:flex; flex-direction:column; justify-content:center;">
      <div class="rank-box">
        <div class="rank-number">01. CINEPHILE</div>
        <div class="block-text">
          The foundation of the house. Access <strong>The Lobby</strong>, log your films, and build your digital <strong>Stacks</strong>.
        </div>
      </div>
      
      <div class="rank-box">
        <div class="rank-number">02. ARCHIVIST</div>
        <div class="block-text">
          Unlock <strong>The Vault</strong> to track your physical media collection (Blu-Rays, VHS, Criterion) and <strong>The Viewing Calendar</strong> to visualize your nightly attendance record. Enter the exclusive <strong>Lounge</strong>.
        </div>
      </div>
      
      <div class="rank-box">
        <div class="rank-number">03. AUTEUR</div>
        <div class="block-text">
          Ascend to true mastery. Unlock <strong>The Cinematic Passport</strong>, <strong>The Projector Room</strong> (deep global analytics), and your unique <strong>Taste DNA</strong> fingerprint.
        </div>
      </div>
    </div>

    <div class="phone-mockup" style="height: 650px; transform: translateY(40px);">
      <img src="${screenFilm}" />
    </div>
  </div>
`;

const slide3 = `
  <div class="block-title" style="text-align: center; font-size: 24px; border: none; margin-bottom: 40px;">The New Era</div>
  
  <div class="s3-layout">
    <div>
      <div class="phone-mockup" style="height: 550px; margin-bottom: 20px;">
        <img src="${screenLounge}" />
      </div>
      <div class="block-title">The Lounge</div>
      <div class="block-text">
        Public discourse and private gatherings. Step into the hallway of curated salons where true film debate lives. Establish your own salon or join the dialogue of the Archivists and Auteurs.
      </div>
    </div>
    
    <div>
      <div class="phone-mockup" style="height: 550px; margin-bottom: 20px; transform: translateY(30px);">
        <img src="${screenImport}" />
      </div>
      <div class="block-title" style="margin-top: 30px;">Data Import</div>
      <div class="block-text">
        Seamlessly import your entire cinematic history from any other tracking app in seconds. Bring your logs, reviews, and watchlists into the House effortlessly.
      </div>
    </div>
  </div>

  <div class="footer-cta">
    <div class="testing-badge">CURRENTLY IN CLOSED TESTING</div>
    <div class="cta-text">Help build the house, join the society.</div>
  </div>
`;

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1080, height: 1350 } });

  const slides = [slide1, slide2, slide3];
  
  for (let i = 0; i < slides.length; i++) {
    console.log(`Rendering Masterpiece Slide ${i + 1}...`);
    const html = generateHtml(slides[i]);
    
    // Write HTML to debug file
    fs.writeFileSync(path.join(outputDir, `debug_slide_${i+1}.html`), html);

    await page.setContent(html, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1000); // Wait for web fonts
    
    const outPath = path.join(outputDir, `manifesto_masterpiece_${i + 1}.png`);
    await page.screenshot({ path: outPath });
    console.log(`Saved: ${outPath}`);
  }

  await browser.close();
  console.log('All masterpiece slides rendered successfully.');
})();
