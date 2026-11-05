import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { blankQuestion, LIMITS, validateQuiz } from '../../shared/quiz.js';

const q = (extra = {}) => ({ type: 'quiz', text: 'Question ?', answers: ['A', 'B', 'C', 'D'], correct: [0], ...extra });

describe('validateQuiz', () => {
  it('accepte un quiz valide et le normalise', () => {
    const { errors, quiz } = validateQuiz({ title: '  Mon   quiz ', questions: [q()] });
    assert.deepEqual(errors, []);
    assert.equal(quiz.title, 'Mon quiz');
    assert.deepEqual(quiz.questions[0], {
      type: 'quiz',
      text: 'Question ?',
      image: '',
      answers: ['A', 'B', 'C', 'D'],
      correct: [0],
      timeLimit: 20,
      points: 1000,
    });
  });

  it('refuse les entrées qui ne sont pas des objets', () => {
    for (const input of [null, undefined, 42, 'quiz', [], true]) {
      const { errors, quiz } = validateQuiz(input);
      assert.deepEqual(errors, ['Quiz invalide']);
      assert.deepEqual(quiz.questions, []);
    }
  });

  it('exige un titre et au moins une question', () => {
    const { errors } = validateQuiz({ title: '', questions: [] });
    assert.ok(errors.includes('Le quiz doit avoir un titre'));
    assert.ok(errors.includes('Ajoute au moins une question'));
  });

  it('retire les réponses vides et réindexe les bonnes réponses', () => {
    const { errors, quiz } = validateQuiz({ title: 't', questions: [q({ answers: ['A', '', 'C', '  '], correct: [2] })] });
    assert.deepEqual(errors, []);
    assert.deepEqual(quiz.questions[0].answers, ['A', 'C']);
    assert.deepEqual(quiz.questions[0].correct, [1]);
  });

  it('signale une bonne réponse pointant vers une réponse vide', () => {
    const { errors } = validateQuiz({ title: 't', questions: [q({ answers: ['A', '', 'C'], correct: [1] })] });
    assert.match(errors[0], /bonne réponse/);
  });

  it('exige au moins 2 réponses et au plus 4', () => {
    assert.match(validateQuiz({ title: 't', questions: [q({ answers: ['A'] })] }).errors[0], /au moins 2/);
    assert.match(validateQuiz({ title: 't', questions: [q({ answers: ['A', 'B', 'C', 'D', 'E'] })] }).errors[0], /maximum 4/);
  });

  it('accepte plusieurs bonnes réponses', () => {
    const { errors, quiz } = validateQuiz({ title: 't', questions: [q({ correct: [0, 3] })] });
    assert.deepEqual(errors, []);
    assert.deepEqual(quiz.questions[0].correct, [0, 3]);
  });

  it('accepte le format objet { text, correct }', () => {
    const { errors, quiz } = validateQuiz({
      title: 't',
      questions: [{ text: 'x', answers: [{ text: 'Non' }, { text: 'Oui', correct: true }, 'Peut-être'] }],
    });
    assert.deepEqual(errors, []);
    assert.deepEqual(quiz.questions[0].answers, ['Non', 'Oui', 'Peut-être']);
    assert.deepEqual(quiz.questions[0].correct, [1]);
  });

  it('accepte un indice seul pour correct', () => {
    assert.deepEqual(validateQuiz({ title: 't', questions: [q({ correct: 2 })] }).quiz.questions[0].correct, [2]);
  });

  it('gère les vrai/faux sous toutes leurs formes', () => {
    const tf = extra => validateQuiz({ title: 't', questions: [{ type: 'truefalse', text: 'x', ...extra }] }).quiz.questions[0];
    assert.deepEqual(tf({ correct: true }).correct, [0]);
    assert.deepEqual(tf({ correct: false }).correct, [1]);
    assert.deepEqual(tf({ answer: false }).correct, [1]);
    assert.deepEqual(tf({ correct: [1] }).correct, [1]);
    assert.deepEqual(tf({ correct: 1 }).correct, [1]);
    assert.deepEqual(tf({}).correct, [0]);
    assert.deepEqual(tf({ answers: [{ text: 'Vrai' }, { text: 'Faux', correct: true }] }).correct, [1]);
    assert.deepEqual(tf({ correct: true }).answers, ['Vrai', 'Faux']);
    assert.equal(validateQuiz({ title: 't', questions: [{ type: 'true_false', text: 'x' }] }).quiz.questions[0].type, 'truefalse');
  });

  it('arrondit le chrono à la valeur autorisée la plus proche', () => {
    const t = timeLimit => validateQuiz({ title: 't', questions: [q({ timeLimit })] }).quiz.questions[0].timeLimit;
    assert.equal(t(5), 5);
    assert.equal(t(15), 20);
    assert.equal(t(25), 30);
    assert.equal(t(1), 5);
    assert.equal(t(10000), 240);
    assert.equal(t('30'), 30);
    assert.equal(t('abc'), 20);
    assert.equal(t(undefined), 20);
  });

  it('normalise les points', () => {
    const p = points => validateQuiz({ title: 't', questions: [q({ points })] }).quiz.questions[0].points;
    assert.equal(p(0), 0);
    assert.equal(p(2000), 2000);
    assert.equal(p(1500), 2000);
    assert.equal(p('double'), 2000);
    assert.equal(p('none'), 0);
    assert.equal(p('Standard'), 1000);
    assert.equal(p(undefined), 1000);
  });

  it('valide les URL d\'image', () => {
    assert.match(validateQuiz({ title: 't', questions: [q({ image: 'javascript:alert(1)' })] }).errors[0], /URL/);
    assert.equal(validateQuiz({ title: 't', questions: [q({ image: 'https://x.y/a.png' })] }).quiz.questions[0].image, 'https://x.y/a.png');
  });

  it('tronque les textes trop longs', () => {
    const long = 'x'.repeat(500);
    const { quiz } = validateQuiz({ title: long, description: long, questions: [q({ text: long, answers: [long, 'B'] })] });
    assert.equal(quiz.title.length, LIMITS.title);
    assert.equal(quiz.description.length, LIMITS.description);
    assert.equal(quiz.questions[0].text.length, LIMITS.question);
    assert.equal(quiz.questions[0].answers[0].length, LIMITS.answer);
  });

  it('limite le nombre de questions', () => {
    const { errors, quiz } = validateQuiz({ title: 't', questions: Array.from({ length: 101 }, () => q()) });
    assert.ok(errors.some(e => /Maximum 100/.test(e)));
    assert.equal(quiz.questions.length, 100);
  });

  it('accepte "question" comme alias de "text" et les réponses numériques', () => {
    const { errors, quiz } = validateQuiz({ title: 't', questions: [{ question: '2+2 ?', answers: [3, 4], correct: [1] }] });
    assert.deepEqual(errors, []);
    assert.equal(quiz.questions[0].text, '2+2 ?');
    assert.deepEqual(quiz.questions[0].answers, ['3', '4']);
  });

  it('ignore les questions qui ne sont pas des objets', () => {
    const { errors } = validateQuiz({ title: 't', questions: [null, 'x'] });
    assert.ok(errors.some(e => /Question 1 : texte manquant/.test(e)));
    assert.ok(errors.some(e => /Question 2 : texte manquant/.test(e)));
  });

  it('blankQuestion produit des modèles cohérents', () => {
    assert.deepEqual(blankQuestion('truefalse').answers, ['Vrai', 'Faux']);
    assert.equal(blankQuestion().answers.length, 4);
    const filled = { ...blankQuestion(), text: 'x', answers: ['a', 'b', '', ''] };
    assert.deepEqual(validateQuiz({ title: 't', questions: [filled] }).errors, []);
  });
});
