import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { io } from 'socket.io-client';

export const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

export function tempDir(prefix = 'hakoot-test-') {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

export async function startServer({ env = {}, dataDir } = {}) {
  const cwd = tempDir();
  const dir = dataDir || path.join(cwd, 'data');
  const child = spawn(process.execPath, [path.join(ROOT, 'server/index.js')], {
    cwd,
    env: {
      ...process.env,
      HAKOOT_API_KEY: '',
      HAKOOT_TRUST_LOCALHOST: '',
      HAKOOT_PUBLIC_URL: '',
      ...env,
      PORT: '0',
      HAKOOT_DATA_DIR: dir,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  const port = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Le serveur n'a pas démarré:\n${output}`)), 15000);
    child.stdout.on('data', d => {
      output += d;
      const m = /localhost:(\d+)/.exec(output);
      if (m) {
        clearTimeout(timer);
        resolve(Number(m[1]));
      }
    });
    child.stderr.on('data', d => (output += d));
    child.on('exit', code => {
      clearTimeout(timer);
      reject(new Error(`Serveur arrêté (code ${code}):\n${output}`));
    });
  });
  const url = `http://localhost:${port}`;
  return {
    url,
    port,
    dataDir: dir,
    output: () => output,
    stop: () =>
      new Promise(resolve => {
        if (child.exitCode !== null) return resolve();
        child.once('exit', () => resolve());
        child.kill();
      }),
  };
}

export function createClients(url) {
  const sockets = [];
  const connect = () =>
    new Promise((resolve, reject) => {
      const s = io(url, { transports: ['websocket'], forceNew: true, reconnection: false });
      s.last = null;
      s.on('host:state', v => (s.last = v));
      s.on('player:state', v => (s.last = v));
      sockets.push(s);
      s.once('connect', () => resolve(s));
      s.once('connect_error', reject);
    });
  const closeAll = () => sockets.forEach(s => s.close());
  return { connect, closeAll };
}

export const call = (s, event, payload = {}) => s.timeout(5000).emitWithAck(event, payload);

export function waitState(s, pred, ms = 10000) {
  return new Promise((resolve, reject) => {
    if (s.last && pred(s.last)) return resolve(s.last);
    const handler = v => {
      if (!pred(v)) return;
      clearTimeout(timer);
      s.off('host:state', handler);
      s.off('player:state', handler);
      resolve(v);
    };
    const timer = setTimeout(() => {
      s.off('host:state', handler);
      s.off('player:state', handler);
      reject(new Error(`Timeout, dernier état: ${s.last ? s.last.phase : 'aucun'}`));
    }, ms);
    s.on('host:state', handler);
    s.on('player:state', handler);
  });
}

export const waitEvent = (s, event, ms = 5000) =>
  new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timeout sur ${event}`)), ms);
    s.once(event, data => {
      clearTimeout(timer);
      resolve(data);
    });
  });

export function sampleQuiz(overrides = {}) {
  return {
    title: 'Quiz de test',
    description: 'Pour les tests',
    questions: [
      { type: 'quiz', text: 'Q1', answers: ['A', 'B', 'C', 'D'], correct: [1], timeLimit: 5, points: 1000 },
      { type: 'truefalse', text: 'Q2', correct: [0], timeLimit: 5, points: 2000 },
    ],
    ...overrides,
  };
}

export async function http(url, path, { method = 'GET', body, headers = {}, raw } = {}) {
  const res = await fetch(`${url}${path}`, {
    method,
    headers: { ...(body !== undefined ? { 'content-type': 'application/json' } : {}), ...headers },
    body: raw !== undefined ? raw : body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  return { status: res.status, data, headers: res.headers };
}

export function rawHttp(port, { method = 'GET', path: p = '/', headers = {}, body } = {}) {
  return import('node:http').then(
    ({ request }) =>
      new Promise((resolve, reject) => {
        const req = request({ host: '127.0.0.1', port, method, path: p, headers }, res => {
          let data = '';
          res.on('data', d => (data += d));
          res.on('end', () => {
            let json = null;
            try {
              json = JSON.parse(data);
            } catch {}
            resolve({ status: res.statusCode, data: json ?? data });
          });
        });
        req.on('error', reject);
        if (body) req.write(body);
        req.end();
      }),
  );
}
