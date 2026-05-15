const fs = require('fs');
const path = require('path');

const sources = [
  path.join(__dirname, '..', 'node_modules', 'mermaid', 'dist', 'mermaid.min.js'),
  path.join(__dirname, '..', 'node_modules', 'mermaid', 'dist', 'mermaid.js'),
];

const target = path.join(__dirname, '..', 'media', 'mermaid.min.js');

fs.mkdirSync(path.dirname(target), { recursive: true });

const found = sources.find((p) => fs.existsSync(p));
if (!found) {
  console.warn('[comment-md] mermaid.min.js not found in node_modules. Run `npm install` first.');
  process.exit(0);
}

fs.copyFileSync(found, target);
console.log(`[comment-md] Copied ${path.basename(found)} -> media/mermaid.min.js`);
