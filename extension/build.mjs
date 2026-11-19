import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const extensionDir = path.dirname(fileURLToPath(import.meta.url));
const sourceDir = path.join(extensionDir, 'src');
const outputDir = path.join(extensionDir, 'dist');

for (const browser of ['chrome', 'firefox']) {
  const browserDir = path.join(outputDir, browser);
  fs.mkdirSync(browserDir, { recursive: true });
  fs.copyFileSync(path.join(extensionDir, `manifest.${browser}.json`), path.join(browserDir, 'manifest.json'));
  for (const file of ['popup.html', 'popup.css', 'popup.js']) fs.copyFileSync(path.join(sourceDir, file), path.join(browserDir, file));
  console.log(`Built extension/${path.relative(outputDir, browserDir)}`);
}
