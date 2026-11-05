import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const version = (process.argv[2] || '').replace(/^v/, '');
const changelog = fs.readFileSync(path.join(root, 'CHANGELOG.md'), 'utf8');
const start = changelog.indexOf(`## [${version}]`);
if (!version || start === -1) {
  console.error(`Version ${version || '(vide)'} absente du CHANGELOG`);
  process.exit(1);
}
const rest = changelog.slice(start);
const next = rest.indexOf('\n## [', 1);
const section = (next === -1 ? rest : rest.slice(0, next)).split('\n').slice(1).join('\n').trim();

console.log(`${section}

## Installation

1. Télécharge \`hakoot-v${version}.zip\` ci-dessous et décompresse-le.
2. Dans le dossier : \`npm ci --omit=dev\` puis \`npm start\` (Node.js 20.19+).
3. Ouvre http://localhost:3000/create

Le client est déjà compilé dans l'archive. Documentation API et MCP : [docs/API.md](https://github.com/Siruuis/hakoot/blob/v${version}/docs/API.md)`);
