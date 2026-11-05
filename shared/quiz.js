export const TIME_LIMITS = [5, 10, 20, 30, 45, 60, 90, 120, 240];
export const POINTS = [0, 1000, 2000];
export const LIMITS = { title: 100, description: 300, question: 200, answer: 90, image: 1000, questions: 100, answers: 4 };

const clean = value => (typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : typeof value === 'number' ? String(value) : '');

const nearest = (list, value, fallback) => {
  const n = Number(value);
  if (value === null || value === undefined || value === '' || !Number.isFinite(n)) return fallback;
  return list.reduce((best, v) => (Math.abs(v - n) <= Math.abs(best - n) ? v : best), list[0]);
};

const POINT_ALIASES = { none: 0, zero: 0, standard: 1000, normal: 1000, double: 2000 };

function parsePoints(value) {
  if (typeof value === 'string' && value.toLowerCase() in POINT_ALIASES) return POINT_ALIASES[value.toLowerCase()];
  return nearest(POINTS, value, 1000);
}

export function blankQuestion(type = 'quiz') {
  if (type === 'truefalse') {
    return { type, text: '', image: '', answers: ['Vrai', 'Faux'], correct: [0], timeLimit: 20, points: 1000 };
  }
  return { type: 'quiz', text: '', image: '', answers: ['', '', '', ''], correct: [0], timeLimit: 20, points: 1000 };
}

function correctIndices(src, rawAnswers) {
  if (rawAnswers.some(a => a && typeof a === 'object')) {
    return rawAnswers.flatMap((a, i) => (a && typeof a === 'object' && a.correct === true ? [i] : []));
  }
  if (Array.isArray(src.correct)) return src.correct.filter(Number.isInteger);
  if (Number.isInteger(src.correct)) return [src.correct];
  return [];
}

function trueFalseIndex(src) {
  if (typeof src.correct === 'boolean') return src.correct ? 0 : 1;
  if (typeof src.answer === 'boolean') return src.answer ? 0 : 1;
  if (Array.isArray(src.answers) && src.answers.some(a => a && typeof a === 'object')) {
    const i = src.answers.findIndex(a => a && typeof a === 'object' && a.correct === true);
    return i === 1 ? 1 : 0;
  }
  const first = Array.isArray(src.correct) ? src.correct[0] : src.correct;
  return first === 1 ? 1 : 0;
}

export function validateQuiz(input) {
  const errors = [];
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return { errors: ['Quiz invalide'], quiz: { title: '', description: '', questions: [] } };
  }
  const title = clean(input.title).slice(0, LIMITS.title);
  if (!title) errors.push('Le quiz doit avoir un titre');
  const description = clean(input.description).slice(0, LIMITS.description);
  const list = Array.isArray(input.questions) ? input.questions : [];
  if (list.length === 0) errors.push('Ajoute au moins une question');
  if (list.length > LIMITS.questions) errors.push(`Maximum ${LIMITS.questions} questions`);

  const questions = list.slice(0, LIMITS.questions).map((raw, i) => {
    const n = i + 1;
    const src = raw && typeof raw === 'object' ? raw : {};
    const type = src.type === 'truefalse' || src.type === 'true_false' ? 'truefalse' : 'quiz';
    const text = clean(src.text ?? src.question).slice(0, LIMITS.question);
    if (!text) errors.push(`Question ${n} : texte manquant`);

    let image = clean(src.image).slice(0, LIMITS.image);
    if (image && !/^https?:\/\/\S+$/i.test(image)) {
      errors.push(`Question ${n} : l'image doit être une URL http(s)`);
      image = '';
    }

    const timeLimit = nearest(TIME_LIMITS, src.timeLimit, 20);
    const points = parsePoints(src.points);

    if (type === 'truefalse') {
      return { type, text, image, answers: ['Vrai', 'Faux'], correct: [trueFalseIndex(src)], timeLimit, points };
    }

    const rawAnswers = Array.isArray(src.answers) ? src.answers : [];
    if (rawAnswers.length > LIMITS.answers) errors.push(`Question ${n} : maximum ${LIMITS.answers} réponses`);
    const rawCorrect = correctIndices(src, rawAnswers);
    const answers = [];
    const correct = [];
    rawAnswers.slice(0, LIMITS.answers).forEach((a, idx) => {
      const t = clean(a && typeof a === 'object' ? a.text : a).slice(0, LIMITS.answer);
      if (!t) return;
      if (rawCorrect.includes(idx)) correct.push(answers.length);
      answers.push(t);
    });
    if (answers.length < 2) errors.push(`Question ${n} : il faut au moins 2 réponses`);
    else if (correct.length === 0) errors.push(`Question ${n} : coche au moins une bonne réponse`);

    return { type, text, image, answers, correct, timeLimit, points };
  });

  return { errors, quiz: { title, description, questions } };
}

export const QUIZ_FORMAT = {
  title: 'string (obligatoire, max 100)',
  description: 'string (optionnel, max 300)',
  questions: [
    {
      type: '"quiz" (2 à 4 réponses) ou "truefalse"',
      text: 'string (obligatoire, max 200)',
      answers: 'quiz : 2 à 4 chaînes (max 90) ou objets { text, correct: true }',
      correct: 'quiz : indices des bonnes réponses, ex. [1]. truefalse : true (Vrai) ou false (Faux)',
      timeLimit: `secondes, arrondi à ${TIME_LIMITS.join('/')} (défaut 20)`,
      points: '0, 1000 (défaut) ou 2000, ou "none" / "standard" / "double"',
      image: 'URL http(s) optionnelle',
    },
  ],
};
