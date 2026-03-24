import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function jitter(val, amt) {
    return val + (Math.random() - 0.5) * amt;
}

// Generate organic paths using cubic beziers
function makeJitteryCirclePath(cx, cy, r, segments, jitterAmt) {
    let d = "";
    for (let i = 0; i <= segments; i++) {
        const theta = (i / segments) * Math.PI * 2;
        const x = cx + Math.cos(theta) * jitter(r, jitterAmt);
        const y = cy + Math.sin(theta) * jitter(r, jitterAmt);
        if (i === 0) {
            d += `M ${x.toFixed(1)} ${y.toFixed(1)} `;
        } else {
            const prevTheta = ((i - 1) / segments) * Math.PI * 2;
            const cp1x = cx + Math.cos(prevTheta + 0.2) * jitter(r, jitterAmt);
            const cp1y = cy + Math.sin(prevTheta + 0.2) * jitter(r, jitterAmt);
            const cp2x = cx + Math.cos(theta - 0.2) * jitter(r, jitterAmt);
            const cp2y = cy + Math.sin(theta - 0.2) * jitter(r, jitterAmt);
            d += `C ${cp1x.toFixed(1)} ${cp1y.toFixed(1)}, ${cp2x.toFixed(1)} ${cp2y.toFixed(1)}, ${x.toFixed(1)} ${y.toFixed(1)} `;
        }
    }
    return d + "Z";
}

// Generate curved highlight arcs
function makeArcPath(cx, cy, r, startAngle, endAngle, jitterAmt) {
    let d = `M ${cx + Math.cos(startAngle)*r} ${cy + Math.sin(startAngle)*r} `;
    const segments = 4;
    for (let i=1; i<=segments; i++) {
        const theta = startAngle + (endAngle - startAngle) * (i/segments);
        const x = cx + Math.cos(theta) * jitter(r, jitterAmt);
        const y = cy + Math.sin(theta) * jitter(r, jitterAmt);
        d += `L ${x.toFixed(1)} ${y.toFixed(1)} `;
    }
    return d;
}

const gold1 = '#c6a65b';
const gold2 = '#bd8e2e'; // Dark gold
const ink = '#0A0703';

let svg = `<svg width="100" height="100" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <!-- Organic ink stamp filter -->
    <filter id="stamp" x="-20%" y="-20%" width="140%" height="140%">
      <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="3" result="noise" />
      <feDisplacementMap in="SourceGraphic" in2="noise" scale="2.5" xChannelSelector="R" yChannelSelector="G" result="displaced" />
      <feGaussianBlur in="displaced" stdDeviation="0.4" result="blurred" />
      <feColorMatrix type="matrix" values="
        1 0 0 0 0 
        0 1 0 0 0 
        0 0 1 0 0 
        0 0 0 1.2 -0.1" in="blurred" result="sharpened" />
      <feComposite in="SourceGraphic" in2="sharpened" operator="over" />
    </filter>
  </defs>
  
  <g filter="url(#stamp)">
`;

// 1. The solid gold base of the central body
svg += `    <path d="${makeJitteryCirclePath(50, 50, 48, 20, 1)}" fill="${gold1}" />\n`;
svg += `    <path d="${makeJitteryCirclePath(50, 50, 45, 20, 1.5)}" fill="${gold2}" opacity="0.3"/>\n`;

// 2. The black gap between the outer ring and inner reel. 
// We draw a thick black ring to separate the outer edge from the inner core
svg += `    <path d="${makeJitteryCirclePath(50, 50, 38, 20, 1.2)}" fill="none" stroke="${ink}" stroke-width="4" opacity="0.9" />\n`;

// 3. Left-side curved highlights (black ink) inside the reel, matching the user's specific drawing
// Top-left arc
svg += `    <path d="${makeArcPath(50, 50, 31, Math.PI + 0.2, Math.PI + 1.0, 0.5)}" fill="none" stroke="${ink}" stroke-width="2" stroke-linecap="round" />\n`;
// Bottom-left arc
svg += `    <path d="${makeArcPath(50, 50, 31, Math.PI - 1.0, Math.PI - 0.2, 0.5)}" fill="none" stroke="${ink}" stroke-width="2" stroke-linecap="round" />\n`;

// 4. Center Hub
svg += `    <path d="${makeJitteryCirclePath(50, 50, 12, 12, 0.7)}" fill="none" stroke="${ink}" stroke-width="2" />\n`;
// Center dot
svg += `    <path d="${makeJitteryCirclePath(50, 50, 4, 8, 0.5)}" fill="${ink}" />\n`;

// 5. The exactly 5 holes arranged in a pentagon (72 degrees apart)
const numHoles = 5;
const holeRadius = 20; // Distance from center
const rHole = 8.5; // Size of holes

for (let i = 0; i < numHoles; i++) {
    // Start at -90 degrees (top)
    const angle = -Math.PI/2 + (i * Math.PI * 2 / numHoles);
    const hx = 50 + Math.cos(angle) * holeRadius;
    const hy = 50 + Math.sin(angle) * holeRadius;
    svg += `    <path d="${makeJitteryCirclePath(hx, hy, rHole, 10, 0.8)}" fill="${ink}" />\n`;
    svg += `    <!-- Inner detail -->\n`;
    svg += `    <path d="${makeArcPath(hx, hy, rHole-1.5, angle+Math.PI*0.8, angle+Math.PI*1.5, 0.4)}" fill="none" stroke="${gold2}" stroke-width="1.5" opacity="0.6" />\n`;
}

// 6. Organic ink speckles to tie the vintage feel together
for(let i=0; i<30; i++) {
    const rx = 50 + (Math.random()-0.5)*90;
    const ry = 50 + (Math.random()-0.5)*90;
    if (Math.hypot(rx-50, ry-50) < 46 && Math.hypot(rx-50, ry-50) > 6) {
        let op = Math.random() * 0.4 + 0.1;
        svg += `    <circle cx="${rx.toFixed(1)}" cy="${ry.toFixed(1)}" r="${Math.random()*1.2}" fill="${ink}" opacity="${op.toFixed(2)}" />\n`;
    }
}

svg += `  </g>\n</svg>`;

const outPath = path.join(__dirname, 'public/rating-reel.svg');
fs.writeFileSync(outPath, svg);
console.log('Saved exact 5-hole vintage SVG reel to ' + outPath);
