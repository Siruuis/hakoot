import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const file = path.join(root, '.env');
const key = `hk_${crypto.randomBytes(24).toString('base64url')}`;
const line = `HAKOOT_API_KEY=${key}`;

let content = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
content = /^HAKOOT_API_KEY=.*$/m.test(content) ? content.replace(/^HAKOOT_API_KEY=.*$/m, line) : `${content}${content && !content.endsWith('\n') ? '\n' : ''}${line}\n`;
fs.writeFileSync(file, content);

console.log(`Nouvelle clé API écrite dans .env :\n\n  ${key}\n`);
console.log('Redémarre le serveur, puis utilise-la avec l\'en-tête "Authorization: Bearer <clé>".');
