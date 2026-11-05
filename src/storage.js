import { sampleQuiz } from './sampleQuiz.js';

const KEY = 'hakoot:quizzes';

export const makeId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 10);

function write(list) {
  localStorage.setItem(KEY, JSON.stringify(list));
}

export function loadQuizzes() {
  const raw = localStorage.getItem(KEY);
  if (raw === null) {
    const seeded = [{ ...sampleQuiz, id: makeId(), updatedAt: Date.now() }];
    write(seeded);
    return seeded;
  }
  try {
    const list = JSON.parse(raw);
    return Array.isArray(list) ? list.filter(q => q && q.id && Array.isArray(q.questions)) : [];
  } catch {
    return [];
  }
}

export function getQuiz(id) {
  return loadQuizzes().find(q => q.id === id) || null;
}

export function saveQuiz(quiz) {
  const list = loadQuizzes();
  const entry = { ...quiz, updatedAt: Date.now() };
  const i = list.findIndex(q => q.id === quiz.id);
  if (i === -1) list.unshift(entry);
  else list[i] = entry;
  write(list);
  return entry;
}

export function createQuiz(data = {}) {
  return saveQuiz({
    title: data.title || '',
    description: data.description || '',
    questions: Array.isArray(data.questions) ? data.questions : [],
    id: makeId(),
  });
}

export function deleteQuiz(id) {
  write(loadQuizzes().filter(q => q.id !== id));
}
