// Package the user's original drawing without redrawing or changing its orientation.
// Canvas renders the same artwork at the raster sizes required by Android/PWA/Play.
import { launch } from '../tests/e2e/browser.mjs';
import { mkdirSync, writeFileSync, readFileSync, readdirSync } from 'node:fs';
import { dirname } from 'node:path';
const b = await launch();
const exports = [['icons/icon-192.png', 192], ['icons/icon-512.png', 512],
  ['icons/apple-touch-icon.png', 180], ['icons/favicon-48.png', 48],
  ['icons/icon-maskable-512.png', 512, .66], ['release/store-icon-512.png', 512]];
for (const [density, size] of [['mdpi', 48], ['hdpi', 72], ['xhdpi', 96], ['xxhdpi', 144], ['xxxhdpi', 192]]) {
  for (const name of ['ic_launcher', 'ic_launcher_round']) exports.push([`android/app/src/main/res/mipmap-${density}/${name}.png`, size]);
  exports.push([`android/app/src/main/res/mipmap-${density}/ic_launcher_foreground.png`, size * 108 / 48, .60]);
}
exports.push(['icons/og-image.png', 1200, .70, 630]);
for (const folder of readdirSync('android/app/src/main/res').filter(n => n.startsWith('drawable-'))) {
  const file = `android/app/src/main/res/${folder}/splash.png`;
  try {
    const png = readFileSync(file);
    exports.push([file, png.readUInt32BE(16), .40, png.readUInt32BE(20)]);
  } catch { /* no legacy splash resource */ }
}
try {
  await b.go('__blank');
  for (const [file, width, scale = 1, height = width] of exports) {
    const data = await b.run(async (width, height, scale) => {
      const img = new Image(); img.src = 'icons/official-source.jpg'; await img.decode();
      const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
      const ctx = canvas.getContext('2d'); ctx.fillStyle = '#ff5c2b'; ctx.fillRect(0, 0, width, height);
      ctx.imageSmoothingQuality = 'high';
      const side = Math.min(width, height) * scale;
      ctx.drawImage(img, (width - side) / 2, (height - side) / 2, side, side);
      return canvas.toDataURL('image/png').split(',')[1];
    }, width, height, scale);
    mkdirSync(dirname(file), { recursive: true }); writeFileSync(file, Buffer.from(data, 'base64'));
  }
} finally { await b.close(); }
for (const [name, png] of [['icon.svg', 'icon-512.png'], ['icon-maskable.svg', 'icon-maskable-512.png']]) {
  const data = readFileSync(`icons/${png}`).toString('base64');
  writeFileSync(`icons/${name}`, `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512"><title>we go gim official icon</title><image width="512" height="512" href="data:image/png;base64,${data}"/></svg>\n`);
}
console.log(`Exported ${exports.length} icon assets from official-source.jpg.`);
