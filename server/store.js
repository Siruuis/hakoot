import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { validateQuiz } from '../shared/quiz.js';

export const MAX_QUIZZES = 1000;

export class HakootError extends Error {
  constructor(status, message, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

const summary = q => ({
  id: q.id,
  title: q.title,
  description: q.description,
  questionCount: q.questions.length,
  createdAt: q.createdAt,
  updatedAt: q.updatedAt,
});

export class QuizStore {
  constructor(dir) {
    this.dir = dir;
    this.file = path.join(dir, 'quizzes.json');
    this.quizzes = new Map();
    this.load();
  }

  load() {
    let raw;
    try {
      raw = fs.readFileSync(this.file, 'utf8');
    } catch (err) {
      if (err.code === 'ENOENT') return;
      throw err;
    }
    let list;
    try {
      list = JSON.parse(raw);
    } catch {
      const backup = `${this.file}.corrupt-${Date.now()}`;
      fs.renameSync(this.file, backup);
      console.warn(`[store] quizzes.json illisible, sauvegardé dans ${backup}`);
      return;
    }
    for (const q of Array.isArray(list) ? list : []) {
      if (!q || typeof q.id !== 'string') continue;
      const { quiz } = validateQuiz(q);
      this.quizzes.set(q.id, { id: q.id, ...quiz, createdAt: q.createdAt || Date.now(), updatedAt: q.updatedAt || Date.now() });
    }
  }

  persist() {
    fs.mkdirSync(this.dir, { recursive: true });
    const tmp = `${this.file}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify([...this.quizzes.values()], null, 2));
    fs.renameSync(tmp, this.file);
  }

  check(input) {
    const { errors, quiz } = validateQuiz(input);
    if (errors.length) throw new HakootError(400, errors[0], errors);
    return quiz;
  }

  list() {
    return [...this.quizzes.values()].sort((a, b) => b.updatedAt - a.updatedAt).map(summary);
  }

  get(id) {
    const q = typeof id === 'string' ? this.quizzes.get(id) : null;
    if (!q) throw new HakootError(404, 'Quiz introuvable');
    return q;
  }

  create(input) {
    if (this.quizzes.size >= MAX_QUIZZES) throw new HakootError(409, `Limite de ${MAX_QUIZZES} quiz atteinte`);
    const quiz = this.check(input);
    const now = Date.now();
    let id;
    do id = crypto.randomBytes(6).toString('base64url');
    while (this.quizzes.has(id));
    const entry = { id, ...quiz, createdAt: now, updatedAt: now };
    this.quizzes.set(id, entry);
    this.persist();
    return entry;
  }

  update(id, input) {
    const current = this.get(id);
    const merged = {
      title: input.title ?? current.title,
      description: input.description ?? current.description,
      questions: input.questions ?? current.questions,
    };
    const entry = { id, ...this.check(merged), createdAt: current.createdAt, updatedAt: Math.max(Date.now(), current.updatedAt + 1) };
    this.quizzes.set(id, entry);
    this.persist();
    return entry;
  }

  addQuestions(id, questions) {
    if (!Array.isArray(questions) || !questions.length) throw new HakootError(400, 'Aucune question à ajouter');
    const current = this.get(id);
    return this.update(id, { questions: [...current.questions, ...questions] });
  }

  remove(id) {
    this.get(id);
    this.quizzes.delete(id);
    this.persist();
  }
}
