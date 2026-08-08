const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const inputDir = path.resolve(process.env.USERPROFILE, 'Downloads', 'Telegram Desktop', 'reelhouse post', 'reelhouse menefesto post');
const outputDir = path.resolve(inputDir, 'manifesto_slides');

if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

// Helper to get local image as base64 so Playwright can render it without file:// restrictions in setContent
function getBase64Image(filename) {
  const filepath = path.join(inputDir, filename);
  if (!fs.existsSync(filepath)) return null;
  const ext = path.extname(filepath).toLowerCase();
  const mime = ext === '.svg' ? 'image/svg+xml' : 'image/jpeg';
  const data = fs.readFileSync(filepath).toString('base64');
  return `data:${mime};base64,${data}`;
}

const logoBase64 = getBase64Image('reelhouse-logo.svg');

const slidesData = [
  {
    num: 1,
    titleWhite: 'More Than An App.',
    titleGold: 'It\'s A Society.',
    subtitle: 'EST. 1924',
    content: `The first screening was held in a basement in Paris. Three attended. The projectionist wept.<br><br>The Reelhouse Society is a cinematic commune built for the devoted in pure <span style="color:#e8e6e1">Nitrate Noir</span>. We don't feed algorithms. We fuel obsession.`,
    footer: 'ZERO ALGORITHM • ZERO ADS • PURE EXPERIENCE',
    img: null
  },
  {
    num: 2,
    titleWhite: 'The Philosophy',
    titleGold: 'This is not doom scrolling.',
    subtitle: 'RULE #1: WATCH EVERYTHING, FORGET NOTHING',
    content: `<span style="color:#c79622">⊗</span> You won't lose yourself. <span style="color:#e8e6e1">You will find yourself.</span><br><br><span style="color:#c79622">⊞</span> You won't scroll endlessly. <span style="color:#e8e6e1">You will explore intentionally.</span><br><br><span style="color:#c79622">⊙</span> You won't consume content. <span style="color:#e8e6e1">You will experience cinema.</span><br><br><span style="color:#c79622">☆</span> You won't be a number. <span style="color:#e8e6e1">You will be a member.</span>`,
    footer: 'T H E   M A N I F E S T O',
    img: null
  },
  {
    num: 3,
    titleWhite: 'The Core Pages',
    titleGold: 'The Lobby & The Reel',
    subtitle: 'DISCOVER & LOG',
    content: `Step into <span style="color:#c79622">The Lobby</span> to find the Weekly Feature curated by the Programming Committee.<br><br>Then log your journey in <span style="color:#c79622">The Reel</span>—your encrypted, permanent living record. Remember: A stack is not a list. It is a thesis.`,
    footer: 'Y O U R   C I N E M A T I C   J O U R N E Y',
    img: getBase64Image('reelhouse app 2.jpg'),
    img2: getBase64Image('reelhouse app 4.jpg')
  },
  {
    num: 4,
    titleWhite: 'New Features',
    titleGold: 'The Lounge & Darkroom',
    subtitle: 'ARCHIVIST EXCLUSIVES',
    content: `Establish your own private salons in <span style="color:#c79622">The Lounge</span>. Real people, real conversations.<br><br>Develop your taste in <span style="color:#c79622">The Darkroom</span> by filtering by mood, and keep your un-watched Negatives waiting in the wings.`,
    footer: 'W H E R E   C I N E M A   M E E T S   C O N V E R S A T I O N',
    img: getBase64Image('our lounge create your salon and chat with friends.jpg'),
    img2: getBase64Image('reelhouse app 3.jpg')
  },
  {
    num: 5,
    titleWhite: 'Your History Is Yours',
    titleGold: 'The Physical Archive',
    subtitle: 'SEAMLESS DATA IMPORT',
    content: `Upload your exported .zip or .json film archives from other platforms to transfer your complete viewing history, reviews, and ratings.<br><br><span style="color:#e8e6e1">The physical vault preserves what streaming cannot: permanence.</span>`,
    footer: 'T H E   A R C H I V E S',
    img: getBase64Image('import you data screenshot.jpg')
  },
  {
    num: 6,
    titleWhite: 'Purpose Over Habit',
    titleGold: 'Society Ranks',
    subtitle: 'CLIMB FOR HONOR, NOT EGO',
    content: `Complete Society Missions to earn XP. Not to addict you, but to shape your perspective.<br><br>Ascend through the ranks—from <span style="color:#e8e6e1">Cinematic Initiate</span> to <span style="color:#c79622">Auteur</span> and <span style="color:#c79622">The Archivist</span>. Your rank is based on the depth of your Reviews, Essays, and Logs.`,
    footer: 'B U I L D   Y O U R   L E G A C Y',
    img: null
  },
  {
    num: 7,
    titleWhite: 'The Promise',
    titleGold: 'No Ads. Ever.',
    subtitle: 'CINEMA IS NOT A PRODUCT',
    content: `This space is sacred. It will never be for sale.<br><br>We do not have a free ad-supported tier. Our members pay for a <span style="color:#e8e6e1">deeper experience</span>, not to remove distractions. You pay for the art.`,
    footer: 'P U R E   E X P E R I E N C E',
    img: null
  },
  {
    num: 8,
    titleWhite: 'Coming Soon',
    titleGold: 'The Doors Open Soon.',
    subtitle: 'CURRENTLY IN CLOSED TESTING',
    content: `Buster the Projectionist has been waiting since 1924. He never sleeps. He just dims.<br><br><span style="font-size: 32px; color: #c79622;">Help build the house, join the society.</span><br><br>You don't just use The Reelhouse Society. <span style="color:#e8e6e1">YOU ENTER IT.</span>`,
    footer: 'J O I N   T H E   S O C I E T Y',
    img: logoBase64
  }
];

const generateHtml = (slide) => `
<!DOCTYPE html>
<html>
<head>
<link href="https://fonts.googleapis.com/css2?family=Rye&family=Courier+Prime:wght@400;700&display=swap" rel="stylesheet">
<style>
  :root {
    --bg-dark: #050402;
    --bg-light: #1a1814;
    --gold: #c79622;
    --gold-muted: rgba(199, 150, 34, 0.4);
    --text-white: #e8e6e1;
    --text-muted: #a39c93;
  }
  body {
    margin: 0;
    padding: 80px;
    width: 1080px;
    height: 1350px;
    box-sizing: border-box;
    background: radial-gradient(circle at center, var(--bg-light) 0%, var(--bg-dark) 100%);
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    font-family: 'Courier Prime', monospace;
    color: var(--text-muted);
    position: relative;
    overflow: hidden;
  }
  .corner {
    position: absolute;
    width: 30px;
    height: 30px;
    border: 1px solid var(--gold-muted);
  }
  .top-left { top: 50px; left: 50px; border-right: none; border-bottom: none; }
  .top-right { top: 50px; right: 50px; border-left: none; border-bottom: none; }
  .bottom-left { bottom: 50px; left: 50px; border-right: none; border-top: none; }
  .bottom-right { bottom: 50px; right: 50px; border-left: none; border-top: none; }
  .logo-small {
    position: absolute;
    top: 55px;
    width: 50px;
    opacity: 0.8;
  }
  h1, h2 {
    font-family: 'Rye', serif;
    font-weight: normal;
    text-align: center;
    margin: 0;
  }
  .title-white {
    font-size: 55px;
    color: var(--text-white);
    margin-bottom: 10px;
  }
  .title-gold {
    font-size: 65px;
    color: var(--gold);
    margin-bottom: 30px;
    line-height: 1.1;
    text-align: center;
  }
  .subtitle {
    color: var(--text-muted);
    font-size: 20px;
    letter-spacing: 6px;
    text-transform: uppercase;
    text-align: center;
    margin-bottom: 50px;
    border: 1px solid var(--gold-muted);
    padding: 10px 30px;
  }
  .content {
    font-size: 26px;
    line-height: 1.7;
    text-align: center;
    max-width: 800px;
  }
  .footer {
    position: absolute;
    bottom: 60px;
    font-size: 14px;
    color: rgba(163, 156, 147, 0.4);
    letter-spacing: 10px;
    text-transform: uppercase;
  }
  .images {
    display: flex;
    gap: 30px;
    margin-top: 40px;
    justify-content: center;
    width: 100%;
  }
  .images img {
    border-radius: 30px;
    box-shadow: 0 10px 40px rgba(0,0,0,0.8);
    border: 1px solid rgba(199, 150, 34, 0.3);
    height: 500px;
    object-fit: contain;
  }
</style>
</head>
<body>
  <div class="corner top-left"></div>
  <div class="corner top-right"></div>
  <div class="corner bottom-left"></div>
  <div class="corner bottom-right"></div>
  
  <img class="logo-small" src="${logoBase64}" />
  
  <div class="subtitle">${slide.subtitle}</div>
  <div class="title-white">${slide.titleWhite}</div>
  <div class="title-gold">${slide.titleGold}</div>
  
  <div class="content">${slide.content}</div>
  
  ${(slide.img || slide.img2) ? `<div class="images">
    ${slide.img && slide.num !== 8 ? `<img src="${slide.img}" />` : ''}
    ${slide.img2 ? `<img src="${slide.img2}" />` : ''}
    ${slide.img && slide.num === 8 ? `<img src="${slide.img}" style="border:none; box-shadow:none; height:200px; opacity:0.8; filter:drop-shadow(0 0 20px rgba(199, 150, 34, 0.4)); margin-top:30px;" />` : ''}
  </div>` : ''}
  
  <div class="footer">${slide.footer}</div>
</body>
</html>
`;

(async () => {
  console.log('Launching Playwright to generate masterpiece slides...');
  const browser = await chromium.launch();
  const context = await browser.newContext({ deviceScaleFactor: 2 });
  const page = await context.newPage();
  
  await page.setViewportSize({ width: 1080, height: 1350 });

  for (const slide of slidesData) {
    console.log(`Rendering Slide ${slide.num}: ${slide.titleWhite}`);
    const html = generateHtml(slide);
    await page.setContent(html, { waitUntil: 'networkidle' });
    // Small delay to ensure fonts render
    await page.waitForTimeout(1000);
    const outPath = path.join(outputDir, `manifesto_slide_0${slide.num}.png`);
    await page.screenshot({ path: outPath });
    console.log(`Saved: ${outPath}`);
  }
  
  await browser.close();
  console.log('Done! All 8 slides generated in', outputDir);
})();
