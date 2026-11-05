import crypto from 'node:crypto';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { Server } from 'socket.io';
import { Game } from './game.js';
import { validateQuiz } from '../shared/quiz.js';

const PORT = Number(process.env.PORT) || 3000;
const IDLE_MS = 3 * 60 * 60 * 1000;
const dist = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'dist');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { maxHttpBufferSize: 1e6, pingInterval: 10000, pingTimeout: 8000 });
const games = new Map();

function addressRank(ip) {
  if (ip.startsWith('192.168.137.')) return 2;
  if (ip.startsWith('192.168.')) return 0;
  if (ip.startsWith('10.') || /^172\.(1[6-9]|2\d|3[01])\./.test(ip)) return 1;
  if (ip.startsWith('169.254.')) return 4;
  return 3;
}

function lanAddresses() {
  return Object.values(os.networkInterfaces())
    .flat()
    .filter(i => i && i.family === 'IPv4' && !i.internal)
    .map(i => i.address)
    .sort((a, b) => addressRank(a) - addressRank(b));
}

app.get('/api/network', (req, res) => res.json({ addresses: lanAddresses() }));
app.use(express.static(dist));
app.use((req, res) => {
  if (req.method !== 'GET') return res.sendStatus(404);
  res.sendFile(path.join(dist, 'index.html'), err => {
    if (err && !res.headersSent) res.status(500).send('Lance "npm run build" avant "npm start".');
  });
});

const cleanPin = v => (typeof v === 'string' || typeof v === 'number' ? String(v).replace(/\D/g, '') : '');

function createPin() {
  for (let i = 0; i < 1000; i++) {
    const pin = String(crypto.randomInt(100000, 1000000));
    if (!games.has(pin)) return pin;
  }
  throw new Error('Aucun code PIN disponible');
}

function current(socket) {
  const pin = socket.data && socket.data.pin;
  const game = pin ? games.get(pin) : null;
  return game && !game.destroyed ? game : null;
}

function release(socket) {
  const game = current(socket);
  const { role, token } = socket.data || {};
  socket.data = {};
  if (!game) return;
  if (role === 'host') game.detachHost(socket.id);
  if (role === 'player') {
    socket.leave(game.room);
    game.detachPlayer(socket.id, token);
  }
}

io.on('connection', socket => {
  socket.data = {};

  const handle = (event, fn) => {
    socket.on(event, (payload, ack) => {
      const reply = typeof ack === 'function' ? ack : () => {};
      try {
        fn(payload && typeof payload === 'object' ? payload : {}, reply);
      } catch (err) {
        console.error(`[${event}]`, err);
        reply({ error: 'Erreur serveur' });
      }
    });
  };

  const asHost = fn => (payload, reply) => {
    const game = current(socket);
    if (!game || socket.data.role !== 'host' || game.hostSocketId !== socket.id) {
      return reply({ error: "Tu n'es pas l'hôte de cette partie" });
    }
    game.touch();
    fn(game, payload, reply);
  };

  handle('game:check', ({ pin }, reply) => {
    const game = games.get(cleanPin(pin));
    if (!game) return reply({ error: 'Aucune partie avec ce code PIN' });
    if (game.phase === 'end') return reply({ error: 'Cette partie est terminée' });
    if (game.locked) return reply({ error: "La partie est verrouillée par l'hôte" });
    reply({ ok: true, pin: game.pin });
  });

  handle('host:create', ({ quiz }, reply) => {
    const { errors, quiz: clean } = validateQuiz(quiz);
    if (errors.length) return reply({ error: errors[0] });
    release(socket);
    const pin = createPin();
    const game = new Game({ io, pin, quiz: clean, onDestroy: p => games.delete(p) });
    games.set(pin, game);
    game.attachHost(socket);
    reply({ pin, token: game.hostToken });
  });

  handle('host:rejoin', ({ pin, token }, reply) => {
    const game = games.get(cleanPin(pin));
    if (!game || typeof token !== 'string' || game.hostToken !== token) {
      return reply({ error: "Cette partie n'existe plus" });
    }
    if (socket.data.role !== 'host' || socket.data.pin !== game.pin) release(socket);
    game.attachHost(socket);
    reply({ ok: true });
  });

  handle('host:start', asHost((game, _, reply) => reply(game.start())));
  handle('host:next', asHost((game, _, reply) => reply(game.next())));

  handle('host:kick', asHost((game, { playerId }, reply) => {
    game.kick(playerId);
    reply({ ok: true });
  }));

  handle('host:lock', asHost((game, { locked }, reply) => {
    game.locked = !!locked;
    game.emitHost();
    reply({ ok: true });
  }));

  handle('host:end', asHost((game, _, reply) => {
    socket.data = {};
    game.destroy("L'hôte a terminé la partie");
    reply({ ok: true });
  }));

  handle('player:join', ({ pin, name }, reply) => {
    const game = games.get(cleanPin(pin));
    if (!game) return reply({ error: 'Aucune partie avec ce code PIN' });
    release(socket);
    reply({ ...game.join(socket, name), pin: game.pin });
  });

  handle('player:rejoin', ({ pin, token }, reply) => {
    const game = games.get(cleanPin(pin));
    if (!game) return reply({ error: "Cette partie n'existe plus" });
    const same = socket.data.role === 'player' && socket.data.pin === game.pin && socket.data.token === token;
    if (!same) release(socket);
    reply(game.rejoinPlayer(socket, token));
  });

  handle('player:answer', ({ choice }, reply) => {
    const game = current(socket);
    if (!game || socket.data.role !== 'player') return reply({ error: 'Tu ne fais pas partie de cette partie' });
    reply(game.answer(socket.data.token, choice));
  });

  handle('player:leave', (_, reply) => {
    const game = current(socket);
    if (game && socket.data.role === 'player') {
      socket.leave(game.room);
      game.leave(socket.id, socket.data.token);
    }
    socket.data = {};
    reply({ ok: true });
  });

  socket.on('disconnect', () => release(socket));
});

setInterval(() => {
  const limit = Date.now() - IDLE_MS;
  for (const game of games.values()) if (game.touchedAt < limit) game.destroy('Partie expirée');
}, 5 * 60 * 1000).unref();

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Hakoot sur http://localhost:${PORT}`);
  for (const ip of lanAddresses()) console.log(`Réseau local : http://${ip}:${PORT}`);
});
