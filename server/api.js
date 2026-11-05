import express from 'express';
import { config } from './config.js';
import { baseUrl, rateLimit, requireAuth } from './auth.js';
import { HakootError } from './store.js';
import { LIMITS, POINTS, QUIZ_FORMAT, TIME_LIMITS, validateQuiz } from '../shared/quiz.js';

export const EXAMPLE_QUIZ = {
  title: 'Capitales du monde',
  description: 'Exemple de quiz',
  questions: [
    { type: 'quiz', text: "Quelle est la capitale de l'Australie ?", answers: ['Sydney', 'Canberra', 'Melbourne', 'Perth'], correct: [1], timeLimit: 20, points: 1000 },
    { type: 'truefalse', text: 'Ottawa est la capitale du Canada.', correct: true, timeLimit: 10 },
  ],
};

const links = (req, id) => ({ launch: `${baseUrl(req)}/launch/${id}`, api: `${baseUrl(req)}/api/quizzes/${id}` });

export function apiRouter({ store, games, lanAddresses }) {
  const r = express.Router();
  r.use(rateLimit());

  r.get('/health', (req, res) =>
    res.json({
      ok: true,
      name: 'hakoot',
      version: config.version,
      games: games.size,
      quizzes: store.quizzes.size,
      auth: { apiKeyConfigured: !!config.apiKey, trustLocalhost: config.trustLocalhost },
    }),
  );

  r.get('/network', (req, res) => res.json({ addresses: lanAddresses() }));

  r.get('/schema', (req, res) =>
    res.json({ format: QUIZ_FORMAT, limits: LIMITS, timeLimits: TIME_LIMITS, points: POINTS, example: EXAMPLE_QUIZ }),
  );

  r.use(express.json({ limit: '1mb' }));
  r.use(requireAuth);

  r.get('/quizzes', (req, res) => {
    res.json({ quizzes: store.list().map(q => ({ ...q, links: links(req, q.id) })) });
  });

  r.post('/quizzes/validate', (req, res) => {
    const { errors, quiz } = validateQuiz(req.body);
    res.json({ valid: errors.length === 0, errors, quiz });
  });

  r.post('/quizzes', (req, res) => {
    const quiz = store.create(req.body);
    res.status(201).location(`/api/quizzes/${quiz.id}`).json({ quiz, links: links(req, quiz.id) });
  });

  r.get('/quizzes/:id', (req, res) => {
    const quiz = store.get(req.params.id);
    res.json({ quiz, links: links(req, quiz.id) });
  });

  r.put('/quizzes/:id', (req, res) => {
    const body = req.body || {};
    const quiz = store.update(req.params.id, {
      title: body.title ?? '',
      description: body.description ?? '',
      questions: body.questions ?? [],
    });
    res.json({ quiz, links: links(req, quiz.id) });
  });

  r.patch('/quizzes/:id', (req, res) => {
    const quiz = store.update(req.params.id, req.body || {});
    res.json({ quiz, links: links(req, quiz.id) });
  });

  r.post('/quizzes/:id/questions', (req, res) => {
    const body = req.body || {};
    const quiz = store.addQuestions(req.params.id, Array.isArray(body) ? body : body.questions);
    res.json({ quiz, links: links(req, quiz.id) });
  });

  r.delete('/quizzes/:id', (req, res) => {
    store.remove(req.params.id);
    res.status(204).end();
  });

  r.get('/games', (req, res) => {
    res.json({ games: [...games.values()].filter(g => !g.destroyed).map(g => g.summary()) });
  });

  r.use((req, res) => res.status(404).json({ error: 'Route API inconnue' }));

  r.use((err, req, res, next) => {
    if (err instanceof HakootError) return res.status(err.status).json({ error: err.message, errors: err.details });
    if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'JSON invalide' });
    if (err.type === 'entity.too.large') return res.status(413).json({ error: 'Requête trop volumineuse (max 1 Mo)' });
    console.error('[api]', err);
    res.status(500).json({ error: 'Erreur serveur' });
  });

  return r;
}
