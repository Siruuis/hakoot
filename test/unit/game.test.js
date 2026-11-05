import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { Game, INTRO_MS, cleanName } from '../../server/game.js';
import { validateQuiz } from '../../shared/quiz.js';

function harness(questions) {
  const sockets = new Map();
  const emitted = [];
  const io = {
    sockets: { sockets },
    to: target => ({ emit: (ev, data) => emitted.push({ target, ev, data }) }),
    in: () => ({ socketsLeave: () => {} }),
  };
  let n = 0;
  const socket = () => {
    const s = {
      id: `s${++n}`,
      data: {},
      rooms: new Set(),
      join(r) {
        this.rooms.add(r);
      },
      leave(r) {
        this.rooms.delete(r);
      },
      emit(ev, data) {
        emitted.push({ target: this.id, ev, data });
      },
    };
    sockets.set(s.id, s);
    return s;
  };
  const { quiz, errors } = validateQuiz({ title: 'T', questions });
  assert.deepEqual(errors, []);
  let destroyed = null;
  const game = new Game({ io, pin: '123456', quiz, onDestroy: pin => (destroyed = pin) });
  const host = socket();
  game.attachHost(host);
  const last = (s, ev) => {
    for (let i = emitted.length - 1; i >= 0; i--) if (emitted[i].target === s.id && emitted[i].ev === ev) return emitted[i].data;
    return undefined;
  };
  const join = name => {
    const s = socket();
    const res = game.join(s, name);
    return { s, ...res };
  };
  return { game, host, socket, join, last, emitted, sockets, destroyed: () => destroyed };
}

const Q = (extra = {}) => ({ type: 'quiz', text: 'Q', answers: ['A', 'B', 'C', 'D'], correct: [1], timeLimit: 20, points: 1000, ...extra });

describe('Game', () => {
  let t;
  beforeEach(ctx => {
    t = ctx;
    ctx.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 1_000_000 });
  });

  const toQuestion = game => {
    game.start();
    t.mock.timers.tick(INTRO_MS);
    assert.equal(game.phase, 'question');
  };

  it('suit les phases lobby → intro → question → reveal → scoreboard → … → end', () => {
    const h = harness([Q(), Q()]);
    h.join('Alice');
    assert.equal(h.game.phase, 'lobby');
    assert.deepEqual(h.game.start(), { ok: true });
    assert.equal(h.game.phase, 'intro');
    t.mock.timers.tick(INTRO_MS - 1);
    assert.equal(h.game.phase, 'intro');
    t.mock.timers.tick(1);
    assert.equal(h.game.phase, 'question');
    h.game.next();
    assert.equal(h.game.phase, 'reveal');
    h.game.next();
    assert.equal(h.game.phase, 'scoreboard');
    h.game.next();
    assert.equal(h.game.phase, 'intro');
    assert.equal(h.game.index, 1);
    t.mock.timers.tick(INTRO_MS);
    h.game.next();
    h.game.next();
    assert.equal(h.game.phase, 'end');
    assert.ok(h.game.next().error);
  });

  it('refuse de démarrer sans joueur ou deux fois', () => {
    const h = harness([Q()]);
    assert.ok(h.game.start().error);
    h.join('A');
    h.game.start();
    assert.ok(h.game.start().error);
  });

  it('donne 1000 points pour une réponse instantanée, 750 à mi-temps, 500 à la fin', () => {
    const h = harness([Q()]);
    const a = h.join('A');
    const b = h.join('B');
    const c = h.join('C');
    toQuestion(h.game);
    h.game.answer(a.token, 1);
    t.mock.timers.tick(10_000);
    h.game.answer(b.token, 1);
    t.mock.timers.tick(10_000);
    h.game.answer(c.token, 1);
    assert.equal(h.game.phase, 'reveal');
    const score = token => h.game.players.get(token).score;
    assert.equal(score(a.token), 1000);
    assert.equal(score(b.token), 750);
    assert.equal(score(c.token), 500);
  });

  it('plafonne le temps écoulé à la limite (réponse tardive pendant la marge réseau)', () => {
    const h = harness([Q({ timeLimit: 5 })]);
    const a = h.join('A');
    h.join('B');
    toQuestion(h.game);
    t.mock.timers.tick(5_200);
    assert.equal(h.game.phase, 'question');
    h.game.answer(a.token, 1);
    t.mock.timers.tick(200);
    assert.equal(h.game.phase, 'reveal');
    assert.equal(h.game.players.get(a.token).score, 500);
  });

  it('révèle automatiquement à la fin du chrono + marge', () => {
    const h = harness([Q({ timeLimit: 10 })]);
    h.join('A');
    toQuestion(h.game);
    t.mock.timers.tick(10_399);
    assert.equal(h.game.phase, 'question');
    t.mock.timers.tick(1);
    assert.equal(h.game.phase, 'reveal');
  });

  it('applique points doubles, questions sans points et bonne réponse multiple', () => {
    const h = harness([Q({ points: 2000 }), Q({ points: 0 }), Q({ correct: [0, 2] })]);
    const a = h.join('A');
    toQuestion(h.game);
    h.game.answer(a.token, 1);
    assert.equal(h.game.players.get(a.token).score, 2000);
    h.game.next();
    h.game.next();
    t.mock.timers.tick(INTRO_MS);
    h.game.answer(a.token, 1);
    assert.equal(h.game.players.get(a.token).score, 2000);
    assert.equal(h.game.players.get(a.token).result.correct, true);
    h.game.next();
    h.game.next();
    t.mock.timers.tick(INTRO_MS);
    h.game.answer(a.token, 2);
    const p = h.game.players.get(a.token);
    assert.equal(p.result.correct, true);
    assert.equal(p.result.points, 1000 + 200);
  });

  it('calcule le bonus de série, plafonné à +500, remis à zéro sur erreur', () => {
    const h = harness(Array.from({ length: 9 }, () => Q()));
    const a = h.join('A');
    const points = [];
    h.game.start();
    for (let i = 0; i < 9; i++) {
      t.mock.timers.tick(INTRO_MS);
      h.game.answer(a.token, i === 7 ? 0 : 1);
      points.push(h.game.players.get(a.token).result.points);
      h.game.next();
      if (h.game.phase === 'scoreboard') h.game.next();
    }
    assert.deepEqual(points, [1000, 1100, 1200, 1300, 1400, 1500, 1500, 0, 1000]);
    assert.equal(h.game.phase, 'end');
  });

  it('révèle dès que tous les joueurs connectés ont répondu', () => {
    const h = harness([Q()]);
    const a = h.join('A');
    const b = h.join('B');
    const c = h.join('C');
    toQuestion(h.game);
    h.game.detachPlayer(c.s.id, c.token);
    h.game.answer(a.token, 0);
    assert.equal(h.game.phase, 'question');
    h.game.answer(b.token, 0);
    assert.equal(h.game.phase, 'reveal');
    assert.deepEqual(h.game.distribution, [2, 0, 0, 0]);
    assert.equal(h.game.players.get(c.token).result.answered, false);
  });

  it('révèle quand le dernier joueur sans réponse se déconnecte', () => {
    const h = harness([Q()]);
    const a = h.join('A');
    const b = h.join('B');
    toQuestion(h.game);
    h.game.answer(a.token, 1);
    h.game.detachPlayer(b.s.id, b.token);
    assert.equal(h.game.phase, 'reveal');
  });

  it('valide les réponses', () => {
    const h = harness([Q()]);
    const a = h.join('A');
    h.join('B');
    assert.ok(h.game.answer(a.token, 0).error);
    toQuestion(h.game);
    for (const bad of [-1, 4, 1.5, '1', null, undefined, NaN, {}]) assert.ok(h.game.answer(a.token, bad).error, String(bad));
    assert.ok(h.game.answer('inconnu', 0).error);
    assert.deepEqual(h.game.answer(a.token, 0), { ok: true });
    assert.ok(h.game.answer(a.token, 1).error);
  });

  it('ne divulgue jamais la bonne réponse avant la révélation', () => {
    const h = harness([Q()]);
    const a = h.join('A');
    h.join('B');
    h.game.start();
    assert.equal(h.last(a.s, 'player:state').correct, undefined);
    assert.equal(h.last(h.host, 'host:state').correct, undefined);
    t.mock.timers.tick(INTRO_MS);
    h.game.answer(a.token, 0);
    const pv = h.last(a.s, 'player:state');
    assert.equal(pv.correct, undefined);
    assert.equal(pv.result, null);
    assert.equal(JSON.stringify(pv).includes('"correct"'), false);
    assert.equal(h.last(h.host, 'host:state').correct, undefined);
    h.game.next();
    assert.deepEqual(h.last(a.s, 'player:state').correct, [1]);
  });

  it('classe les joueurs avec égalités et écart avec le joueur devant', () => {
    const h = harness([Q()]);
    const a = h.join('A');
    const b = h.join('B');
    const c = h.join('C');
    const d = h.join('D');
    toQuestion(h.game);
    h.game.answer(a.token, 1);
    h.game.answer(b.token, 1);
    t.mock.timers.tick(10_000);
    h.game.answer(c.token, 1);
    h.game.answer(d.token, 0);
    const st = h.game.standings();
    assert.deepEqual(st.list.map(p => p.name), ['A', 'B', 'C', 'D']);
    assert.equal(st.map.get(a.token).rank, 1);
    assert.equal(st.map.get(b.token).rank, 1);
    assert.equal(st.map.get(b.token).behind, null);
    assert.equal(st.map.get(c.token).rank, 3);
    assert.deepEqual(st.map.get(c.token).behind, { name: 'B', gap: 250 });
    assert.deepEqual(st.map.get(d.token).behind, { name: 'C', gap: 750 });
  });

  it('nettoie et valide les pseudos', () => {
    const h = harness([Q()]);
    assert.equal(h.join('  Bob   le   bricoleur  ').name, 'Bob le bricoleu');
    assert.ok(h.join('').error);
    assert.ok(h.join('   ').error);
    assert.ok(h.join('​​').error);
    assert.ok(h.join(42).error);
    assert.match(h.join('BOB LE BRICOLEU').error, /déjà pris/);
    assert.equal(cleanName('a\u0007b‮c'), 'abc');
    assert.equal(cleanName('🎉🎉🎉🎉🎉🎉🎉🎉🎉🎉🎉🎉🎉🎉🎉🎉🎉'), '🎉'.repeat(15));
  });

  it('respecte le verrouillage, la fin de partie et la limite de joueurs', () => {
    const h = harness([Q()]);
    h.game.locked = true;
    assert.match(h.join('A').error, /verrouillée/);
    h.game.locked = false;
    for (let i = 0; i < 250; i++) assert.ok(h.join(`P${i}`).token);
    assert.match(h.join('Trop').error, /pleine/);
    h.game.phase = 'end';
    assert.match(h.join('Late').error, /terminée/);
  });

  it('autorise un joueur à rejoindre en cours de partie', () => {
    const h = harness([Q(), Q()]);
    h.join('A');
    toQuestion(h.game);
    const late = h.join('Late');
    assert.ok(late.token);
    assert.equal(h.last(late.s, 'player:state').phase, 'question');
    h.game.answer(late.token, 1);
    assert.equal(h.game.phase, 'question');
  });

  it('retire un joueur déconnecté du lobby après 30 s, sauf s\'il revient', () => {
    const h = harness([Q()]);
    const a = h.join('A');
    const b = h.join('B');
    h.game.detachPlayer(a.s.id, a.token);
    h.game.detachPlayer(b.s.id, b.token);
    t.mock.timers.tick(10_000);
    const again = h.socket();
    assert.deepEqual(h.game.rejoinPlayer(again, b.token), { ok: true, name: 'B' });
    t.mock.timers.tick(20_000);
    assert.equal(h.game.players.has(a.token), false);
    assert.equal(h.game.players.has(b.token), true);
    assert.equal(h.game.players.get(b.token).connected, true);
  });

  it('garde un joueur déconnecté pendant la partie', () => {
    const h = harness([Q()]);
    const a = h.join('A');
    h.join('B');
    toQuestion(h.game);
    h.game.detachPlayer(a.s.id, a.token);
    t.mock.timers.tick(60_000);
    assert.equal(h.game.players.has(a.token), true);
  });

  it('ignore une déconnexion venant d\'un ancien socket', () => {
    const h = harness([Q()]);
    const a = h.join('A');
    const second = h.socket();
    h.game.rejoinPlayer(second, a.token);
    assert.equal(h.last(a.s, 'game:ended').reason.includes('autre onglet'), true);
    h.game.detachPlayer(a.s.id, a.token);
    assert.equal(h.game.players.get(a.token).connected, true);
  });

  it('exclut un joueur', () => {
    const h = harness([Q()]);
    const a = h.join('A');
    h.join('B');
    h.game.kick(h.game.players.get(a.token).id);
    assert.equal(h.game.players.has(a.token), false);
    assert.ok(h.emitted.some(e => e.target === a.s.id && e.ev === 'kicked'));
    assert.deepEqual(a.s.data, {});
    h.game.kick('inexistant');
    assert.equal(h.game.players.size, 1);
  });

  it('détruit la partie 10 min après le départ de l\'hôte, sauf retour', () => {
    const h = harness([Q()]);
    h.join('A');
    h.game.detachHost(h.host.id);
    t.mock.timers.tick(9 * 60_000);
    const host2 = h.socket();
    h.game.attachHost(host2);
    t.mock.timers.tick(5 * 60_000);
    assert.equal(h.game.destroyed, false);
    h.game.detachHost(host2.id);
    t.mock.timers.tick(10 * 60_000);
    assert.equal(h.game.destroyed, true);
    assert.equal(h.destroyed(), '123456');
  });

  it('remplace l\'onglet hôte précédent', () => {
    const h = harness([Q()]);
    const host2 = h.socket();
    h.game.attachHost(host2);
    assert.ok(h.last(h.host, 'game:ended'));
    assert.deepEqual(h.host.data, {});
    h.game.detachHost(h.host.id);
    assert.equal(h.game.hostSocketId, host2.id);
  });

  it('fournit un résumé et des résultats finaux complets', () => {
    const h = harness([Q(), Q()]);
    const a = h.join('A');
    h.join('B');
    toQuestion(h.game);
    h.game.answer(a.token, 1);
    const s = h.game.summary();
    assert.equal(s.pin, '123456');
    assert.equal(s.phase, 'question');
    assert.equal(s.question, 1);
    assert.equal(s.players, 2);
    h.game.next();
    h.game.next();
    h.game.next();
    t.mock.timers.tick(INTRO_MS);
    h.game.next();
    h.game.next();
    const end = h.last(h.host, 'host:state');
    assert.equal(end.phase, 'end');
    assert.equal(end.results[0].name, 'A');
    assert.equal(end.results[0].correctCount, 1);
    assert.equal(end.results[0].history.length, 2);
    assert.equal(end.results[0].history[1].choice, null);
  });

  it('nettoie tous les minuteurs à la destruction', () => {
    const h = harness([Q()]);
    const a = h.join('A');
    h.game.detachPlayer(a.s.id, a.token);
    h.game.destroy('fin');
    assert.equal(h.game.destroyed, true);
    t.mock.timers.tick(60 * 60_000);
    assert.equal(h.game.players.has(a.token), true);
    h.game.destroy('encore');
    assert.equal(h.emitted.filter(e => e.ev === 'game:ended' && e.target === 'game:123456').length, 1);
  });
});
