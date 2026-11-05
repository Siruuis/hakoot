import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { QUIZ_FORMAT, validateQuiz } from '../shared/quiz.js';

const answerSchema = z.union([
  z.string(),
  z.object({ text: z.string(), correct: z.boolean().optional() }),
]);

const questionSchema = z.object({
  type: z.enum(['quiz', 'truefalse']).optional().describe('"quiz" (2 à 4 réponses, défaut) ou "truefalse"'),
  text: z.string().describe('Énoncé de la question, 200 caractères max'),
  answers: z
    .array(answerSchema)
    .optional()
    .describe('Type quiz : 2 à 4 réponses courtes (90 caractères max). Chaînes, ou objets { text, correct: true }'),
  correct: z
    .union([z.array(z.number().int()), z.number().int(), z.boolean()])
    .optional()
    .describe('Type quiz : indices (base 0) des bonnes réponses, ex. [1]. Type truefalse : true = Vrai, false = Faux'),
  timeLimit: z.number().optional().describe('Secondes : 5, 10, 20, 30, 45, 60, 90, 120 ou 240 (défaut 20)'),
  points: z
    .union([z.number(), z.enum(['none', 'standard', 'double'])])
    .optional()
    .describe('0, 1000 (défaut) ou 2000'),
  image: z.string().optional().describe('URL http(s) d\'une image, optionnelle'),
});

const quizShape = {
  title: z.string().describe('Titre du quiz, 100 caractères max'),
  description: z.string().optional().describe('Description courte, optionnelle'),
  questions: z.array(questionSchema).describe('1 à 100 questions'),
};

const text = data => ({ content: [{ type: 'text', text: typeof data === 'string' ? data : JSON.stringify(data, null, 2) }] });

const failure = err => ({
  isError: true,
  content: [
    {
      type: 'text',
      text: [err.message, ...(Array.isArray(err.details) && err.details.length > 1 ? err.details.map(d => `- ${d}`) : [])].join('\n'),
    },
  ],
});

const safe = fn => async args => {
  try {
    return await fn(args);
  } catch (err) {
    return failure(err);
  }
};

const created = (quiz, link) => ({
  id: quiz.id,
  title: quiz.title,
  questionCount: quiz.questions.length,
  launchUrl: link,
  message: `Quiz prêt. Ouvre ${link} sur l'ordinateur hôte pour lancer la partie.`,
});

export function createMcpServer(backend, version = '1.0.0') {
  const server = new McpServer(
    { name: 'hakoot', title: 'Hakoot', version },
    {
      instructions:
        "Hakoot est un jeu de quiz multijoueur en direct. Utilise create_quiz pour créer un quiz complet en un appel, puis donne le lien launchUrl à l'utilisateur. Vérifie l'exactitude des faits, garde des réponses courtes et plausibles, et une seule bonne réponse sauf demande contraire.",
    },
  );

  server.registerTool(
    'create_quiz',
    {
      title: 'Créer un quiz',
      description: `Crée un quiz Hakoot complet et renvoie son id et un lien pour lancer la partie. Format : ${JSON.stringify(QUIZ_FORMAT)}`,
      inputSchema: quizShape,
    },
    safe(async args => {
      const quiz = await backend.create(args);
      return text(created(quiz, backend.launchUrl(quiz.id)));
    }),
  );

  server.registerTool(
    'validate_quiz',
    {
      title: 'Valider un quiz',
      description: 'Vérifie un quiz sans l\'enregistrer. Renvoie les erreurs et la version normalisée.',
      inputSchema: quizShape,
      annotations: { readOnlyHint: true },
    },
    safe(async args => {
      const { errors, quiz } = validateQuiz(args);
      return text({ valid: errors.length === 0, errors, quiz });
    }),
  );

  server.registerTool(
    'list_quizzes',
    {
      title: 'Lister les quiz',
      description: 'Liste les quiz enregistrés sur le serveur Hakoot.',
      inputSchema: {},
      annotations: { readOnlyHint: true },
    },
    safe(async () => {
      const quizzes = await backend.list();
      return text(quizzes.map(q => ({ id: q.id, title: q.title, questionCount: q.questionCount, launchUrl: backend.launchUrl(q.id) })));
    }),
  );

  server.registerTool(
    'get_quiz',
    {
      title: 'Lire un quiz',
      description: 'Renvoie un quiz complet avec ses questions et bonnes réponses.',
      inputSchema: { id: z.string().describe('Identifiant du quiz') },
      annotations: { readOnlyHint: true },
    },
    safe(async ({ id }) => text({ ...(await backend.get(id)), launchUrl: backend.launchUrl(id) })),
  );

  server.registerTool(
    'update_quiz',
    {
      title: 'Modifier un quiz',
      description: 'Modifie le titre, la description ou remplace toutes les questions d\'un quiz. Les champs absents sont conservés.',
      inputSchema: {
        id: z.string().describe('Identifiant du quiz'),
        title: quizShape.title.optional(),
        description: quizShape.description,
        questions: quizShape.questions.optional().describe('Remplace toutes les questions'),
      },
    },
    safe(async ({ id, ...patch }) => {
      const quiz = await backend.update(id, patch);
      return text(created(quiz, backend.launchUrl(quiz.id)));
    }),
  );

  server.registerTool(
    'add_questions',
    {
      title: 'Ajouter des questions',
      description: 'Ajoute des questions à la fin d\'un quiz existant.',
      inputSchema: { id: z.string().describe('Identifiant du quiz'), questions: quizShape.questions },
    },
    safe(async ({ id, questions }) => {
      const quiz = await backend.addQuestions(id, questions);
      return text(created(quiz, backend.launchUrl(quiz.id)));
    }),
  );

  server.registerTool(
    'delete_quiz',
    {
      title: 'Supprimer un quiz',
      description: 'Supprime définitivement un quiz du serveur.',
      inputSchema: { id: z.string().describe('Identifiant du quiz') },
      annotations: { destructiveHint: true },
    },
    safe(async ({ id }) => {
      await backend.remove(id);
      return text(`Quiz ${id} supprimé.`);
    }),
  );

  server.registerTool(
    'list_live_games',
    {
      title: 'Parties en cours',
      description: 'Liste les parties en cours : code PIN, phase, question actuelle, joueurs et top 3.',
      inputSchema: {},
      annotations: { readOnlyHint: true },
    },
    safe(async () => text(await backend.games())),
  );

  return server;
}

export function storeBackend(store, games, base) {
  return {
    launchUrl: id => `${base}/launch/${id}`,
    list: async () => store.list(),
    get: async id => store.get(id),
    create: async data => store.create(data),
    update: async (id, data) => store.update(id, data),
    addQuestions: async (id, questions) => store.addQuestions(id, questions),
    remove: async id => store.remove(id),
    games: async () => [...games.values()].filter(g => !g.destroyed).map(g => g.summary()),
  };
}

export function httpBackend(url, apiKey) {
  const base = url.replace(/\/+$/, '');
  const request = async (method, path, body) => {
    let res;
    try {
      res = await fetch(`${base}/api${path}`, {
        method,
        headers: { 'content-type': 'application/json', ...(apiKey ? { authorization: `Bearer ${apiKey}` } : {}) },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    } catch {
      throw new Error(`Serveur Hakoot injoignable sur ${base}. Lance-le avec "npm start".`);
    }
    if (res.status === 204) return null;
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err = new Error(data.error || `Erreur HTTP ${res.status}`);
      err.details = data.errors;
      throw err;
    }
    return data;
  };
  return {
    launchUrl: id => `${base}/launch/${id}`,
    list: async () => (await request('GET', '/quizzes')).quizzes,
    get: async id => (await request('GET', `/quizzes/${encodeURIComponent(id)}`)).quiz,
    create: async data => (await request('POST', '/quizzes', data)).quiz,
    update: async (id, data) => (await request('PATCH', `/quizzes/${encodeURIComponent(id)}`, data)).quiz,
    addQuestions: async (id, questions) => (await request('POST', `/quizzes/${encodeURIComponent(id)}/questions`, { questions })).quiz,
    remove: async id => request('DELETE', `/quizzes/${encodeURIComponent(id)}`),
    games: async () => (await request('GET', '/games')).games,
  };
}
