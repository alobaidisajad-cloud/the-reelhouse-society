const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const inputDir = path.resolve(process.env.USERPROFILE, 'Downloads', 'Telegram Desktop', 'reelhouse post', 'reelhouse menefesto post');
const outputDir = path.resolve(process.env.USERPROFILE, 'OneDrive', 'Desktop', 'Reelhouse Manifesto Infographic');

if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

function getBase64Image(filename) {
  const filepath = path.join(inputDir, filename);
  if (!fs.existsSync(filepath)) return null;
  const ext = path.extname(filepath).toLowerCase();
  const mime = ext === '.svg' ? 'image/svg+xml' : 'image/jpeg';
  const data = fs.readFileSync(filepath).toString('base64');
  return `data:${mime};base64,${data}`;
}

const logoBase64 = getBase64Image('reelhouse-logo.svg');
const imgLobby = getBase64Image('reelhouse app 1.jpg');
const imgReel = getBase64Image('reelhouse app 2.jpg');
const imgDarkroom = getBase64Image('reelhouse app 3.jpg');
const imgMovie = getBase64Image('reelhouse app 4.jpg');
const imgLounge = getBase64Image('our lounge create your salon and chat with friends.jpg');
const imgImport = getBase64Image('import you data screenshot.jpg');

const htmlContent = `
<!DOCTYPE html>
<html>
<head>
<link href="https://fonts.googleapis.com/css2?family=Rye&family=Courier+Prime:wght@400;700&display=swap" rel="stylesheet">
<style>
  :root {
    --bg-dark: #050402;
    --bg-light: #0d0b08;
    --gold: #c79622;
    --gold-muted: rgba(199, 150, 34, 0.25);
    --text-white: #e8e6e1;
    --text-muted: #a39c93;
    --red-glow: rgba(180, 20, 20, 0.4);
  }
  body {
    margin: 0;
    width: 1080px;
    height: 5400px; /* 4 seamless Instagram slides */
    background: radial-gradient(circle at center top, var(--bg-light) 0%, var(--bg-dark) 100%);
    background-color: #030201;
    font-family: 'Courier Prime', monospace;
    color: var(--text-muted);
    position: relative;
    overflow: hidden;
  }
  
  /* Grain overlay */
  body::before {
    content: "";
    position: absolute;
    inset: 0;
    opacity: 0.05;
    background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");
    pointer-events: none;
    z-index: 10;
  }

  .container {
    padding: 60px;
    display: flex;
    flex-direction: column;
    gap: 40px;
  }

  h1, h2, h3, h4 {
    font-family: 'Rye', serif;
    font-weight: normal;
    color: var(--gold);
    margin: 0;
  }

  .box {
    border: 1px solid var(--gold-muted);
    padding: 30px;
    border-radius: 10px;
    position: relative;
    background: rgba(10, 8, 5, 0.6);
  }

  .row { display: flex; gap: 30px; }
  .col { display: flex; flex-direction: column; gap: 30px; }

  /* SECTION 1: Header & Phones */
  .header-row {
    display: flex;
    justify-content: space-between;
    align-items: stretch;
    height: 900px;
  }
  .header-left {
    flex: 1;
    text-align: center;
    padding-top: 50px;
  }
  .header-left .logo { width: 80px; margin-bottom: 30px; opacity: 0.9; }
  .society-title { font-size: 24px; letter-spacing: 4px; margin-bottom: 40px; color: var(--gold); text-transform: uppercase; }
  .hero-text { font-family: 'Rye', serif; font-size: 45px; color: var(--text-white); margin-bottom: 40px; line-height: 1.2; }
  .sub-hero { font-size: 16px; line-height: 1.6; max-width: 300px; margin: 0 auto 50px auto; }
  .gold-caps { color: var(--gold); font-size: 14px; letter-spacing: 2px; margin-bottom: 50px; }
  
  .header-phones {
    flex: 2;
    display: flex;
    gap: 20px;
    justify-content: flex-end;
    align-items: center;
    position: relative;
  }
  .phone-mockup {
    width: 250px;
    border-radius: 20px;
    border: 1px solid var(--gold-muted);
    box-shadow: 0 0 40px var(--red-glow);
    z-index: 2;
  }
  .phone-mockup:nth-child(2) { transform: translateY(40px); z-index: 1; box-shadow: 0 0 30px rgba(0,0,0,0.8); }
  
  /* SECTION 2: 3-Col Philosophy */
  .three-col {
    display: grid;
    grid-template-columns: 1fr 1fr 1fr;
    gap: 30px;
  }
  .three-col .box h3 { font-size: 20px; margin-bottom: 20px; letter-spacing: 2px; }
  .three-col ul { list-style: none; padding: 0; margin: 0; }
  .three-col li { margin-bottom: 15px; font-size: 15px; line-height: 1.5; position: relative; padding-left: 20px; }
  .three-col li::before { content: "•"; position: absolute; left: 0; color: var(--gold); }
  .center-text { text-align: center; }
  
  /* SECTION 3: Doom Scrolling & Promise */
  .grid-layout {
    display: grid;
    grid-template-columns: 350px 1fr 300px;
    gap: 30px;
    align-items: stretch;
  }
  
  .doom-scroll h2 { font-size: 28px; color: #b53838; margin-bottom: 30px; text-align: center; }
  .rule { display: flex; gap: 15px; margin-bottom: 25px; align-items: flex-start; }
  .rule-icon { width: 24px; height: 24px; border: 1px solid var(--gold); border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 12px; color: var(--gold); flex-shrink: 0; }
  .rule-text { font-size: 15px; line-height: 1.5; }
  .rule-text span { color: var(--text-white); }
  
  .promise h3 { font-size: 24px; margin-bottom: 30px; text-align: center; }
  .check-item { display: flex; gap: 10px; margin-bottom: 20px; font-size: 16px; align-items: center; }
  .check-item::before { content: "⊗"; color: var(--gold); font-size: 20px; }
  .quote { text-align: center; margin-top: 40px; font-style: italic; color: var(--gold); font-size: 14px; }

  /* SECTION 4: Features Grid */
  .section-title { font-size: 50px; text-align: left; margin: 60px 0 20px 0; letter-spacing: 4px; }
  .section-subtitle { font-size: 14px; letter-spacing: 4px; color: var(--text-muted); margin-bottom: 50px; text-transform: uppercase; }

  .feature-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 40px;
  }
  .feat-card {
    display: flex;
    gap: 20px;
    align-items: center;
  }
  .feat-text { flex: 1; }
  .feat-text h4 { font-size: 26px; margin-bottom: 15px; color: var(--text-white); }
  .feat-text .num { color: #b53838; font-size: 20px; margin-bottom: 10px; font-family: 'Rye', serif; }
  .feat-text p { font-size: 15px; line-height: 1.6; }
  .feat-img { width: 200px; border-radius: 16px; border: 1px solid var(--gold-muted); }
  
  /* FOOTER */
  .bottom-footer {
    text-align: center;
    margin-top: auto;
    padding: 60px 0;
    border-top: 1px solid var(--gold-muted);
  }
  .bottom-footer h2 { font-size: 32px; color: #b53838; letter-spacing: 2px; }

</style>
</head>
<body>
  <div class="container">
    
    <!-- TOP SECTION -->
    <div class="header-row">
      <div class="header-left">
        <img class="logo" src="${logoBase64}">
        <div class="society-title">✦ THE REELHOUSE SOCIETY ✦</div>
        <div style="font-size: 12px; letter-spacing: 4px; margin-bottom: 40px;">- EST. 1924 -</div>
        <div class="hero-text">More Than An App.<br>It's A Society.</div>
        <div class="sub-hero">The Reelhouse Society is a cinematic commune built for the devoted. We don't feed algorithms. We fuel obsession.</div>
        <div class="gold-caps">ZERO ALGORITHM • ZERO ADS • PURE EXPERIENCE</div>
        <div class="sub-hero" style="color: var(--text-white);">You don't use this app to pass time. You use it to become someone who pays attention.</div>
      </div>
      <div class="header-phones">
        <img class="phone-mockup" src="${imgLobby}">
        <img class="phone-mockup" src="${imgDarkroom}">
      </div>
    </div>

    <!-- 3 COLUMNS -->
    <div class="three-col">
      <div class="box">
        <h3>DESIGN PHILOSOPHY</h3>
        <ul>
          <li>1920s cinema meets modern craft.</li>
          <li>Ornate, intentional, and immersive.</li>
          <li>Every detail has meaning. Nothing is random.</li>
          <li>This is not fast content. This is slow cinema.</li>
        </ul>
      </div>
      <div class="box center-text">
        <h3>WHY IT LOOKS THIS WAY</h3>
        <p style="font-size: 14px; line-height: 1.6;">It's not minimalistic because it's not trying to be a generic tech product.</p>
        <p style="font-size: 14px; line-height: 1.6; margin-top: 20px;">It's a cinema from the 20s. Everything glows. Everything demands your attention.</p>
        <p style="font-size: 14px; line-height: 1.6; color: var(--gold); margin-top: 20px;">Because in this world, attention is respect.</p>
      </div>
      <div class="box">
        <h3>HOW IT FEELS</h3>
        <div style="display: flex; flex-direction: column; gap: 20px; margin-top: 20px;">
          <div style="display: flex; gap: 10px; align-items: center; font-size: 14px;"><span style="color:var(--gold)">⊗</span> Like entering an old cinema.</div>
          <div style="display: flex; gap: 10px; align-items: center; font-size: 14px;"><span style="color:var(--gold)">⊗</span> Like opening a forbidden book.</div>
          <div style="display: flex; gap: 10px; align-items: center; font-size: 14px;"><span style="color:var(--gold)">⊗</span> Like joining a secret society.</div>
        </div>
      </div>
    </div>

    <!-- DOOM SCROLLING ROW -->
    <div class="grid-layout">
      <div class="box" style="display: flex; align-items: center; justify-content: center; padding: 0;">
        <img src="${imgReel}" style="width: 220px; border-radius: 16px; border: 1px solid var(--gold-muted); margin: 30px;">
      </div>
      
      <div class="box doom-scroll">
        <h2>THIS IS NOT<br>DOOM SCROLLING.</h2>
        <div class="rule">
          <div class="rule-icon">1</div>
          <div class="rule-text">You won't lose yourself.<br><span>You will find yourself.</span></div>
        </div>
        <div class="rule">
          <div class="rule-icon">2</div>
          <div class="rule-text">You won't scroll endlessly.<br><span>You will explore intentionally.</span></div>
        </div>
        <div class="rule">
          <div class="rule-icon">3</div>
          <div class="rule-text">You won't consume content.<br><span>You will experience cinema.</span></div>
        </div>
        <div class="rule">
          <div class="rule-icon">4</div>
          <div class="rule-text">You won't be a number.<br><span>You will be a member.</span></div>
        </div>
      </div>

      <div class="box promise">
        <h3>THE PROMISE</h3>
        <div class="check-item">Zero algorithms.</div>
        <div class="check-item">Zero ads.</div>
        <div class="check-item">Zero distractions.</div>
        <div style="text-align: center; margin-top: 40px; font-size: 15px; color: var(--text-white); line-height: 1.6;">Just films.<br>Just stories.<br>Just people who actually care.</div>
        <div class="quote">"We don't chase your attention. We earn it."</div>
      </div>
    </div>

    <!-- NEW FEATURES -->
    <div class="section-title">NEW FEATURES</div>
    <div class="section-subtitle">BUILT NOT FOR ATTENTION. BUILT FOR DEVOTION.</div>

    <div class="feature-grid">
      
      <div class="feat-card">
        <div class="feat-text">
          <div class="num">01</div>
          <h4>THE LOUNGE</h4>
          <p>Private rooms where members gather to discuss films together.<br><br>Real people. Real conversations. Real cinema.</p>
        </div>
        <img class="feat-img" src="${imgLounge}">
      </div>
      
      <div class="feat-card">
        <div class="feat-text">
          <div class="num">02</div>
          <h4>THE DARKROOM</h4>
          <p>Develop your taste. Filter by mood and explore the depths of your un-watched Negatives.</p>
        </div>
        <img class="feat-img" src="${imgDarkroom}">
      </div>

      <div class="feat-card">
        <div class="feat-text">
          <div class="num">03</div>
          <h4>THE ARCHIVE</h4>
          <p>Seamlessly import your external data (.zip/.json). The physical vault preserves what streaming cannot: permanence.</p>
        </div>
        <img class="feat-img" src="${imgImport}">
      </div>

      <div class="feat-card">
        <div class="feat-text">
          <div class="num">04</div>
          <h4>THE DOSSIER</h4>
          <p>Complete details, reviews, and logs for every film in existence. We read the plot. We read the reviews. We judge both.</p>
        </div>
        <img class="feat-img" src="${imgMovie}">
      </div>

      <div class="box col" style="grid-column: span 2; display: flex; flex-direction: row; align-items: center; justify-content: space-between;">
        <div style="flex: 1;">
          <div class="num" style="color: #b53838; font-size: 20px; font-family: 'Rye', serif; margin-bottom: 10px;">05</div>
          <h4 style="font-size: 30px; margin-bottom: 20px; color: var(--text-white);">SOCIETY RANKS & RECOGNITION</h4>
          <p style="font-size: 16px; line-height: 1.6; max-width: 400px;">Climb the ranks not for ego, but for honor. Ascend from Cinematic Initiate to The Archivist. Your journey is your legacy.</p>
        </div>
        <div style="flex: 1; text-align: center;">
          <div style="border: 2px dashed var(--gold); padding: 30px; transform: rotate(-2deg); display: inline-block;">
            <h4 style="font-size: 30px; letter-spacing: 4px;">+ PURPOSE +</h4>
            <h4 style="font-size: 30px; letter-spacing: 4px;">OVER HABIT</h4>
          </div>
        </div>
      </div>

    </div>

    <!-- FOOTER -->
    <div class="bottom-footer">
      <h2>HELP BUILD THE HOUSE, JOIN THE SOCIETY.</h2>
      <div style="font-size: 20px; color: var(--gold); letter-spacing: 4px; margin-top: 30px;">
        YOU DON'T JUST USE THE REELHOUSE SOCIETY. <span style="color: #b53838;">YOU ENTER IT.</span>
      </div>
      <div style="font-size: 14px; margin-top: 20px; letter-spacing: 2px;">APP CURRENTLY IN CLOSED TESTING • COMING SOON</div>
    </div>

  </div>
</body>
</html>
`;

(async () => {
  console.log('Launching Playwright to generate the Infographic Poster...');
  const browser = await chromium.launch();
  const context = await browser.newContext({ deviceScaleFactor: 2 });
  const page = await context.newPage();
  
  await page.setViewportSize({ width: 1080, height: 5400 });

  await page.setContent(htmlContent, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500); // Wait for fonts and glows to render

  // Save the full continuous poster
  const fullPath = path.join(outputDir, 'Manifesto_Full_Poster.png');
  await page.screenshot({ path: fullPath, fullPage: true });
  console.log('Saved Full Poster:', fullPath);

  // Slice it into 4 seamless Instagram slides (1080x1350)
  for (let i = 0; i < 4; i++) {
    const slidePath = path.join(outputDir, `Manifesto_Carousel_Slice_0${i+1}.png`);
    await page.screenshot({ 
      path: slidePath, 
      clip: { x: 0, y: i * 1350, width: 1080, height: 1350 }
    });
    console.log(`Saved Slice ${i+1}:`, slidePath);
  }
  
  await browser.close();
  console.log('Done! Assets generated in', outputDir);
})();
