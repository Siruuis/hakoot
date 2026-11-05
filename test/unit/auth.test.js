import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

process.env.HAKOOT_API_KEY = 'secret-key-123';
process.env.HAKOOT_TRUST_LOCALHOST = '';
const { authenticate, isLocalRequest } = await import('../../server/auth.js');

const req = ({ ip = '127.0.0.1', host = 'localhost:3000', headers = {} } = {}) => ({
  socket: { remoteAddress: ip },
  headers: { host, ...headers },
});

describe('auth', () => {
  it('reconnaît les requêtes locales', () => {
    assert.equal(isLocalRequest(req()), true);
    assert.equal(isLocalRequest(req({ ip: '::1', host: '[::1]:3000' })), true);
    assert.equal(isLocalRequest(req({ ip: '::ffff:127.0.0.1', host: '127.0.0.1' })), true);
    assert.equal(isLocalRequest(req({ ip: '192.168.1.20' })), false);
  });

  it('bloque le DNS rebinding et les proxys venant du réseau', () => {
    assert.equal(isLocalRequest(req({ host: 'evil.example.com' })), false);
    assert.equal(isLocalRequest(req({ host: '' })), false);
    assert.equal(isLocalRequest(req({ headers: { 'x-forwarded-for': '192.168.1.50' } })), false);
    assert.equal(isLocalRequest(req({ headers: { 'x-forwarded-for': '127.0.0.1, ::1' } })), true);
  });

  it('accepte la bonne clé en Bearer ou X-API-Key', () => {
    const remote = { ip: '10.0.0.5', host: 'hakoot.lan' };
    assert.equal(authenticate(req({ ...remote, headers: { authorization: 'Bearer secret-key-123' } })).ok, true);
    assert.equal(authenticate(req({ ...remote, headers: { authorization: 'bearer   secret-key-123  ' } })).ok, true);
    assert.equal(authenticate(req({ ...remote, headers: { 'x-api-key': 'secret-key-123' } })).ok, true);
  });

  it('refuse une clé fausse même en local', () => {
    const r = authenticate(req({ headers: { authorization: 'Bearer nope' } }));
    assert.equal(r.ok, false);
    assert.equal(r.status, 401);
  });

  it('autorise le local sans clé, refuse le distant sans clé', () => {
    assert.equal(authenticate(req()).ok, true);
    const r = authenticate(req({ ip: '10.0.0.5', host: 'hakoot.lan' }));
    assert.equal(r.ok, false);
    assert.match(r.error, /manquante/);
  });
});
