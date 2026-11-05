import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

try {
  process.loadEnvFile();
} catch {}

const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));

const port = process.env.PORT === undefined || process.env.PORT === '' ? 3000 : Number(process.env.PORT);

export const config = {
  version: pkg.version,
  port: Number.isInteger(port) && port >= 0 ? port : 3000,
  apiKey: (process.env.HAKOOT_API_KEY || '').trim(),
  trustLocalhost: process.env.HAKOOT_TRUST_LOCALHOST !== 'false',
  dataDir: path.resolve(process.env.HAKOOT_DATA_DIR || path.join(ROOT, 'data')),
  publicUrl: (process.env.HAKOOT_PUBLIC_URL || '').replace(/\/+$/, ''),
  dist: path.join(ROOT, 'dist'),
};
