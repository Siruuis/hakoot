import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { HakootError, QuizStore } from '../../server/store.js';
import { sampleQuiz, tempDir } from '../helpers.js';

describe('QuizStore', () => {
  it('crée, lit, liste, modifie et supprime', () => {
    const store = new QuizStore(tempDir());
    const a = store.create(sampleQuiz({ title: 'A' }));
    const b = store.create(sampleQuiz({ title: 'B' }));
    assert.match(a.id, /^[A-Za-z0-9_-]{8}$/);
    assert.notEqual(a.id, b.id);
    assert.equal(store.get(a.id).title, 'A');
    store.update(a.id, { title: 'A2' });
    const list = store.list();
    assert.deepEqual(list.map(q => q.title), ['A2', 'B']);
    assert.equal(list[0].questionCount, 2);
    assert.equal(list[0].questions, undefined);
    assert.equal(store.get(a.id).description, 'Pour les tests');
    store.remove(b.id);
    assert.throws(() => store.get(b.id), e => e instanceof HakootError && e.status === 404);
  });

  it('persiste sur disque et recharge', () => {
    const dir = tempDir();
    const a = new QuizStore(dir).create(sampleQuiz());
    const reloaded = new QuizStore(dir);
    assert.deepEqual(reloaded.get(a.id), a);
    assert.ok(fs.existsSync(path.join(dir, 'quizzes.json')));
    assert.deepEqual(fs.readdirSync(dir).filter(f => f.endsWith('.tmp')), []);
  });

  it('refuse un quiz invalide avec la liste des erreurs', () => {
    const store = new QuizStore(tempDir());
    assert.throws(
      () => store.create({ title: '', questions: [] }),
      e => e instanceof HakootError && e.status === 400 && e.details.length === 2,
    );
    const a = store.create(sampleQuiz());
    assert.throws(() => store.update(a.id, { questions: [] }), e => e.status === 400);
    assert.equal(store.get(a.id).questions.length, 2);
  });

  it('ajoute des questions', () => {
    const store = new QuizStore(tempDir());
    const a = store.create(sampleQuiz());
    const updated = store.addQuestions(a.id, [{ text: 'Q3', answers: ['x', 'y'], correct: [0] }]);
    assert.equal(updated.questions.length, 3);
    assert.ok(updated.updatedAt > a.updatedAt);
    assert.throws(() => store.addQuestions(a.id, []), e => e.status === 400);
    assert.throws(() => store.addQuestions('nope', [{}]), e => e.status === 404);
  });

  it('sauvegarde un fichier corrompu au lieu de planter', () => {
    const dir = tempDir();
    fs.writeFileSync(path.join(dir, 'quizzes.json'), '{pas du json');
    const store = new QuizStore(dir);
    assert.equal(store.list().length, 0);
    assert.ok(fs.readdirSync(dir).some(f => f.startsWith('quizzes.json.corrupt-')));
    store.create(sampleQuiz());
    assert.equal(new QuizStore(dir).list().length, 1);
  });

  it('ignore les entrées invalides du fichier', () => {
    const dir = tempDir();
    fs.writeFileSync(path.join(dir, 'quizzes.json'), JSON.stringify([null, { title: 'sans id' }, { id: 'ok', ...sampleQuiz() }]));
    assert.deepEqual(new QuizStore(dir).list().map(q => q.id), ['ok']);
  });

  it('rejette les identifiants non textuels', () => {
    const store = new QuizStore(tempDir());
    for (const id of [undefined, null, 1, {}]) assert.throws(() => store.get(id), e => e.status === 404);
  });
});
