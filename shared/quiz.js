export const TIME_LIMITS = [5, 10, 20, 30, 45, 60, 90, 120, 240];
export const POINTS = [0, 1000, 2000];
export const LIMITS = { title: 100, description: 300, question: 200, answer: 90, image: 1000, questions: 100 };

const clean = value => (typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '');

export function blankQuestion(type = 'quiz') {
  if (type === 'truefalse') {
    return { type, text: '', image: '', answers: ['Vrai', 'Faux'], correct: [0], timeLimit: 20, points: 1000 };
  }
  return { type: 'quiz', text: '', image: '', answers: ['', '', '', ''], correct: [0], timeLimit: 20, points: 1000 };
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
    const type = src.type === 'truefalse' ? 'truefalse' : 'quiz';
    const text = clean(src.text).slice(0, LIMITS.question);
    if (!text) errors.push(`Question ${n} : texte manquant`);

    let image = clean(src.image).slice(0, LIMITS.image);
    if (image && !/^https?:\/\/\S+$/i.test(image)) {
      errors.push(`Question ${n} : l'image doit être une URL http(s)`);
      image = '';
    }

    const rawCorrect = Array.isArray(src.correct) ? src.correct : [];
    const timeLimit = TIME_LIMITS.includes(src.timeLimit) ? src.timeLimit : 20;
    const points = POINTS.includes(src.points) ? src.points : 1000;

    if (type === 'truefalse') {
      return { type, text, image, answers: ['Vrai', 'Faux'], correct: [rawCorrect[0] === 1 ? 1 : 0], timeLimit, points };
    }

    const answers = [];
    const correct = [];
    (Array.isArray(src.answers) ? src.answers.slice(0, 4) : []).forEach((a, idx) => {
      const t = clean(a).slice(0, LIMITS.answer);
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
