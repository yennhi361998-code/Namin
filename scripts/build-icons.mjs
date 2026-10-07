// Builds the app icons from the shared Namin mark (src/lib/logoMark.json).
// Run after changing the mark or the icon colour: npm run icons
import { Resvg } from '@resvg/resvg-js';
import { readFileSync, writeFileSync } from 'node:fs';

const mark = JSON.parse(readFileSync('src/lib/logoMark.json', 'utf8'));
// Same colour as the header, so the installed icon matches the app.
const BG = '#CCF9FF';
const FG = '#FFFFFF';

/** Mark scaled to `fill` of the square's width (keeps aspect), centred. */
function iconSvg(size, { fill, radius = 0, weight = 1 }) {
  const [vx, vy, vw, vh] = mark.viewBox;
  const scale = (size * fill) / Math.max(vw, vh);
  const tx = (size - vw * scale) / 2 - vx * scale;
  const ty = (size - vh * scale) / 2 - vy * scale;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}">
  <rect width="${size}" height="${size}" rx="${radius}" fill="${BG}"/>
  <g transform="translate(${tx.toFixed(2)} ${ty.toFixed(2)}) scale(${scale.toFixed(5)})" fill="none">
    <g stroke="${FG}" stroke-width="${mark.stroke * weight}" stroke-linecap="round" stroke-linejoin="round">${mark.strokes.map((d) => `<path d="${d}"/>`).join('')}</g>
    <circle cx="${mark.dot.cx}" cy="${mark.dot.cy}" r="${mark.dot.r}" fill="${FG}"/>
    <path d="${mark.heart}" fill="${FG}"/>
  </g>
</svg>`;
}

const png = (svg) => new Resvg(svg).render().asPng();

// Browser tab: rounded square, mark large and strokes heavier so it stays readable at 16–32px.
writeFileSync('public/favicon.svg', iconSvg(64, { fill: 0.84, radius: 14, weight: 1.3 }));
writeFileSync('public/favicon-32.png', png(iconSvg(32, { fill: 0.86, radius: 7, weight: 1.4 })));
// iOS home screen: full-bleed square (iOS rounds the corners itself).
writeFileSync('public/apple-touch-icon.png', png(iconSvg(180, { fill: 0.72 })));
// Android / installed PWA.
writeFileSync('public/icon-192.png', png(iconSvg(192, { fill: 0.72 })));
writeFileSync('public/icon-512.png', png(iconSvg(512, { fill: 0.72 })));
// Maskable: launchers crop to circles/squircles, so keep the mark inside the 80% safe zone.
writeFileSync('public/icon-maskable-512.png', png(iconSvg(512, { fill: 0.56 })));
console.log('Icons written to public/');
