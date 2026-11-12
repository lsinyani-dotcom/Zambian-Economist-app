// Copies the bundled web fonts and the Capacitor core runtime into www/
// so the app works offline without any build tool.
import { copyFileSync, mkdirSync } from 'node:fs';

const out = 'www/vendor';
mkdirSync(`${out}/fonts`, { recursive: true });

const fonts = [
  ['@fontsource/source-serif-4/files', 'source-serif-4-latin-400-normal.woff2'],
  ['@fontsource/source-serif-4/files', 'source-serif-4-latin-400-italic.woff2'],
  ['@fontsource/source-serif-4/files', 'source-serif-4-latin-600-normal.woff2'],
  ['@fontsource/source-serif-4/files', 'source-serif-4-latin-700-normal.woff2'],
  ['@fontsource/inter/files', 'inter-latin-400-normal.woff2'],
  ['@fontsource/inter/files', 'inter-latin-500-normal.woff2'],
  ['@fontsource/inter/files', 'inter-latin-600-normal.woff2'],
  ['@fontsource/inter/files', 'inter-latin-700-normal.woff2'],
];
for (const [dir, file] of fonts) {
  copyFileSync(`node_modules/${dir}/${file}`, `${out}/fonts/${file}`);
}
copyFileSync('node_modules/@capacitor/core/dist/capacitor.js', `${out}/capacitor.js`);
console.log('Fonts and Capacitor runtime copied to www/vendor');
