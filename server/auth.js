import crypto from 'node:crypto';
import { config } from './config.js';

const LOOPBACK = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

function hostname(host) {
  if (!host) return '';
  if (host.startsWith('[')) return host.slice(0, host.indexOf(']') + 1);
  return host.split(':')[0].toLowerCase();
}

export function isLocalRequest(req) {
  if (!LOOPBACK.has(req.socket.remoteAddress)) return false;
  const fwd = req.headers['x-forwarded-for'];
  if (fwd && !String(fwd).split(',').every(ip => LOOPBACK.has(ip.trim()))) return false;
  return LOCAL_HOSTS.has(hostname(req.headers.host));
}

function safeEqual(a, b) {
  const ha = crypto.createHash('sha256').update(a).digest();
  const hb = crypto.createHash('sha256').update(b).digest();
  return crypto.timingSafeEqual(ha, hb);
}

export function authenticate(req) {
  const bearer = /^Bearer\s+(.+)$/i.exec(req.headers.authorization || '');
  const provided = String((bearer && bearer[1]) || req.headers['x-api-key'] || '').trim();
  if (provided) {
    if (config.apiKey && safeEqual(provided, config.apiKey)) return { ok: true, via: 'key' };
    return { ok: false, status: 401, error: 'Clé API invalide' };
  }
  if (config.trustLocalhost && isLocalRequest(req)) return { ok: true, via: 'local' };
  return {
    ok: false,
    status: 401,
    error: config.apiKey
      ? 'Clé API manquante (en-tête "Authorization: Bearer <clé>")'
      : "API accessible uniquement depuis l'ordinateur hôte. Définis HAKOOT_API_KEY pour l'accès distant.",
  };
}

export function requireAuth(req, res, next) {
  const result = authenticate(req);
  if (result.ok) return next();
  res.status(result.status).json({ error: result.error });
}

export function rateLimit({ windowMs = 60000, max = 300 } = {}) {
  const hits = new Map();
  setInterval(() => {
    const now = Date.now();
    for (const [ip, h] of hits) if (h.reset < now) hits.delete(ip);
  }, windowMs).unref();
  return (req, res, next) => {
    const ip = req.socket.remoteAddress || 'unknown';
    const now = Date.now();
    let h = hits.get(ip);
    if (!h || h.reset < now) {
      h = { count: 0, reset: now + windowMs };
      hits.set(ip, h);
    }
    h.count++;
    if (h.count > max) {
      res.set('Retry-After', String(Math.ceil((h.reset - now) / 1000)));
      return res.status(429).json({ error: 'Trop de requêtes, réessaie dans un instant' });
    }
    next();
  };
}

export function baseUrl(req) {
  return config.publicUrl || `${req.protocol}://${req.get('host')}`;
}
