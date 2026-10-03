import { spawnSync } from 'node:child_process';
import { readFileSync, mkdirSync, copyFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
const root = resolve(import.meta.dirname, '..');
const env = { ...process.env };
env.GIM_KEYSTORE ||= 'C:/Users/user/wegogim-android-keys/upload-keystore.jks';
if (!env.GIM_KEYSTORE_PASSWORD) {
  const passwordFile = process.env.GIM_PASSWORD_FILE || 'C:/Users/user/wegogim-android-keys/KEYSTORE-PASSWORD.txt';
  const contents = readFileSync(passwordFile, 'utf8').trim();
  const labeled = contents.match(/^(?:Keystore password and key password \(same\)|keystore(?:\s*(?:and|\+|&)\s*key)?\s+password|password(?:\s*\([^)]*\))?)\s*:\s*(.+)$/im);
  if (/\r|\n/.test(contents) && !labeled) throw Error('Password file must contain a labeled password, or set GIM_KEYSTORE_PASSWORD.');
  env.GIM_KEYSTORE_PASSWORD = labeled ? labeled[1].trim() : contents;
}
if (!env.GIM_KEYSTORE_PASSWORD) throw Error('Upload signing password required');
function run(command, args, options = {}) {
  const result = spawnSync(command, args, { cwd: root, env, stdio: 'inherit', ...options });
  if (result.error || result.status !== 0) throw Error(`Build step failed: ${command}`);
}
run(process.execPath, ['scripts/build-native.mjs']);
run(process.execPath, ['node_modules/@capacitor/cli/bin/capacitor', 'sync', 'android']);
// Capacitor sync may rewrite the machine-local SDK path. Escape the Windows drive colon for lint.
const local = resolve(root, 'android/local.properties');
writeFileSync(local, readFileSync(local, 'utf8').replace(/^(sdk.dir=[A-Za-z]):/m, '$1\\:').replace(/\r\n/g, '\n'));
run('cmd.exe', ['/d', '/c', 'android\\gradlew.bat', '-p', 'android', 'assembleRelease', 'bundleRelease', 'lintRelease']);
mkdirSync(resolve(root, 'output/release'), { recursive: true });
const files = [
  ['android/app/build/outputs/bundle/release/app-release.aab', 'we-go-gim-1.11.0.aab'],
  ['android/app/build/outputs/apk/release/app-release.apk', 'we-go-gim-1.11.0.apk']
];
const manifest = [];
for (const [source, name] of files) {
  const bytes = readFileSync(resolve(root, source));
  copyFileSync(resolve(root, source), resolve(root, 'output/release', name));
  manifest.push({ name, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') });
}
writeFileSync(resolve(root, 'output/release/artifacts.json'), JSON.stringify(manifest, null, 2));
console.log('Signed upload artifacts copied to output/release. No credentials included.');
