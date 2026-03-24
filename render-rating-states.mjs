import sharp from 'sharp';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function jitter(val, amt) {
    return val + (Math.random() - 0.5) * amt;
}

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

function createRatingSVG(state) {
    const gold1 = '#c6a65b';
    const gold2 = '#bd8e2e'; 
    const ink = '#0A0703';

    // Different coloring based on state
    const isFull = state === 'full';
    const isEmpty = state === 'empty';

    let filterStr = '';
    let opacityWrap = 1;

    if (isFull) {
        filterStr = `
            <filter id="stamp" x="-20%" y="-20%" width="140%" height="140%">
                <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="3" result="noise" />
                <feDisplacementMap in="SourceGraphic" in2="noise" scale="2" result="displaced" />
                <feGaussianBlur in="displaced" stdDeviation="0.4" result="blurred" />
                <!-- Premium Drop shadow for full state -->
                <feDropShadow dx="0" dy="8" stdDeviation="6" flood-color="#000000" flood-opacity="0.9" result="shadow" />
                <feMerge>
                    <feMergeNode in="shadow" />
                    <feMergeNode in="blurred" />
                </feMerge>
            </filter>
        `;
    } else {
        filterStr = `
            <filter id="stamp" x="-20%" y="-20%" width="140%" height="140%">
                <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="3" result="noise" />
                <feDisplacementMap in="SourceGraphic" in2="noise" scale="2" result="displaced" />
                <!-- Darken empty state -->
                <feColorMatrix type="matrix" values="
                    0.2 0 0 0 0
                    0 0.15 0 0 0
                    0 0 0.1 0 0
                    0 0 0 1 0" />
            </filter>
        `;
        opacityWrap = 0.4;
    }

    let svg = `<svg width="200" height="200" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
      <defs>${filterStr}</defs>
      <g filter="url(#stamp)" opacity="${opacityWrap}">
    `;

    // 1. The solid gold base of the central body
    svg += `    <path d="${makeJitteryCirclePath(50, 50, 48, 20, 1)}" fill="${gold1}" />\n`;
    svg += `    <path d="${makeJitteryCirclePath(50, 50, 45, 20, 1.5)}" fill="${gold2}" opacity="0.4"/>\n`;

    // 2. The black gap between the outer ring and inner reel. 
    svg += `    <path d="${makeJitteryCirclePath(50, 50, 38, 20, 1.2)}" fill="none" stroke="${ink}" stroke-width="4" opacity="0.9" />\n`;

    // 3. Left-side curved highlights
    svg += `    <path d="${makeArcPath(50, 50, 31, Math.PI + 0.2, Math.PI + 1.0, 0.5)}" fill="none" stroke="${ink}" stroke-width="2" stroke-linecap="round" />\n`;
    svg += `    <path d="${makeArcPath(50, 50, 31, Math.PI - 1.0, Math.PI - 0.2, 0.5)}" fill="none" stroke="${ink}" stroke-width="2" stroke-linecap="round" />\n`;

    // 4. Center Hub
    svg += `    <path d="${makeJitteryCirclePath(50, 50, 12, 12, 0.7)}" fill="none" stroke="${ink}" stroke-width="2" />\n`;
    svg += `    <path d="${makeJitteryCirclePath(50, 50, 4, 8, 0.5)}" fill="${ink}" />\n`;

    // 5. The 5 holes
    const numHoles = 5;
    for (let i = 0; i < numHoles; i++) {
        const angle = -Math.PI/2 + (i * Math.PI * 2 / numHoles);
        const hx = 50 + Math.cos(angle) * 20;
        const hy = 50 + Math.sin(angle) * 20;
        svg += `    <path d="${makeJitteryCirclePath(hx, hy, 8.5, 10, 0.8)}" fill="${ink}" />\n`;
        svg += `    <path d="${makeArcPath(hx, hy, 7, angle+Math.PI*0.8, angle+Math.PI*1.5, 0.4)}" fill="none" stroke="${gold2}" stroke-width="1.5" opacity="0.6" />\n`;
    }

    svg += `  </g>\n</svg>`;
    return svg;
}

async function run() {
    const fullSvg = createRatingSVG('full');
    const emptySvg = createRatingSVG('empty');

    const outDir = path.join(__dirname, 'public');

    // Convert SVG strings to perfectly crisp, fast-loading 200x200 PNGs
    await sharp(Buffer.from(fullSvg)).png().toFile(path.join(outDir, 'rating-full.png'));
    await sharp(Buffer.from(emptySvg)).png().toFile(path.join(outDir, 'rating-empty.png'));
    
    // Half state: Create a composite where left side is full, right side is empty
    const fullBuf = await sharp(Buffer.from(fullSvg)).png().toBuffer();
    const halfMask = Buffer.from(\`<svg width="200" height="200"><rect x="0" y="0" width="100" height="200" fill="white" /></svg>\`);
    
    // Create the left half of the gold star
    const goldHalf = await sharp(fullBuf)
        .composite([{ input: halfMask, blend: 'dest-in' }])
        .png()
        .toBuffer();

    // Overlay gold half on top of the empty background star
    await sharp(Buffer.from(emptySvg))
        .composite([{ input: goldHalf, blend: 'over' }])
        .png()
        .toFile(path.join(outDir, 'rating-half.png'));

    console.log('Successfully generated extremely premium rating state PNGs.');
}

run().catch(console.error);
