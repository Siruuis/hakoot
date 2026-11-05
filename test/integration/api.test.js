import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { call, createClients, http, rawHttp, ROOT, sampleQuiz, startServer, waitState } from '../helpers.js';

describe('API REST (sans clé, locale)', () => {
  let server;
  before(async () => {
    server = await startServer();
  });
  after(() => server.stop());

  it('expose health et schema sans authentification', async () => {
    const h = await http(server.url, '/api/health');
    assert.equal(h.status, 200);
    assert.equal(h.data.ok, true);
    assert.equal(h.data.version, JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')).version);
    assert.equal(h.data.auth.apiKeyConfigured, false);
    const s = await http(server.url, '/api/schema');
    assert.ok(s.data.format.questions);
    assert.ok(s.data.example.questions.length > 0);
    assert.equal(h.headers.get('x-powered-by'), null);
  });

  it('CRUD complet', async () => {
    const created = await http(server.url, '/api/quizzes', { method: 'POST', body: sampleQuiz({ title: 'API' }) });
    assert.equal(created.status, 201);
    const { id } = created.data.quiz;
    assert.equal(created.headers.get('location'), `/api/quizzes/${id}`);
    assert.equal(created.data.links.launch, `${server.url}/launch/${id}`);

    const list = await http(server.url, '/api/quizzes');
    assert.ok(list.data.quizzes.some(q => q.id === id && q.questionCount === 2));

    const got = await http(server.url, `/api/quizzes/${id}`);
    assert.deepEqual(got.data.quiz.questions[1].answers, ['Vrai', 'Faux']);

    const patched = await http(server.url, `/api/quizzes/${id}`, { method: 'PATCH', body: { title: 'API 2' } });
    assert.equal(patched.data.quiz.title, 'API 2');
    assert.equal(patched.data.quiz.description, 'Pour les tests');

    const put = await http(server.url, `/api/quizzes/${id}`, { method: 'PUT', body: { title: 'Remplacé', questions: sampleQuiz().questions.slice(0, 1) } });
    assert.equal(put.data.quiz.description, '');
    assert.equal(put.data.quiz.questions.length, 1);

    const added = await http(server.url, `/api/quizzes/${id}/questions`, {
      method: 'POST',
      body: { questions: [{ type: 'truefalse', text: 'Vrai ?', correct: false }] },
    });
    assert.equal(added.data.quiz.questions.length, 2);
    assert.deepEqual(added.data.quiz.questions[1].correct, [1]);

    const addedArray = await http(server.url, `/api/quizzes/${id}/questions`, { method: 'POST', body: [{ text: 'x', answers: ['a', 'b'], correct: 0 }] });
    assert.equal(addedArray.data.quiz.questions.length, 3);

    assert.equal((await http(server.url, `/api/quizzes/${id}`, { method: 'DELETE' })).status, 204);
    assert.equal((await http(server.url, `/api/quizzes/${id}`)).status, 404);
    assert.equal((await http(server.url, `/api/quizzes/${id}`, { method: 'DELETE' })).status, 404);
  });

  it('renvoie des erreurs claires', async () => {
    const bad = await http(server.url, '/api/quizzes', { method: 'POST', body: { title: '', questions: [{ text: '' }] } });
    assert.equal(bad.status, 400);
    assert.ok(bad.data.errors.length >= 2);
    assert.equal((await http(server.url, '/api/quizzes', { method: 'POST', raw: '{oops', headers: { 'content-type': 'application/json' } })).status, 400);
    const big = await http(server.url, '/api/quizzes', { method: 'POST', raw: JSON.stringify({ title: 'x'.repeat(1_200_000) }), headers: { 'content-type': 'application/json' } });
    assert.equal(big.status, 413);
    assert.equal((await http(server.url, '/api/nope')).status, 404);
    assert.equal((await http(server.url, '/api/quizzes', { method: 'POST', body: [] })).status, 400);
    assert.equal((await http(server.url, '/api/quizzes', { method: 'POST' })).status, 400);
  });

  it('valide sans enregistrer', async () => {
    const before = (await http(server.url, '/api/quizzes')).data.quizzes.length;
    const ok = await http(server.url, '/api/quizzes/validate', { method: 'POST', body: sampleQuiz() });
    assert.equal(ok.data.valid, true);
    const ko = await http(server.url, '/api/quizzes/validate', { method: 'POST', body: { title: 'x', questions: [{ text: 'q', answers: ['a'] }] } });
    assert.equal(ko.data.valid, false);
    assert.equal((await http(server.url, '/api/quizzes')).data.quizzes.length, before);
  });

  it('refuse un en-tête Host étranger (DNS rebinding)', async () => {
    const r = await rawHttp(server.port, { path: '/api/quizzes', headers: { host: 'evil.example' } });
    assert.equal(r.status, 401);
    const fwd = await rawHttp(server.port, { path: '/api/quizzes', headers: { host: 'localhost', 'x-forwarded-for': '192.168.1.9' } });
    assert.equal(fwd.status, 401);
  });

  it('liste les parties en cours', async () => {
    const clients = createClients(server.url);
    try {
      const host = await clients.connect();
      const { pin } = await call(host, 'host:create', { quiz: sampleQuiz({ title: 'En direct' }) });
      const p = await clients.connect();
      await call(p, 'player:join', { pin, name: 'Zoé' });
      await waitState(host, v => v.playerCount === 1);
      const g = await http(server.url, '/api/games');
      const game = g.data.games.find(x => x.pin === pin);
      assert.equal(game.title, 'En direct');
      assert.equal(game.phase, 'lobby');
      assert.equal(game.players, 1);
      assert.equal(game.hostConnected, true);
    } finally {
      clients.closeAll();
    }
  });

  it('sert l\'application pour /launch/:id', async () => {
    if (!fs.existsSync(path.join(ROOT, 'dist', 'index.html'))) return;
    const r = await http(server.url, '/launch/abc');
    assert.equal(r.status, 200);
    assert.match(r.data, /<div id="root">/);
  });
});

describe('API REST (avec clé)', () => {
  let server;
  const key = 'test-key-' + Math.random().toString(36).slice(2);
  before(async () => {
    server = await startServer({ env: { HAKOOT_API_KEY: key, HAKOOT_TRUST_LOCALHOST: 'false', HAKOOT_PUBLIC_URL: 'https://quiz.example.com/' } });
  });
  after(() => server.stop());

  it('exige la clé quand le local n\'est pas de confiance', async () => {
    assert.equal((await http(server.url, '/api/quizzes')).status, 401);
    assert.equal((await http(server.url, '/api/quizzes', { headers: { authorization: 'Bearer faux' } })).status, 401);
    assert.equal((await http(server.url, '/api/quizzes', { headers: { authorization: `Bearer ${key}` } })).status, 200);
    assert.equal((await http(server.url, '/api/quizzes', { headers: { 'x-api-key': key } })).status, 200);
    assert.equal((await http(server.url, '/api/health')).status, 200);
  });

  it('utilise HAKOOT_PUBLIC_URL dans les liens', async () => {
    const r = await http(server.url, '/api/quizzes', { method: 'POST', body: sampleQuiz(), headers: { 'x-api-key': key } });
    assert.equal(r.data.links.launch, `https://quiz.example.com/launch/${r.data.quiz.id}`);
  });

  it('conserve les quiz après redémarrage', async () => {
    const r = await http(server.url, '/api/quizzes', { method: 'POST', body: sampleQuiz({ title: 'Persistant' }), headers: { 'x-api-key': key } });
    await server.stop();
    server = await startServer({ dataDir: server.dataDir, env: { HAKOOT_API_KEY: key } });
    const got = await http(server.url, `/api/quizzes/${r.data.quiz.id}`, { headers: { 'x-api-key': key } });
    assert.equal(got.data.quiz.title, 'Persistant');
  });
});

describe('API REST : limitation de débit', () => {
  let server;
  before(async () => {
    server = await startServer();
  });
  after(() => server.stop());

  it('renvoie 429 au-delà de 300 requêtes par minute', async () => {
    const statuses = [];
    for (let i = 0; i < 310; i++) statuses.push((await fetch(`${server.url}/api/health`)).status);
    assert.equal(statuses.slice(0, 300).every(s => s === 200), true);
    assert.equal(statuses.at(-1), 429);
  });
});
