// Copie les fichiers de la PWA dans dist/ (dossier publié par Vercel).
// Usage : npm run build

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'dist');

const FILES = [
  'index.html',
  'scanner.html',
  'style.css',
  'manifest.json',
  'sw.js',
  'js',
  'lib',
  'images',
];

fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT);

for (const file of FILES) {
  fs.cpSync(path.join(ROOT, file), path.join(OUT, file), { recursive: true });
}

console.log(`PWA copiée dans ${path.relative(ROOT, OUT)}/ (${FILES.length} éléments).`);
