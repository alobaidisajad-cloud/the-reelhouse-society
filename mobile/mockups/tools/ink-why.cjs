#!/usr/bin/env node
/**
 * ink-why — what layout.cjs's INK reads, letter by letter, on one drawn page: each letter carrying
 * marks, its own box, its ink from the font's measures, and the face the page asked for and was given.
 * selftest.cjs runs it when a case that must find INK finds none, so a renderer that draws a pile
 * differently says how (the Linux CI's fallback laid one over itself).
 *
 *   node mockups/tools/ink-why.cjs <page.html> [factor]
 */
const { chromium, open } = require('./harness.cjs');

(async () => {
  const [file, factor = '1'] = process.argv.slice(2);
  const browser = await chromium.launch();
  const page = await open(browser, file, { factor: Number(factor) });
  const lines = await page.evaluate(() => {
    const out = [];
    const pen = document.createElement('canvas').getContext('2d');
    const seg = new Intl.Segmenter('und', { granularity: 'grapheme' });
    for (const host of document.querySelectorAll('[data-scale-cap]')) {
      const cs = getComputedStyle(host);
      pen.font = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
      out.push(`text in ${cs.fontFamily} ${cs.fontSize}/${cs.lineHeight}; canvas font ${pen.font}; loaded ${[...document.fonts].filter((f) => f.status === 'loaded').map((f) => f.family).join(',')}`);
      const walk = document.createTreeWalker(host, NodeFilter.SHOW_TEXT);
      let shown = 0;
      for (let n = walk.nextNode(); n && shown < 4; n = walk.nextNode()) {
        for (const { segment, index } of seg.segment(n.data)) {
          if (segment.length < 2 || shown >= 4) continue;
          const r = document.createRange(); r.setStart(n, index); r.setEnd(n, index + segment.length);
          const b = r.getBoundingClientRect(); const m = pen.measureText(segment);
          const base = b.top + (b.height - m.fontBoundingBoxAscent - m.fontBoundingBoxDescent) / 2 + m.fontBoundingBoxAscent;
          out.push(`  ${segment.length} units: box ${b.top.toFixed(1)}..${b.bottom.toFixed(1)}, ink ${(base - m.actualBoundingBoxAscent).toFixed(1)}..${(base + m.actualBoundingBoxDescent).toFixed(1)} (font up ${m.fontBoundingBoxAscent.toFixed(1)}, ink up ${m.actualBoundingBoxAscent.toFixed(1)})`);
          shown++;
        }
      }
    }
    return out;
  });
  console.log(lines.join('\n'));
  await browser.close();
})();
