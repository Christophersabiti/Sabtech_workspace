/**
 * Generates PWA icon PNGs from the SVG logo.
 * Run once: node scripts/generate-icons.mjs
 */
import sharp from 'sharp';
import { readFileSync, mkdirSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = dirname(__filename);

const svgPath = join(__dirname, '../public/logo.svg');
const outDir  = join(__dirname, '../public/icons');

mkdirSync(outDir, { recursive: true });
const svgBuffer = readFileSync(svgPath);

const icons = [
  { size: 192,  name: 'icon-192.png'        },
  { size: 512,  name: 'icon-512.png'        },
  { size: 180,  name: 'apple-touch-icon.png' },
];

for (const { size, name } of icons) {
  await sharp(svgBuffer)
    .resize(size, size)
    .png()
    .toFile(join(outDir, name));
  console.log(`✓ ${name} (${size}×${size})`);
}

console.log('Done — icons saved to public/icons/');
