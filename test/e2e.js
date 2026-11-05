import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';
import { io } from 'socket.io-client';

const PORT = 3999;
const URL = `http://localhost:${PORT}`;
const server = spawn(process.execPath, ['server/index.js'], { env: { ...process.env, PORT: String(PORT) }, stdio: 'pipe' });
await new Promise((resolve, reject) => {
  server.stdout.on('data', d => d.toString().includes('Hakoot') && resolve());
  server.on('exit', code => reject(new Error(`server exited ${code}`)));
});

const sockets = [];
const connect = () =>
  new Promise(resolve => {
    const s = io(URL, { transports: ['websocket'], forceNew: true });
    s.last = null;
    s.on('host:state', v => (s.last = v));
    s.on('player:state', v => (s.last = v));
    sockets.push(s);
    s.on('connect', () => resolve(s));
  });
const call = (s, ev, p = {}) => s.timeout(3000).emitWithAck(ev, p);
const wait = (s, pred, ms = 8000) =>
  new Promise((resolve, reject) => {
    if (s.last && pred(s.last)) return resolve(s.last);
    const t = setTimeout(() => reject(new Error(`timeout waiting, last=${JSON.stringify(s.last && s.last.phase)}`)), ms);
    const h = v => {
      if (pred(v)) {
        clearTimeout(t);
        s.off('host:state', h);
        s.off('player:state', h);
        resolve(v);
      }
    };
    s.on('host:state', h);
    s.on('player:state', h);
  });

const quiz = {
  title: 'Test',
  questions: [
    { type: 'quiz', text: 'Q1', answers: ['a', '', 'b', 'c'], correct: [2], timeLimit: 5, points: 1000 },
    { type: 'truefalse', text: 'Q2', correct: [1], timeLimit: 5, points: 2000 },
  ],
};

let passed = 0;
const ok = msg => {
  passed++;
  console.log('  ✓', msg);
};

try {
  const host = await connect();
  assert.ok((await call(host, 'host:create', { quiz: { title: '', questions: [] } })).error);
  ok('quiz invalide refusé');

  const created = await call(host, 'host:create', { quiz });
  assert.match(created.pin, /^\d{6}$/);
  const hs = await wait(host, v => v.phase === 'lobby');
  assert.equal(hs.total, 2);
  ok(`partie créée PIN ${created.pin}`);

  assert.ok((await call(host, 'host:start')).error);
  ok('impossible de démarrer sans joueur');

  const [a, b, c] = await Promise.all([connect(), connect(), connect()]);
  assert.ok((await call(a, 'game:check', { pin: '000000' })).error);
  assert.ok((await call(a, 'game:check', { pin: created.pin })).ok);
  const ja = await call(a, 'player:join', { pin: created.pin, name: '  Alice  ' });
  assert.equal(ja.name, 'Alice');
  assert.ok((await call(b, 'player:join', { pin: created.pin, name: 'alice' })).error);
  ok('pseudo dupliqué refusé (insensible à la casse)');
  const jb = await call(b, 'player:join', { pin: created.pin, name: 'Bob' });
  await call(c, 'player:join', { pin: created.pin, name: 'Charlie' });
  await wait(host, v => v.playerCount === 3);
  ok('3 joueurs dans le lobby');

  assert.ok((await call(a, 'host:next')).error);
  ok('un joueur ne peut pas piloter la partie');

  const charlieId = host.last.players.find(p => p.name === 'Charlie').id;
  const kicked = new Promise(r => c.once('kicked', r));
  await call(host, 'host:kick', { playerId: charlieId });
  await kicked;
  await wait(host, v => v.playerCount === 2);
  ok('kick fonctionne');

  await call(host, 'host:lock', { locked: true });
  const d = await connect();
  assert.ok((await call(d, 'player:join', { pin: created.pin, name: 'Dan' })).error);
  await call(host, 'host:lock', { locked: false });
  ok('verrouillage fonctionne');

  assert.ok((await call(host, 'host:start')).ok);
  const intro = await wait(a, v => v.phase === 'intro');
  assert.equal(intro.question.answers.length, 3);
  assert.equal(intro.correct, undefined);
  ok('intro reçue, réponses vides retirées, bonne réponse non divulguée');

  const q = await wait(a, v => v.phase === 'question');
  assert.equal(q.correct, undefined);
  assert.ok(q.remaining > 4000 && q.remaining <= 5000);
  assert.ok((await call(a, 'player:answer', { choice: 9 })).error);
  assert.ok((await call(a, 'player:answer', { choice: '1' })).error);
  assert.ok((await call(a, 'player:answer', { choice: 1 })).ok);
  assert.ok((await call(a, 'player:answer', { choice: 0 })).error);
  ok('validation des réponses + une seule réponse');

  const b2 = await connect();
  assert.ok((await call(b2, 'player:rejoin', { pin: created.pin, token: jb.token })).ok);
  await wait(b2, v => v.phase === 'question' && v.name === 'Bob');
  ok('reconnexion joueur (nouvel onglet) en pleine question');

  assert.ok((await call(b2, 'player:answer', { choice: 0 })).ok);
  const ra = await wait(a, v => v.phase === 'reveal', 2000);
  assert.deepEqual(ra.correct, [1]);
  assert.equal(ra.result.correct, true);
  assert.ok(ra.result.points > 500 && ra.result.points <= 1000);
  const rb = await wait(b2, v => v.phase === 'reveal');
  assert.equal(rb.result.correct, false);
  assert.equal(rb.result.points, 0);
  assert.equal(rb.rank, 2);
  assert.equal(rb.behind.name, 'Alice');
  const hr = await wait(host, v => v.phase === 'reveal');
  assert.deepEqual(hr.distribution, [1, 1, 0]);
  ok(`révélation anticipée quand tout le monde a répondu (Alice +${ra.result.points})`);

  await call(host, 'host:next');
  const sb = await wait(host, v => v.phase === 'scoreboard');
  assert.equal(sb.leaderboard[0].name, 'Alice');
  ok('classement');

  const host2 = await connect();
  assert.ok((await call(host2, 'host:rejoin', { pin: created.pin, token: created.token })).ok);
  await wait(host2, v => v.phase === 'scoreboard');
  ok('reconnexion hôte');
  assert.ok((await call(host, 'host:next')).error);
  ok("l'ancien onglet hôte est désactivé");

  await call(host2, 'host:next');
  await wait(a, v => v.phase === 'question', 6000);
  await call(a, 'player:answer', { choice: 1 });
  const t0 = Date.now();
  const r2 = await wait(a, v => v.phase === 'reveal', 7000);
  assert.ok(Date.now() - t0 > 3000);
  assert.ok(r2.result.points > 1000 && r2.result.points <= 2100);
  assert.equal(r2.result.streak, 2);
  const rb2 = await wait(b2, v => v.phase === 'reveal');
  assert.equal(rb2.result.answered, false);
  ok(`fin du chrono sans réponse de Bob, points doubles + série pour Alice (+${r2.result.points})`);

  await call(host2, 'host:next');
  const end = await wait(host2, v => v.phase === 'end');
  assert.equal(end.results[0].name, 'Alice');
  assert.equal(end.results[0].correctCount, 2);
  assert.equal(end.results[0].score, ra.result.points + r2.result.points);
  const endA = await wait(a, v => v.phase === 'end');
  assert.equal(endA.rank, 1);
  ok('podium final, scores cohérents');

  const endedP = new Promise(r => a.once('game:ended', r));
  await call(host2, 'host:end');
  await endedP;
  assert.ok((await call(a, 'game:check', { pin: created.pin })).error);
  ok('fin de partie, PIN libéré');

  console.log(`\n${passed} vérifications OK`);
} catch (err) {
  console.error('\n✗ ÉCHEC :', err);
  process.exitCode = 1;
} finally {
  sockets.forEach(s => s.close());
  server.kill();
}
