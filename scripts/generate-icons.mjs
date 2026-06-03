/**
 * Generates favicon and PWA icon assets from the official app icon SVG.
 * Run once: node scripts/generate-icons.mjs
 */
import sharp from 'sharp';
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const svgPath = join(__dirname, '../public/brand/sabtech-workspace-app-icon.svg');
const publicDir = join(__dirname, '../public');
const appDir = join(__dirname, '../src/app');
const outDir = join(publicDir, 'icons');

mkdirSync(outDir, { recursive: true });
const svgBuffer = readFileSync(svgPath);

const icons = [
  { size: 180, name: 'apple-touch-icon.png' },
  { size: 192, name: 'icon-192.png' },
  { size: 512, name: 'icon-512.png' },
  { size: 72, name: 'badge-72.png' },
];

for (const { size, name } of icons) {
  await sharp(svgBuffer)
    .resize(size, size)
    .png()
    .toFile(join(outDir, name));
  console.log(`OK ${name} (${size}x${size})`);
}

await sharp(svgBuffer)
  .flatten({ background: '#091545' })
  .resize(432, 432, { fit: 'contain' })
  .extend({
    top: 40,
    right: 40,
    bottom: 40,
    left: 40,
    background: '#091545',
  })
  .png()
  .toFile(join(outDir, 'maskable-icon-512.png'));
console.log('OK maskable-icon-512.png (512x512)');

const faviconPngs = await Promise.all(
  [16, 32, 48].map(async (size) => ({
    size,
    data: await sharp(svgBuffer).resize(size, size).png().toBuffer(),
  })),
);

let imageOffset = 6 + faviconPngs.length * 16;
const header = Buffer.alloc(imageOffset);
header.writeUInt16LE(0, 0);
header.writeUInt16LE(1, 2);
header.writeUInt16LE(faviconPngs.length, 4);

faviconPngs.forEach(({ size, data }, index) => {
  const entryOffset = 6 + index * 16;
  header.writeUInt8(size === 256 ? 0 : size, entryOffset);
  header.writeUInt8(size === 256 ? 0 : size, entryOffset + 1);
  header.writeUInt8(0, entryOffset + 2);
  header.writeUInt8(0, entryOffset + 3);
  header.writeUInt16LE(1, entryOffset + 4);
  header.writeUInt16LE(32, entryOffset + 6);
  header.writeUInt32LE(data.length, entryOffset + 8);
  header.writeUInt32LE(imageOffset, entryOffset + 12);
  imageOffset += data.length;
});

const favicon = Buffer.concat([header, ...faviconPngs.map(({ data }) => data)]);
writeFileSync(join(publicDir, 'favicon.ico'), favicon);
writeFileSync(join(appDir, 'favicon.ico'), favicon);
copyFileSync(svgPath, join(publicDir, 'favicon.svg'));
copyFileSync(svgPath, join(appDir, 'icon.svg'));
copyFileSync(svgPath, join(publicDir, 'logo.svg'));

console.log('OK favicon.ico');
console.log('Done - brand icons saved to public/icons/.');
