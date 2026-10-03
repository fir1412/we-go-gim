import { cpSync, mkdirSync, rmSync, readFileSync, writeFileSync, lstatSync, readdirSync } from 'node:fs';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const target = join(root, 'www');
const assets = ['index.html', 'css', 'js', 'fonts', 'icons', 'anatomy', 'privacy.html', 'terms.html'];
function check(path) {
  if (lstatSync(path).isSymbolicLink()) throw Error('Public asset symlink: ' + path);
  if (lstatSync(path).isDirectory()) for (const name of readdirSync(path)) check(join(path, name));
}
for (const asset of assets) check(join(root, asset));
rmSync(target, { recursive: true, force: true });
mkdirSync(target);
for (const asset of assets) cpSync(join(root, asset), join(target, asset), { recursive: true });
// Only the bridge is bundled; existing relative modules stay usable on the website.
await build({ entryPoints: [join(root, 'native/bridge.js')], bundle: true, format: 'esm', outfile: join(target, 'native/bridge.js'), target: 'chrome109' });
writeFileSync(join(target, 'native/start.js'), 'import "./bridge.js";\nawait import("../js/app.js");\n');
writeFileSync(join(target, 'index.html'), readFileSync(join(target, 'index.html'), 'utf8').replace('<script type="module" src="js/app.js"></script>', '<script type="module" src="native/start.js"></script>'));
console.log('Packaged public assets and native bridge; no service worker or private files.');
