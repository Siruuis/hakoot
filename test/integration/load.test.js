import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { call, createClients, startServer, waitState } from '../helpers.js';

const PLAYERS = 150;

describe(`Charge : ${PLAYERS} joueurs simultanés`, () => {
  let server;
  let clients;
  before(async () => {
    server = await startServer();
    clients = createClients(server.url);
  });
  after(async () => {
    clients.closeAll();
    await server.stop();
  });

  it('tous rejoignent, répondent et reçoivent leurs résultats', { timeout: 60000 }, async () => {
    const host = await clients.connect();
    const quiz = {
      title: 'Charge',
      questions: [{ text: 'Q', answers: ['A', 'B', 'C', 'D'], correct: [2], timeLimit: 20 }],
    };
    const { pin } = await call(host, 'host:create', { quiz });
    const players = await Promise.all(Array.from({ length: PLAYERS }, () => clients.connect()));
    const joins = await Promise.all(players.map((p, i) => call(p, 'player:join', { pin, name: `Joueur ${i}` })));
    assert.equal(joins.filter(j => j.token).length, PLAYERS);
    await waitState(host, v => v.playerCount === PLAYERS);

    const started = Date.now();
    await call(host, 'host:start');
    await Promise.all(players.map(p => waitState(p, v => v.phase === 'question', 15000)));
    const answers = await Promise.all(players.map((p, i) => call(p, 'player:answer', { choice: i % 4 })));
    assert.equal(answers.filter(a => a.ok).length, PLAYERS);

    const reveal = await waitState(host, v => v.phase === 'reveal', 15000);
    assert.equal(reveal.distribution.reduce((s, n) => s + n, 0), PLAYERS);
    assert.deepEqual(reveal.distribution, [38, 38, 37, 37]);
    const results = await Promise.all(players.map(p => waitState(p, v => v.phase === 'reveal')));
    results.forEach((r, i) => assert.equal(r.result.correct, i % 4 === 2));
    assert.ok(Date.now() - started < 20000);

    await call(host, 'host:next');
    const end = await waitState(host, v => v.phase === 'end');
    assert.equal(end.results.length, PLAYERS);
    for (let i = 1; i < end.results.length; i++) assert.ok(end.results[i - 1].score >= end.results[i].score);
    assert.equal(end.results.filter(r => r.rank === 1).length >= 1, true);
  });
});
