const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const inputDir = 'C:\\Users\\OMEN\\OneDrive\\Desktop\\reelhouse post';
const outputDir = path.join(inputDir, 'archive_lounge_slides');
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

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
const screenLounge = toBase64('our lounge create your salon and chat with friends.jpg', 'image/jpeg');

const shell = (slideContent, extraClass = '') => `
<!DOCTYPE html>
<html>
<head>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Rye&family=Special+Elite&family=Courier+Prime:wght@400;700&family=Cormorant+Garamond:ital,wght@0,400;0,600;0,700;1,400&display=swap');

  :root {
    --bg: #040302;
    --gold: #cba873;
    --gold-bright: #C4961A;
    --gold-dim: rgba(203, 168, 115, 0.35);
    --gold-faint: rgba(203, 168, 115, 0.14);
    --text-main: #9b8f7a;
    --text-bright: #ede5d8;
    --red-accent: #6b1f1a;
  }

  * { box-sizing: border-box; }

  html, body {
    margin: 0;
    padding: 0;
  }

  body {
    width: 1080px;
    height: 1350px;
    background: radial-gradient(circle at 50% 30%, #0d0906 0%, #040302 60%, #020201 100%);
    color: var(--text-main);
    font-family: 'Courier Prime', monospace;
    position: relative;
    overflow: hidden;
  }

  .grain {
    position: absolute;
    inset: 0;
    z-index: 999;
    pointer-events: none;
    opacity: 0.05;
    background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");
  }

  .vignette {
    position: absolute;
    inset: 0;
    z-index: 5;
    pointer-events: none;
    background: radial-gradient(circle at 50% 40%, transparent 45%, rgba(2,2,1,0.55) 88%, rgba(2,2,1,0.85) 100%);
  }

  .frame {
    position: absolute;
    top: 34px; left: 34px; right: 34px; bottom: 34px;
    border: 1px solid var(--gold-dim);
    z-index: 20;
    pointer-events: none;
  }

  .corner {
    position: absolute;
    width: 42px;
    height: 42px;
    border: 1px solid rgba(203,168,115,0.55);
    z-index: 21;
  }
  .tl { top: 18px; left: 18px; border-right: none; border-bottom: none; }
  .tr { top: 18px; right: 18px; border-left: none; border-bottom: none; }
  .bl { bottom: 18px; left: 18px; border-right: none; border-top: none; }
  .br { bottom: 18px; right: 18px; border-left: none; border-top: none; }

  .content {
    position: relative;
    z-index: 10;
    height: 100%;
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 70px 80px 50px;
  }

  .logo {
    width: 62px;
    margin-bottom: 22px;
  }

  .kicker {
    display: inline-flex;
    align-items: center;
    gap: 10px;
    border: 1px solid var(--gold-dim);
    padding: 8px 20px;
    font-family: 'Special Elite', cursive;
    font-size: 15px;
    letter-spacing: 0.35em;
    color: var(--gold);
    text-transform: uppercase;
    margin-bottom: 30px;
    background: linear-gradient(180deg, rgba(203,168,115,0.06) 0%, transparent 100%);
  }

  .kicker.red {
    color: #d98f86;
    border-color: rgba(107,31,26,0.65);
    background: linear-gradient(180deg, rgba(107,31,26,0.18) 0%, transparent 100%);
  }

  h1 {
    font-family: 'Rye', serif;
    font-size: 74px;
    line-height: 1.02;
    text-align: center;
    color: var(--text-bright);
    margin: 0 0 14px;
    letter-spacing: 1px;
  }
  h1 .gold { color: var(--gold-bright); }

  .subhead {
    font-family: 'Cormorant Garamond', serif;
    font-style: italic;
    font-size: 26px;
    color: var(--gold);
    text-align: center;
    max-width: 720px;
    margin: 0 0 36px;
    line-height: 1.4;
  }

  .divider {
    width: 220px;
    height: 1px;
    background: linear-gradient(90deg, transparent, var(--gold-dim), transparent);
    margin-bottom: 40px;
  }

  .footer {
    position: absolute;
    bottom: 56px;
    left: 0; right: 0;
    z-index: 10;
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 0 74px;
    font-family: 'Special Elite', cursive;
    font-size: 13px;
    letter-spacing: 0.28em;
    color: #4a423a;
    text-transform: uppercase;
  }

  .footer .swipe {
    color: var(--gold);
    opacity: 0.9;
  }

  ${extraClass}
</style>
</head>
<body>
  <div class="vignette"></div>
  <div class="grain"></div>
  <div class="frame"></div>
  <div class="corner tl"></div><div class="corner tr"></div><div class="corner bl"></div><div class="corner br"></div>
  <div class="content">
    ${slideContent}
  </div>
</body>
</html>
`;

// ---------- SLIDE 1: THE PHYSICAL ARCHIVE ----------
const slide1Extra = `
  .ledger {
    width: 100%;
    max-width: 800px;
    border: 1px solid var(--gold-dim);
    background: linear-gradient(180deg, rgba(203,168,115,0.05) 0%, rgba(0,0,0,0.2) 100%);
    padding: 40px 50px;
    position: relative;
    margin-bottom: 34px;
  }
  .ledger::before, .ledger::after {
    content: "";
    position: absolute;
    width: 9px; height: 9px;
    border: 1px solid var(--gold-dim);
  }
  .ledger::before { top: -5px; left: -5px; border-right: none; border-bottom: none; }
  .ledger::after { bottom: -5px; right: -5px; border-left: none; border-top: none; }

  .ledger-title {
    font-family: 'Special Elite', cursive;
    font-size: 15px;
    letter-spacing: 0.3em;
    color: var(--gold);
    text-align: center;
    margin-bottom: 26px;
    border-bottom: 1px dashed var(--gold-faint);
    padding-bottom: 18px;
  }

  .ledger-row {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    padding: 15px 0;
    border-bottom: 1px dotted rgba(203,168,115,0.2);
    font-size: 21px;
  }
  .ledger-row:last-child { border-bottom: none; }

  .ledger-format {
    color: var(--text-bright);
    font-weight: 700;
    letter-spacing: 0.05em;
  }

  .ledger-count {
    color: var(--gold);
    font-size: 18px;
  }

  .ledger-note {
    font-family: 'Cormorant Garamond', serif;
    font-style: italic;
    color: var(--text-main);
    font-size: 15px;
    letter-spacing: 0.02em;
  }

  .body-text {
    font-size: 19px;
    line-height: 1.75;
    text-align: center;
    max-width: 660px;
    color: var(--text-main);
    margin-bottom: 6px;
  }
  .body-text strong { color: var(--text-bright); }

  .footnote {
    font-family: 'Cormorant Garamond', serif;
    font-style: italic;
    font-size: 17px;
    color: var(--gold);
    opacity: 0.85;
    text-align: center;
    margin-top: 18px;
  }
`;

const slide1 = `
  <img class="logo" src="${logoBase64}" />
  <div class="kicker">Classification &middot; Tier II Archivist</div>
  <h1>THE PHYSICAL<br><span class="gold">ARCHIVE</span></h1>
  <div class="subhead">A digital ledger for your physical hoarding.</div>

  <div class="ledger">
    <div class="ledger-title">HOLDINGS &middot; @SAJJADOBAIDI</div>
    <div class="ledger-row"><span class="ledger-format">4K UHD</span><span class="ledger-count">47 titles</span></div>
    <div class="ledger-row"><span class="ledger-format">BLU-RAY</span><span class="ledger-count">112 titles</span></div>
    <div class="ledger-row"><span class="ledger-format">CRITERION</span><span class="ledger-count">31 titles</span></div>
    <div class="ledger-row"><span class="ledger-format">VHS</span><span class="ledger-count">9 titles</span><span class="ledger-note">condition: sentimental</span></div>
    <div class="ledger-row"><span class="ledger-format">LASERDISC</span><span class="ledger-count">2 titles</span><span class="ledger-note">why do you own these</span></div>
  </div>

  <div class="body-text">
    Log every disc, tape, and spine you own. Track condition, shelf, and edition. <strong>Not because you'll ever rewatch them</strong> &mdash; because owning things you'll never rewatch is the entire point.
  </div>
  <div class="footnote">* 4K UHD counts double toward your personality.</div>
`;

// ---------- SLIDE 2: THE LOUNGE ----------
const slide2Extra = `
  .phone-wrap {
    width: 300px;
    margin-bottom: 26px;
    position: relative;
  }
  .phone-screen {
    width: 100%;
    height: 470px;
    border: 1px solid var(--gold-dim);
    border-radius: 28px;
    overflow: hidden;
    box-shadow: 0 30px 70px rgba(0,0,0,0.75), 0 0 50px rgba(203,168,115,0.12);
  }
  .phone-screen img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    object-position: top;
    display: block;
  }

  .body-text {
    font-size: 18px;
    line-height: 1.6;
    text-align: center;
    max-width: 620px;
    color: var(--text-main);
    margin-bottom: 4px;
  }
  .body-text strong { color: var(--text-bright); }

  .footnote {
    font-family: 'Cormorant Garamond', serif;
    font-style: italic;
    font-size: 16px;
    color: var(--gold);
    opacity: 0.85;
    text-align: center;
    margin-top: 14px;
  }
`;

const slide2 = `
  <img class="logo" src="${logoBase64}" />
  <div class="kicker red">Classification &middot; Archivist Exclusive</div>
  <h1>THE <span class="gold">LOUNGE</span></h1>
  <div class="subhead">Exclusive cinema chat rooms.</div>

  <div class="phone-wrap">
    <div class="phone-screen"><img src="${screenLounge}" /></div>
  </div>

  <div class="body-text">
    Establish your own salon, or join one already in session. <strong>Speak with members who take this exactly as seriously as you do.</strong> Arguing about Kubrick at 3AM with a stranger in another timezone isn't a bug &mdash; it's the point.
  </div>
  <div class="footnote">* No open salons at this time is not an invitation. It is a dare.</div>
`;

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1080, height: 1350 }, deviceScaleFactor: 2 });

  const slides = [
    { html: shell(slide1, slide1Extra), footL: 'Society Archives', footR: 'Swipe &rarr;', name: 'slide_1_physical_archive' },
    { html: shell(slide2, slide2Extra), footL: 'Est. 1924 — Paris', footR: '', name: 'slide_2_the_lounge' },
  ];

  for (const s of slides) {
    let html = s.html.replace('</body>', `
      <div class="footer"><span>${s.footL}</span><span class="swipe">${s.footR}</span></div>
    </body>`);
    console.log(`Rendering ${s.name}...`);
    await page.setContent(html, { waitUntil: 'networkidle' });
    await page.evaluate(async () => { await document.fonts.ready; });
    await page.waitForTimeout(600);
    const outPath = path.join(outputDir, `${s.name}.png`);
    await page.screenshot({ path: outPath });
    console.log(`Saved: ${outPath}`);
  }

  await browser.close();
  console.log('Done.');
})();
