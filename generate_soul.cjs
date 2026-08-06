const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const inputDir = path.resolve(process.env.USERPROFILE, 'Downloads', 'Telegram Desktop', 'reelhouse post', 'reelhouse menefesto post');
const outputDir = path.join(inputDir, 'soul_slides');
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

// Convert local file to base64
const toBase64 = (fileName, mimeType) => {
  const filePath = path.join(inputDir, fileName);
  if (!fs.existsSync(filePath)) {
    console.warn(`WARNING: File not found: ${filePath}`);
    return '';
  }
  const data = fs.readFileSync(filePath);
  return `data:${mimeType};base64,${data.toString('base64')}`;
};

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
  @import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,400;0,600;0,700;1,400&family=Space+Mono:ital,wght@0,400;0,700;1,400&display=swap');

  :root {
    --bg: #040302;
    --gold: #cba873;
    --gold-dim: rgba(203, 168, 115, 0.4);
    --gold-faint: rgba(203, 168, 115, 0.15);
    --text-main: #9b8f7a;
    --text-bright: #e0d5bc;
    --red-accent: #6b1f1a;
  }

  body {
    margin: 0;
    padding: 0;
    width: 1080px;
    height: 1920px; /* TikTok / IG Stories ratio for tall canvas */
    background-color: var(--bg);
    color: var(--text-main);
    font-family: 'Space Mono', monospace;
    box-sizing: border-box;
    position: relative;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  /* Deep subtle noise */
  body::after {
    content: "";
    position: absolute;
    top: 0; left: 0; right: 0; bottom: 0;
    background-image: url('data:image/svg+xml;utf8,<svg viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg"><filter id="noiseFilter"><feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="4" stitchTiles="stitch"/></filter><rect width="100%" height="100%" filter="url(%23noiseFilter)"/></svg>');
    opacity: 0.08;
    pointer-events: none;
    z-index: 999;
  }

  h1, h2, h3, .serif {
    font-family: 'Cormorant Garamond', serif;
  }

  .header {
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 60px 0 40px;
    position: relative;
    z-index: 10;
  }

  .logo {
    height: 70px;
    margin-bottom: 25px;
    filter: invert(74%) sepia(23%) saturate(548%) hue-rotate(352deg) brightness(87%) contrast(85%);
  }

  .title-line {
    display: flex;
    align-items: center;
    gap: 15px;
    font-size: 20px;
    letter-spacing: 6px;
    color: var(--gold);
    text-transform: uppercase;
    font-weight: 700;
  }

  .title-line::before, .title-line::after {
    content: "✦";
    font-size: 14px;
    color: var(--red-accent);
  }

  .est {
    font-size: 14px;
    letter-spacing: 8px;
    color: var(--text-main);
    margin-top: 10px;
    position: relative;
  }
  .est::before, .est::after {
    content: "";
    position: absolute;
    top: 50%;
    width: 40px;
    height: 1px;
    background-color: var(--gold-dim);
  }
  .est::before { left: -60px; }
  .est::after { right: -60px; }

  .content {
    flex: 1;
    padding: 0 50px 50px 50px;
    display: flex;
    flex-direction: column;
    z-index: 10;
  }

  .headline {
    text-align: center;
    font-size: 55px;
    font-weight: 600;
    color: var(--text-bright);
    line-height: 1.1;
    margin: 20px 0;
  }

  .subheadline {
    text-align: center;
    font-size: 20px;
    color: var(--text-main);
    max-width: 700px;
    margin: 0 auto 40px;
    line-height: 1.5;
  }

  .grid-box {
    border: 1px solid var(--gold-faint);
    padding: 30px;
    border-radius: 4px;
    position: relative;
    background: linear-gradient(180deg, rgba(203,168,115,0.03) 0%, transparent 100%);
  }
  
  /* Corner accents for boxes */
  .grid-box::before, .grid-box::after {
    content: "";
    position: absolute;
    width: 8px; height: 8px;
    border: 1px solid var(--gold-dim);
  }
  .grid-box::before { top: -4px; left: -4px; border-right: none; border-bottom: none; }
  .grid-box::after { bottom: -4px; right: -4px; border-left: none; border-top: none; }

  .box-title {
    font-size: 24px;
    font-weight: 600;
    color: var(--gold);
    text-transform: uppercase;
    letter-spacing: 2px;
    margin-bottom: 20px;
    border-bottom: 1px dashed var(--gold-faint);
    padding-bottom: 10px;
  }

  .box-text {
    font-size: 16px;
    line-height: 1.6;
  }

  .box-text strong {
    color: var(--text-bright);
    font-weight: 700;
  }

  .phone-screen {
    border: 1px solid var(--gold-dim);
    border-radius: 30px;
    overflow: hidden;
    box-shadow: 0 20px 50px rgba(0,0,0,0.8), 0 0 40px rgba(203,168,115,0.1);
  }
  .phone-screen img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  /* Specifically for bottom banners */
  .bottom-banner {
    text-align: center;
    padding: 30px 0;
    border-top: 1px solid var(--gold-faint);
    border-bottom: 1px solid var(--gold-faint);
    margin-top: auto;
    font-size: 22px;
    letter-spacing: 4px;
    color: var(--red-accent);
    text-transform: uppercase;
  }
  
  .bottom-banner span {
    color: var(--gold);
  }
</style>
</head>
<body>
  <div class="header">
    <img src="${logoBase64}" class="logo" />
    <div class="title-line">THE REELHOUSE SOCIETY</div>
    <div class="est">EST. 1924</div>
  </div>
  <div class="content">
    ${slideContent}
  </div>
  <script>
    // Ensure fonts are loaded before taking screenshot
    window.fontsReady = document.fonts.ready;
  </script>
</body>
</html>
`;

const slide1 = `
  <div class="headline serif">More Than An App.<br>It's A Society.</div>
  <div class="subheadline serif">
    The Reelhouse Society is a cinematic commune built for the devoted. We don't feed algorithms. We fuel obsession.
  </div>

  <div style="text-align: center; color: var(--gold); font-size: 18px; letter-spacing: 3px; margin-bottom: 40px;">
    ZERO ALGORITHM • ZERO ADS • PURE EXPERIENCE
  </div>

  <div style="display: flex; gap: 40px; height: 750px; margin-bottom: 50px; justify-content: center;">
    <div class="phone-screen" style="width: 350px; transform: translateY(40px);">
      <img src="${screenDarkroom}" />
    </div>
    <div class="phone-screen" style="width: 380px; z-index: 5;">
      <img src="${screenLobby}" />
    </div>
  </div>

  <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 30px; margin-bottom: 40px;">
    <div class="grid-box">
      <div class="box-title serif">The Philosophy</div>
      <div class="box-text">
        <ul style="padding-left: 20px; margin: 0;">
          <li style="margin-bottom: 10px;">You don't use this app to pass time. You use it to become someone who pays attention.</li>
          <li style="margin-bottom: 10px;">Track every screening in <strong>The Lobby</strong>.</li>
          <li>Discover films away from the algorithmic gaze in <strong>The Darkroom</strong>.</li>
        </ul>
      </div>
    </div>
    
    <div class="grid-box">
      <div class="box-title serif">The Promise</div>
      <div class="box-text">
        <div style="color: var(--gold); font-size: 20px; margin-bottom: 10px; font-weight: bold;">NO ADS. EVER.</div>
        Cinema is not a product. Members pay for a deeper, more profound cinematic experience—not just to remove distractions.<br><br>
        We don't chase your attention. We earn it.
      </div>
    </div>
  </div>
`;

const slide2 = `
  <div class="headline serif">The Archives & Ranks</div>
  <div class="subheadline serif">
    Climb the ranks not for ego, but for honor. Your journey is your legacy.
  </div>

  <div style="display: grid; grid-template-columns: 350px 1fr; gap: 50px; height: 800px; margin-bottom: 40px;">
    <div class="phone-screen" style="height: 100%;">
      <img src="${screenProfile}" />
    </div>
    
    <div style="display: flex; flex-direction: column; gap: 25px;">
      <div class="grid-box">
        <div style="color: var(--gold); font-size: 14px; letter-spacing: 2px;">RANK 01</div>
        <div class="box-title serif" style="margin-bottom: 10px;">Cinephile</div>
        <div class="box-text">
          The foundation of the house. Access <strong>The Lobby</strong>, log your films, and build your digital <strong>Stacks</strong>.
        </div>
      </div>
      
      <div class="grid-box">
        <div style="color: var(--gold); font-size: 14px; letter-spacing: 2px;">RANK 02</div>
        <div class="box-title serif" style="margin-bottom: 10px;">Archivist</div>
        <div class="box-text">
          Unlock <strong>The Vault</strong> to meticulously track your physical media collection (Blu-Rays, VHS, Criterion) and <strong>The Viewing Calendar</strong> to visualize your nightly attendance record. Enter the exclusive <strong>Lounge</strong>.
        </div>
      </div>

      <div class="grid-box">
        <div style="color: var(--gold); font-size: 14px; letter-spacing: 2px;">RANK 03</div>
        <div class="box-title serif" style="margin-bottom: 10px;">Auteur</div>
        <div class="box-text">
          Ascend to true mastery. Unlock <strong>The Cinematic Passport</strong> (stamps of a lifetime), <strong>The Projector Room</strong> (deep global analytics), and your unique <strong>Taste DNA</strong> fingerprint.
        </div>
      </div>
    </div>
  </div>
  
  <div class="grid-box" style="display: flex; align-items: center; gap: 30px;">
    <div class="phone-screen" style="width: 200px; height: 200px; flex-shrink: 0; border-radius: 10px;">
      <img src="${screenFilm}" style="object-position: top;" />
    </div>
    <div>
      <div class="box-title serif">The Logbook</div>
      <div class="box-text">
        Your personal archive. Log every film you experience. Rate it. Reflect on it. Remember it forever.
      </div>
    </div>
  </div>
`;

const slide3 = `
  <div class="headline serif">The New Era</div>
  <div class="subheadline serif">
    Built not for attention. Built for devotion.
  </div>

  <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 40px; margin-bottom: 50px; height: 900px;">
    <div style="display: flex; flex-direction: column;">
      <div class="phone-screen" style="flex: 1; margin-bottom: 30px;">
        <img src="${screenLounge}" />
      </div>
      <div class="grid-box">
        <div class="box-title serif">The Lounge</div>
        <div class="box-text">
          Public discourse and private gatherings. Take a seat. Establish your own salon or join the dialogue of the Archivists and Auteurs where true film debate lives.
        </div>
      </div>
    </div>
    
    <div style="display: flex; flex-direction: column;">
      <div class="phone-screen" style="flex: 1; margin-bottom: 30px;">
        <img src="${screenImport}" />
      </div>
      <div class="grid-box">
        <div class="box-title serif">Data Import</div>
        <div class="box-text">
          Seamlessly import your entire cinematic history from any other tracking app in seconds. Bring your logs, reviews, and watchlists into the House effortlessly.
        </div>
      </div>
    </div>
  </div>

  <div style="text-align: center; margin-bottom: 40px;">
    <div style="display: inline-block; border: 1px solid var(--gold); color: var(--gold); padding: 10px 20px; font-size: 18px; letter-spacing: 3px;">
      ✦ CURRENTLY IN CLOSED TESTING ✦
    </div>
  </div>

  <div class="bottom-banner">
    HELP BUILD THE HOUSE. <span>JOIN THE SOCIETY.</span>
  </div>
`;

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1080, height: 1920 }, deviceScaleFactor: 2 }); // Scale factor 2 for extra crispness

  const slides = [slide1, slide2, slide3];
  
  for (let i = 0; i < slides.length; i++) {
    console.log(`Rendering Soul Slide ${i + 1}...`);
    const html = generateHtml(slides[i]);
    
    await page.setContent(html, { waitUntil: 'networkidle' });
    await page.evaluate(async () => {
      await window.fontsReady;
    });
    await page.waitForTimeout(1000); // Extra safety for layout settling
    
    const outPath = path.join(outputDir, `manifesto_slide_${i + 1}.png`);
    await page.screenshot({ path: outPath, fullPage: true });
    console.log(`Saved: ${outPath}`);
  }

  await browser.close();
  console.log('All soul slides rendered successfully.');
})();
