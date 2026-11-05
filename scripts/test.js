import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const groups = process.argv.slice(2).length ? process.argv.slice(2) : ['unit', 'integration', 'ui'];

const walk = dir =>
  fs.existsSync(dir)
    ? fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => (e.isDirectory() ? walk(path.join(dir, e.name)) : e.name.endsWith('.test.js') ? [path.join(dir, e.name)] : []))
    : [];

const files = groups.flatMap(g => walk(path.join(root, 'test', g))).sort();
if (!files.length) {
  console.error(`Aucun fichier de test pour : ${groups.join(', ')}`);
  process.exit(1);
}

const { status } = spawnSync(process.execPath, ['--no-warnings=ExperimentalWarning', '--test', '--test-reporter=spec', ...files], {
  cwd: root,
  stdio: 'inherit',
});
process.exit(status ?? 1);
