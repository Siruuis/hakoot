import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { call, createClients, sampleQuiz, startServer, waitEvent, waitState } from '../helpers.js';

describe('Socket.IO : partie complète', () => {
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

  it('joue une partie de bout en bout avec reconnexions', async () => {
    const host = await clients.connect();
    assert.ok((await call(host, 'host:create', { quiz: { title: '', questions: [] } })).error);

    const created = await call(host, 'host:create', { quiz: sampleQuiz() });
    assert.match(created.pin, /^\d{6}$/);
    assert.match(created.token, /^[0-9a-f]{36}$/);
    await waitState(host, v => v.phase === 'lobby' && v.total === 2);
    assert.ok((await call(host, 'host:start')).error);

    const [a, b, c] = await Promise.all([clients.connect(), clients.connect(), clients.connect()]);
    assert.ok((await call(a, 'game:check', { pin: '000000' })).error);
    assert.deepEqual(await call(a, 'game:check', { pin: ` ${created.pin.slice(0, 3)} ${created.pin.slice(3)} ` }), { ok: true, pin: created.pin });

    const ja = await call(a, 'player:join', { pin: created.pin, name: '  Alice ' });
    assert.equal(ja.name, 'Alice');
    assert.match((await call(b, 'player:join', { pin: created.pin, name: 'ALICE' })).error, /déjà pris/);
    const jb = await call(b, 'player:join', { pin: created.pin, name: 'Bob' });
    await call(c, 'player:join', { pin: created.pin, name: 'Charlie' });
    await waitState(host, v => v.playerCount === 3);

    assert.ok((await call(a, 'host:next')).error);
    assert.ok((await call(a, 'host:kick', { playerId: 'x' })).error);

    const charlie = host.last.players.find(p => p.name === 'Charlie');
    const kicked = waitEvent(c, 'kicked');
    await call(host, 'host:kick', { playerId: charlie.id });
    await kicked;
    await waitState(host, v => v.playerCount === 2);
    assert.ok((await call(c, 'player:answer', { choice: 0 })).error);

    await call(host, 'host:lock', { locked: true });
    const d = await clients.connect();
    assert.match((await call(d, 'game:check', { pin: created.pin })).error, /verrouillée/);
    assert.match((await call(d, 'player:join', { pin: created.pin, name: 'Dan' })).error, /verrouillée/);
    await call(host, 'host:lock', { locked: false });

    assert.deepEqual(await call(host, 'host:start'), { ok: true });
    const intro = await waitState(a, v => v.phase === 'intro');
    assert.equal(intro.correct, undefined);
    assert.equal(intro.question.answers.length, 4);

    await waitState(a, v => v.phase === 'question');
    assert.ok((await call(a, 'player:answer', { choice: 9 })).error);
    assert.deepEqual(await call(a, 'player:answer', { choice: 1 }), { ok: true });
    assert.ok((await call(a, 'player:answer', { choice: 0 })).error);
    await waitState(host, v => v.answered === 1);

    const b2 = await clients.connect();
    const replaced = waitEvent(b, 'game:ended');
    assert.deepEqual(await call(b2, 'player:rejoin', { pin: created.pin, token: jb.token }), { ok: true, name: 'Bob' });
    await replaced;
    await waitState(b2, v => v.phase === 'question' && v.name === 'Bob');

    await call(b2, 'player:answer', { choice: 0 });
    const ra = await waitState(a, v => v.phase === 'reveal');
    assert.deepEqual(ra.correct, [1]);
    assert.equal(ra.result.correct, true);
    assert.ok(ra.result.points > 900 && ra.result.points <= 1000);
    const rb = await waitState(b2, v => v.phase === 'reveal');
    assert.equal(rb.result.correct, false);
    assert.equal(rb.rank, 2);
    assert.equal(rb.behind.name, 'Alice');
    const hr = await waitState(host, v => v.phase === 'reveal');
    assert.deepEqual(hr.distribution, [1, 1, 0, 0]);

    await call(host, 'host:next');
    const sb = await waitState(host, v => v.phase === 'scoreboard');
    assert.equal(sb.leaderboard[0].name, 'Alice');

    const host2 = await clients.connect();
    assert.deepEqual(await call(host2, 'host:rejoin', { pin: created.pin, token: created.token }), { ok: true });
    await waitState(host2, v => v.phase === 'scoreboard');
    assert.ok((await call(host, 'host:next')).error);

    await call(host2, 'host:next');
    await waitState(a, v => v.phase === 'question', 8000);
    await call(a, 'player:answer', { choice: 0 });
    const r2 = await waitState(a, v => v.phase === 'reveal', 8000);
    assert.ok(r2.result.points >= 1000);
    assert.equal(r2.result.streak, 2);
    assert.equal((await waitState(b2, v => v.phase === 'reveal')).result.answered, false);

    await call(host2, 'host:next');
    const end = await waitState(host2, v => v.phase === 'end');
    assert.equal(end.results[0].name, 'Alice');
    assert.equal(end.results[0].score, ra.result.points + r2.result.points);
    assert.equal((await waitState(a, v => v.phase === 'end')).rank, 1);
    assert.match((await call(d, 'player:join', { pin: created.pin, name: 'Trop tard' })).error, /terminée/);

    const ended = waitEvent(a, 'game:ended');
    await call(host2, 'host:end');
    assert.match((await ended).reason, /terminé/);
    assert.ok((await call(a, 'game:check', { pin: created.pin })).error);
    assert.ok((await call(a, 'player:rejoin', { pin: created.pin, token: ja.token })).error);
  });

  it('refuse les jetons invalides', async () => {
    const host = await clients.connect();
    const { pin } = await call(host, 'host:create', { quiz: sampleQuiz() });
    const x = await clients.connect();
    for (const token of ['', 'abc', null, 42, { a: 1 }]) {
      assert.ok((await call(x, 'host:rejoin', { pin, token })).error);
      assert.ok((await call(x, 'player:rejoin', { pin, token })).error);
    }
    assert.ok((await call(x, 'host:start')).error);
    assert.ok((await call(x, 'player:answer', { choice: 0 })).error);
  });

  it('résiste aux charges utiles malformées sans planter', async () => {
    const x = await clients.connect();
    const garbage = [null, undefined, 0, 'str', [], [1, 2], { pin: { $ne: 1 } }, { quiz: 'x'.repeat(10000) }, { name: '<script>' }];
    const events = ['game:check', 'host:create', 'host:rejoin', 'host:start', 'host:next', 'host:kick', 'host:lock', 'host:end', 'player:join', 'player:rejoin', 'player:answer', 'player:leave'];
    for (const ev of events) {
      for (const g of garbage) {
        const res = await call(x, ev, g);
        assert.equal(typeof res, 'object', `${ev} ${JSON.stringify(g)}`);
      }
      x.emit(ev, { pin: '1' });
      x.emit(ev);
    }
    const health = await fetch(`${server.url}/api/health`).then(r => r.json());
    assert.equal(health.ok, true);
    assert.doesNotMatch(server.output(), /TypeError|ReferenceError/);
  });

  it('gère départ volontaire, arrivée en cours et nom avec HTML', async () => {
    const host = await clients.connect();
    const { pin } = await call(host, 'host:create', { quiz: sampleQuiz() });
    const a = await clients.connect();
    const ja = await call(a, 'player:join', { pin, name: '<b>Ali</b>' });
    assert.equal(ja.name, '<b>Ali</b>');
    await call(host, 'host:start');
    await waitState(host, v => v.phase === 'intro');
    const late = await clients.connect();
    const jl = await call(late, 'player:join', { pin, name: 'Late' });
    assert.ok(jl.token);
    await waitState(late, v => v.phase === 'intro' || v.phase === 'question');
    assert.deepEqual(await call(late, 'player:leave'), { ok: true });
    await waitState(host, v => v.playerCount === 1);
  });

  it('libère le PIN quand l\'hôte crée une nouvelle partie dans le même onglet', async () => {
    const host = await clients.connect();
    const first = await call(host, 'host:create', { quiz: sampleQuiz() });
    const second = await call(host, 'host:create', { quiz: sampleQuiz() });
    assert.notEqual(first.pin, second.pin);
    const p = await clients.connect();
    assert.ok((await call(p, 'game:check', { pin: first.pin })).ok);
  });
});
