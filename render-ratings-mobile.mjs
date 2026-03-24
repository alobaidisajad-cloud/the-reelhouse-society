import sharp from 'sharp';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function jitter(val, amt) { return val + (Math.random() - 0.5) * amt; }

function makeJitteryCirclePath(cx, cy, r, segments, jitterAmt) {
    let d = "";
    for (let i = 0; i <= segments; i++) {
        const theta = (i / segments) * Math.PI * 2;
        const x = cx + Math.cos(theta) * jitter(r, jitterAmt);
        const y = cy + Math.sin(theta) * jitter(r, jitterAmt);
        if (i === 0) d += `M ${x.toFixed(1)} ${y.toFixed(1)} `;
        else {
            const pt = ((i - 1) / segments) * Math.PI * 2;
            const cp1x = cx + Math.cos(pt + 0.2) * jitter(r, jitterAmt);
            const cp1y = cy + Math.sin(pt + 0.2) * jitter(r, jitterAmt);
            const cp2x = cx + Math.cos(theta - 0.2) * jitter(r, jitterAmt);
            const cp2y = cy + Math.sin(theta - 0.2) * jitter(r, jitterAmt);
            d += `C ${cp1x.toFixed(1)} ${cp1y.toFixed(1)}, ${cp2x.toFixed(1)} ${cp2y.toFixed(1)}, ${x.toFixed(1)} ${y.toFixed(1)} `;
        }
    }
    return d + "Z";
}

function makeArcPath(cx, cy, r, sa, ea, amt) {
    let d = `M ${cx + Math.cos(sa)*r} ${cy + Math.sin(sa)*r} `;
    for (let i=1; i<=4; i++) {
        const t = sa + (ea - sa) * (i/4);
        d += `L ${(cx + Math.cos(t) * jitter(r, amt)).toFixed(1)} ${(cy + Math.sin(t) * jitter(r, amt)).toFixed(1)} `;
    }
    return d;
}

function generateReelSVG(state) {
    const gold1 = '#c6a65b';
    const gold2 = '#bd8e2e'; 
    const ink = '#0A0703';

    let filters = '';
    let gOpacity = '1';

    if (state === 'full') {
        filters = `
            <filter id="fx" x="-20%" y="-20%" width="140%" height="140%">
                <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="3" result="noise" />
                <feDisplacementMap in="SourceGraphic" in2="noise" scale="2.5" result="displaced" />
                <feGaussianBlur in="displaced" stdDeviation="0.4" result="blurred" />
                <feColorMatrix type="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 1.2 -0.1" in="blurred" result="sharpened" />
                
                <feDropShadow dx="0" dy="8" stdDeviation="6" flood-color="#000" flood-opacity="0.95" result="shadow" />
                <feMerge>
                    <feMergeNode in="shadow" />
                    <feMergeNode in="sharpened" />
                </feMerge>
            </filter>
        `;
    } else {
        filters = `
            <filter id="fx" x="-20%" y="-20%" width="140%" height="140%">
                <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="3" result="noise" />
                <feDisplacementMap in="SourceGraphic" in2="noise" scale="2.5" result="displaced" />
                <feGaussianBlur in="displaced" stdDeviation="0.6" result="blurred" />
                <feColorMatrix type="matrix" values="0.15 0 0 0 0  0 0.1 0 0 0  0 0 0.05 0 0  0 0 0 1 0" in="blurred" result="dark" />
            </filter>
        `;
        gOpacity = '0.4';
    }

    let svg = `<svg width="200" height="200" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">`;
    svg += `<defs>${filters}</defs><g filter="url(#fx)" opacity="${gOpacity}">`;

    svg += `<path d="${makeJitteryCirclePath(50, 50, 48, 20, 1)}" fill="${gold1}" />`;
    svg += `<path d="${makeJitteryCirclePath(50, 50, 45, 20, 1.5)}" fill="${gold2}" opacity="0.3"/>`;
    svg += `<path d="${makeJitteryCirclePath(50, 50, 38, 20, 1.2)}" fill="none" stroke="${ink}" stroke-width="4" opacity="0.9" />`;
    svg += `<path d="${makeArcPath(50, 50, 31, Math.PI + 0.2, Math.PI + 1.0, 0.5)}" fill="none" stroke="${ink}" stroke-width="2" stroke-linecap="round" />`;
    svg += `<path d="${makeArcPath(50, 50, 31, Math.PI - 1.0, Math.PI - 0.2, 0.5)}" fill="none" stroke="${ink}" stroke-width="2" stroke-linecap="round" />`;
    
    // Hub
    svg += `<path d="${makeJitteryCirclePath(50, 50, 12, 12, 0.7)}" fill="none" stroke="${ink}" stroke-width="2" />`;
    svg += `<path d="${makeJitteryCirclePath(50, 50, 4, 8, 0.5)}" fill="${ink}" />`;

    // 5 Holes
    for (let i = 0; i < 5; i++) {
        const angle = -Math.PI/2 + (i * Math.PI * 2 / 5);
        const hx = 50 + Math.cos(angle) * 20;
        const hy = 50 + Math.sin(angle) * 20;
        svg += `<path d="${makeJitteryCirclePath(hx, hy, 8.5, 10, 0.8)}" fill="${ink}" opacity="0.95" />`;
        svg += `<path d="${makeArcPath(hx, hy, 7, angle+Math.PI*0.8, angle+Math.PI*1.5, 0.4)}" fill="none" stroke="${gold2}" stroke-width="1.5" opacity="0.6" />`;
    }

    svg += `</g></svg>`;
    return svg;
}

async function run() {
    const full = generateReelSVG('full');
    const empty = generateReelSVG('empty');
    const d = path.join(__dirname, 'public');

    // 1. the pure vectors into huge 200x200 PNG textures (for extreme crisp retina rendering)
    await sharp(Buffer.from(full)).png().toFile(path.join(d, 'rating-full.png'));
    await sharp(Buffer.from(empty)).png().toFile(path.join(d, 'rating-empty.png'));

    // 2. the half state
    const fullBuf = await sharp(Buffer.from(full)).png().toBuffer();
    const mask = Buffer.from('<svg width="200" height="200"><rect x="0" y="0" width="100" height="200" fill="white" /></svg>');
    
    const halfGold = await sharp(fullBuf)
        .composite([{ input: mask, blend: 'dest-in' }])
        .png()
        .toBuffer();

    await sharp(Buffer.from(empty))
        .composite([{ input: halfGold, blend: 'over' }])
        .png()
        .toFile(path.join(d, 'rating-half.png'));

    console.log('Mobile-friendly high-res PNG rating states created successfully.');
}

run().catch(console.error);
