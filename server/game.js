import crypto from 'node:crypto';

export const INTRO_MS = 4000;
const LOBBY_GRACE_MS = 30000;
const HOST_GRACE_MS = 10 * 60 * 1000;
const LATENCY_GRACE_MS = 400;
const MAX_PLAYERS = 250;
const NAME_MAX = 15;

const secret = () => crypto.randomBytes(18).toString('hex');
const shortId = () => crypto.randomBytes(5).toString('hex');

export function cleanName(value) {
  if (typeof value !== 'string') return '';
  const stripped = value
    .replace(/[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
  return Array.from(stripped).slice(0, NAME_MAX).join('').trim();
}

export class Game {
  constructor({ io, pin, quiz, onDestroy }) {
    this.io = io;
    this.pin = pin;
    this.quiz = quiz;
    this.onDestroy = onDestroy;
    this.hostToken = secret();
    this.hostSocketId = null;
    this.hostTimer = null;
    this.players = new Map();
    this.phase = 'lobby';
    this.index = -1;
    this.locked = false;
    this.timer = null;
    this.phaseEndsAt = 0;
    this.startedAt = 0;
    this.answers = new Map();
    this.distribution = [];
    this.touchedAt = Date.now();
    this.destroyed = false;
  }

  get question() {
    return this.quiz.questions[this.index] || null;
  }

  get isLast() {
    return this.index >= this.quiz.questions.length - 1;
  }

  get room() {
    return `game:${this.pin}`;
  }

  touch() {
    this.touchedAt = Date.now();
  }

  clearTimer() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  socket(id) {
    return id ? this.io.sockets.sockets.get(id) : null;
  }

  attachHost(socket) {
    if (this.hostSocketId && this.hostSocketId !== socket.id) {
      const old = this.socket(this.hostSocketId);
      if (old) {
        old.data = {};
        old.emit('game:ended', { reason: 'La partie a été ouverte dans un autre onglet' });
      }
    }
    if (this.hostTimer) clearTimeout(this.hostTimer);
    this.hostTimer = null;
    this.hostSocketId = socket.id;
    socket.data = { pin: this.pin, role: 'host' };
    this.touch();
    this.emitHost();
  }

  detachHost(socketId) {
    if (this.hostSocketId !== socketId) return;
    this.hostSocketId = null;
    if (this.hostTimer) clearTimeout(this.hostTimer);
    this.hostTimer = setTimeout(() => this.destroy("L'hôte a quitté la partie"), HOST_GRACE_MS);
  }

  nameTaken(name) {
    const lower = name.toLocaleLowerCase();
    for (const p of this.players.values()) if (p.name.toLocaleLowerCase() === lower) return true;
    return false;
  }

  join(socket, rawName) {
    if (this.phase === 'end') return { error: 'Cette partie est terminée' };
    if (this.locked) return { error: "La partie est verrouillée par l'hôte" };
    if (this.players.size >= MAX_PLAYERS) return { error: 'La partie est pleine' };
    const name = cleanName(rawName);
    if (!name) return { error: 'Choisis un pseudo' };
    if (this.nameTaken(name)) return { error: 'Ce pseudo est déjà pris' };
    const player = {
      token: secret(),
      id: shortId(),
      name,
      score: 0,
      streak: 0,
      socketId: null,
      connected: false,
      joinedAt: Date.now(),
      result: null,
      history: [],
      removeTimer: null,
    };
    this.players.set(player.token, player);
    this.attachPlayer(socket, player);
    return { token: player.token, name };
  }

  attachPlayer(socket, player) {
    if (player.socketId && player.socketId !== socket.id) {
      const old = this.socket(player.socketId);
      if (old) {
        old.leave(this.room);
        old.data = {};
        old.emit('game:ended', { reason: 'Tu as rejoint la partie depuis un autre onglet' });
      }
    }
    if (player.removeTimer) clearTimeout(player.removeTimer);
    player.removeTimer = null;
    player.socketId = socket.id;
    player.connected = true;
    socket.data = { pin: this.pin, role: 'player', token: player.token };
    socket.join(this.room);
    this.touch();
    this.emitPlayer(player);
    this.emitHost();
  }

  rejoinPlayer(socket, token) {
    const player = typeof token === 'string' ? this.players.get(token) : null;
    if (!player) return { error: 'Tu ne fais plus partie de cette partie' };
    this.attachPlayer(socket, player);
    return { ok: true, name: player.name };
  }

  detachPlayer(socketId, token) {
    const player = this.players.get(token);
    if (!player || player.socketId !== socketId) return;
    player.socketId = null;
    player.connected = false;
    if (this.phase === 'lobby') {
      player.removeTimer = setTimeout(() => {
        if (!player.connected && this.phase === 'lobby') this.removePlayer(player);
      }, LOBBY_GRACE_MS);
    }
    if (this.phase === 'question' && this.allAnswered()) return this.reveal();
    this.emitHost();
  }

  removePlayer(player) {
    if (player.removeTimer) clearTimeout(player.removeTimer);
    this.players.delete(player.token);
    this.answers.delete(player.token);
    if (this.phase === 'question' && this.allAnswered()) return this.reveal();
    this.emitHost();
  }

  kick(playerId) {
    const player = [...this.players.values()].find(p => p.id === playerId);
    if (!player) return;
    const s = this.socket(player.socketId);
    if (s) {
      s.leave(this.room);
      s.data = {};
      s.emit('kicked');
    }
    this.removePlayer(player);
  }

  leave(socketId, token) {
    const player = this.players.get(token);
    if (player && player.socketId === socketId) this.removePlayer(player);
  }

  start() {
    if (this.phase !== 'lobby') return { error: 'La partie a déjà commencé' };
    if (this.players.size === 0) return { error: 'Il faut au moins un joueur' };
    this.intro(0);
    return { ok: true };
  }

  intro(index) {
    this.clearTimer();
    this.index = index;
    this.phase = 'intro';
    this.answers.clear();
    this.distribution = [];
    for (const p of this.players.values()) p.result = null;
    this.phaseEndsAt = Date.now() + INTRO_MS;
    this.timer = setTimeout(() => this.ask(), INTRO_MS);
    this.broadcast();
  }

  ask() {
    if (this.phase !== 'intro') return;
    this.clearTimer();
    this.phase = 'question';
    const ms = this.question.timeLimit * 1000;
    this.startedAt = Date.now();
    this.phaseEndsAt = this.startedAt + ms;
    this.timer = setTimeout(() => this.reveal(), ms + LATENCY_GRACE_MS);
    this.broadcast();
  }

  allAnswered() {
    let active = 0;
    for (const p of this.players.values()) {
      if (!p.connected) continue;
      active++;
      if (!this.answers.has(p.token)) return false;
    }
    return active > 0;
  }

  answer(token, choice) {
    const player = this.players.get(token);
    if (!player || this.phase !== 'question') return { error: 'Trop tard !' };
    if (this.answers.has(token)) return { error: 'Tu as déjà répondu' };
    const q = this.question;
    if (!Number.isInteger(choice) || choice < 0 || choice >= q.answers.length) return { error: 'Réponse invalide' };
    const elapsed = Math.min(Date.now() - this.startedAt, q.timeLimit * 1000);
    this.answers.set(token, { choice, elapsed });
    this.touch();
    if (this.allAnswered()) {
      this.reveal();
    } else {
      this.emitPlayer(player);
      this.emitHost();
    }
    return { ok: true };
  }

  reveal() {
    if (this.phase !== 'question') return;
    this.clearTimer();
    this.phase = 'reveal';
    const q = this.question;
    const limit = q.timeLimit * 1000;
    this.distribution = q.answers.map(() => 0);
    for (const p of this.players.values()) {
      const a = this.answers.get(p.token);
      const correct = !!a && q.correct.includes(a.choice);
      if (a) this.distribution[a.choice]++;
      let points = 0;
      if (correct) {
        p.streak++;
        if (q.points > 0) {
          points = Math.round(q.points * (1 - a.elapsed / limit / 2)) + Math.min((p.streak - 1) * 100, 500);
        }
      } else {
        p.streak = 0;
      }
      p.score += points;
      p.result = { answered: !!a, choice: a ? a.choice : null, correct, points, streak: p.streak };
      p.history[this.index] = { choice: a ? a.choice : null, correct, points, time: a ? a.elapsed : null };
    }
    this.broadcast();
  }

  next() {
    switch (this.phase) {
      case 'lobby':
        return this.start();
      case 'intro':
        this.ask();
        return { ok: true };
      case 'question':
        this.reveal();
        return { ok: true };
      case 'reveal':
        if (this.isLast) {
          this.clearTimer();
          this.phase = 'end';
        } else {
          this.phase = 'scoreboard';
        }
        this.broadcast();
        return { ok: true };
      case 'scoreboard':
        this.intro(this.index + 1);
        return { ok: true };
      default:
        return { error: 'La partie est terminée' };
    }
  }

  standings() {
    const list = [...this.players.values()].sort((a, b) => b.score - a.score || a.joinedAt - b.joinedAt);
    const map = new Map();
    let rank = 0;
    let prevScore = null;
    let above = null;
    list.forEach((p, i) => {
      if (p.score !== prevScore) {
        rank = i + 1;
        above = i > 0 ? list[i - 1] : null;
        prevScore = p.score;
      }
      map.set(p.token, { rank, behind: above ? { name: above.name, gap: above.score - p.score } : null });
    });
    return { list, map };
  }

  timing() {
    if (this.phase === 'intro') {
      return { remaining: Math.max(0, this.phaseEndsAt - Date.now()), duration: INTRO_MS };
    }
    if (this.phase === 'question') {
      return { remaining: Math.max(0, this.phaseEndsAt - Date.now()), duration: this.question.timeLimit * 1000 };
    }
    return {};
  }

  publicQuestion() {
    const q = this.question;
    if (!q || this.phase === 'lobby' || this.phase === 'end') return null;
    return { text: q.text, image: q.image, type: q.type, answers: q.answers, timeLimit: q.timeLimit, points: q.points };
  }

  base() {
    let connected = 0;
    for (const p of this.players.values()) if (p.connected) connected++;
    return {
      pin: this.pin,
      phase: this.phase,
      title: this.quiz.title,
      index: this.index,
      total: this.quiz.questions.length,
      playerCount: this.players.size,
      connectedCount: connected,
      question: this.publicQuestion(),
      ...this.timing(),
    };
  }

  hostView(st) {
    const view = {
      ...this.base(),
      locked: this.locked,
      answered: this.answers.size,
      players: [...this.players.values()].map(p => ({ id: p.id, name: p.name, score: p.score, connected: p.connected })),
    };
    if (this.phase === 'reveal') {
      view.correct = this.question.correct;
      view.distribution = this.distribution;
    }
    if (this.phase === 'scoreboard') {
      view.leaderboard = st.list.slice(0, 5).map(p => ({
        id: p.id,
        name: p.name,
        score: p.score,
        points: p.result ? p.result.points : 0,
        rank: st.map.get(p.token).rank,
      }));
    }
    if (this.phase === 'end') {
      view.results = st.list.map(p => ({
        id: p.id,
        name: p.name,
        score: p.score,
        rank: st.map.get(p.token).rank,
        correctCount: p.history.filter(h => h && h.correct).length,
        history: this.quiz.questions.map((_, i) => p.history[i] || null),
      }));
    }
    return view;
  }

  playerView(p, st) {
    const standing = st.map.get(p.token);
    const a = this.answers.get(p.token);
    const view = {
      ...this.base(),
      name: p.name,
      score: p.score,
      rank: standing.rank,
      behind: standing.behind,
      answered: !!a,
      choice: a ? a.choice : null,
      result: this.phase === 'reveal' || this.phase === 'scoreboard' ? p.result : null,
    };
    if (this.phase === 'reveal') view.correct = this.question.correct;
    return view;
  }

  summary() {
    const st = this.standings();
    let connected = 0;
    for (const p of this.players.values()) if (p.connected) connected++;
    return {
      pin: this.pin,
      title: this.quiz.title,
      phase: this.phase,
      question: this.index >= 0 ? this.index + 1 : 0,
      totalQuestions: this.quiz.questions.length,
      players: this.players.size,
      connectedPlayers: connected,
      locked: this.locked,
      hostConnected: !!this.hostSocketId,
      top: st.list.slice(0, 3).map(p => ({ name: p.name, score: p.score })),
    };
  }

  broadcast() {
    if (this.destroyed) return;
    const st = this.standings();
    this.emitHost(st);
    for (const p of this.players.values()) this.emitPlayer(p, st);
  }

  emitHost(st = this.standings()) {
    if (this.destroyed || !this.hostSocketId) return;
    this.io.to(this.hostSocketId).emit('host:state', this.hostView(st));
  }

  emitPlayer(p, st = this.standings()) {
    if (this.destroyed || !p.socketId) return;
    this.io.to(p.socketId).emit('player:state', this.playerView(p, st));
  }

  destroy(reason) {
    if (this.destroyed) return;
    this.io.to(this.room).emit('game:ended', { reason });
    this.destroyed = true;
    this.clearTimer();
    if (this.hostTimer) clearTimeout(this.hostTimer);
    for (const p of this.players.values()) {
      if (p.removeTimer) clearTimeout(p.removeTimer);
      const s = this.socket(p.socketId);
      if (s) s.data = {};
    }
    const host = this.socket(this.hostSocketId);
    if (host) host.data = {};
    this.io.in(this.room).socketsLeave(this.room);
    this.onDestroy(this.pin);
  }
}
