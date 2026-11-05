import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { getQuiz, saveQuiz } from '../storage.js';
import { blankQuestion, LIMITS, POINTS, TIME_LIMITS, validateQuiz } from '../../shared/quiz.js';
import { useLaunch } from '../hooks.js';
import { ANSWER_STYLES, Check, Shape } from '../components/ui.jsx';

const POINT_LABELS = { 0: 'Aucun point', 1000: 'Standard', 2000: 'Double' };

function toEditable(q) {
  if (q.type === 'truefalse') return { ...q, answers: ['Vrai', 'Faux'] };
  return { ...q, answers: [...(q.answers || []), '', '', '', ''].slice(0, 4), correct: q.correct || [] };
}

function load(id) {
  const quiz = getQuiz(id);
  if (!quiz) return null;
  const questions = quiz.questions.length ? quiz.questions.map(toEditable) : [blankQuestion()];
  return { ...quiz, questions };
}

export default function Editor() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [quiz, setQuiz] = useState(() => load(id));
  const [sel, setSel] = useState(0);
  const [launchError, setLaunchError] = useState('');
  const { launch, busy } = useLaunch();

  useEffect(() => {
    if (!quiz) navigate('/create', { replace: true });
    else saveQuiz(quiz);
  }, [quiz, navigate]);

  const errors = useMemo(() => (quiz ? validateQuiz(quiz).errors : []), [quiz]);

  if (!quiz) return null;

  const index = Math.min(sel, quiz.questions.length - 1);
  const q = quiz.questions[index];
  const count = quiz.questions.length;

  const patchQuiz = p => setQuiz(z => ({ ...z, ...p }));
  const setQuestions = fn => setQuiz(z => ({ ...z, questions: fn(z.questions) }));
  const patchQ = p => setQuestions(list => list.map((x, i) => (i === index ? { ...x, ...p } : x)));

  const addQ = type => {
    if (count >= LIMITS.questions) return;
    setQuestions(list => [...list, blankQuestion(type)]);
    setSel(count);
  };

  const duplicateQ = () => {
    if (count >= LIMITS.questions) return;
    setQuestions(list => [...list.slice(0, index + 1), { ...list[index] }, ...list.slice(index + 1)]);
    setSel(index + 1);
  };

  const removeQ = () => {
    if (count === 1) return;
    if (!window.confirm('Supprimer cette question ?')) return;
    setQuestions(list => list.filter((_, i) => i !== index));
    setSel(Math.max(0, index === count - 1 ? index - 1 : index));
  };

  const moveQ = dir => {
    const target = index + dir;
    if (target < 0 || target >= count) return;
    setQuestions(list => {
      const copy = [...list];
      [copy[index], copy[target]] = [copy[target], copy[index]];
      return copy;
    });
    setSel(target);
  };

  const setType = type => {
    if (type === q.type) return;
    patchQ(type === 'truefalse' ? { type, answers: ['Vrai', 'Faux'], correct: [0] } : { type, answers: ['', '', '', ''], correct: [0] });
  };

  const setAnswer = (i, text) => patchQ({ answers: q.answers.map((a, j) => (j === i ? text : a)) });

  const toggleCorrect = i => {
    if (q.type === 'truefalse') return patchQ({ correct: [i] });
    const next = q.correct.includes(i) ? q.correct.filter(c => c !== i) : [...q.correct, i].sort((a, b) => a - b);
    patchQ({ correct: next });
  };

  const play = async () => {
    setLaunchError('');
    const err = await launch(quiz);
    if (err) setLaunchError(err);
  };

  return (
    <div className="screen editor">
      <header className="topbar">
        <Link to="/create" className="btn ghost">
          ← Mes quiz
        </Link>
        <input
          className="title-input"
          placeholder="Titre du quiz"
          value={quiz.title}
          maxLength={LIMITS.title}
          onChange={e => patchQuiz({ title: e.target.value })}
        />
        <div className="row">
          <span className="muted small">Enregistré</span>
          <button className="btn primary" disabled={busy || errors.length > 0} onClick={play}>
            ▶ Lancer
          </button>
        </div>
      </header>

      <div className="editor-body">
        <aside className="q-list">
          {quiz.questions.map((item, i) => (
            <button key={i} className={`q-thumb ${i === index ? 'active' : ''}`} onClick={() => setSel(i)}>
              <span className="q-num">{i + 1}</span>
              <span className="q-thumb-text">{item.text || 'Question sans texte'}</span>
              <span className="muted small">{item.type === 'truefalse' ? 'Vrai/Faux' : 'Quiz'}</span>
            </button>
          ))}
          <div className="q-add">
            <button className="btn primary block" onClick={() => addQ('quiz')} disabled={count >= LIMITS.questions}>
              + Quiz
            </button>
            <button className="btn ghost block" onClick={() => addQ('truefalse')} disabled={count >= LIMITS.questions}>
              + Vrai / Faux
            </button>
          </div>
        </aside>

        <main className="q-edit">
          <textarea
            className="q-text"
            placeholder="Écris ta question…"
            value={q.text}
            maxLength={LIMITS.question}
            rows={2}
            onChange={e => patchQ({ text: e.target.value })}
          />
          <div className="image-field">
            <input
              placeholder="URL d'une image (optionnel)"
              value={q.image}
              maxLength={LIMITS.image}
              onChange={e => patchQ({ image: e.target.value })}
            />
            {/^https?:\/\/\S+$/i.test(q.image.trim()) && (
              <img key={q.image} src={q.image.trim()} alt="" onError={e => (e.currentTarget.style.display = 'none')} />
            )}
          </div>
          <div className={`edit-answers n${q.answers.length}`}>
            {q.answers.map((a, i) => {
              const isCorrect = q.correct.includes(i);
              return (
                <div key={i} className={`edit-answer ${a.trim() || q.type === 'truefalse' ? 'filled' : ''}`} style={{ '--c': ANSWER_STYLES[i].color }}>
                  <Shape index={i} />
                  {q.type === 'truefalse' ? (
                    <span className="answer-text">{a}</span>
                  ) : (
                    <input
                      placeholder={`Réponse ${i + 1}${i >= 2 ? ' (optionnel)' : ''}`}
                      value={a}
                      maxLength={LIMITS.answer}
                      onChange={e => setAnswer(i, e.target.value)}
                    />
                  )}
                  <button
                    type="button"
                    className={`correct-toggle ${isCorrect ? 'on' : ''}`}
                    title={isCorrect ? 'Bonne réponse' : 'Marquer comme bonne réponse'}
                    onClick={() => toggleCorrect(i)}
                  >
                    {isCorrect && <Check size={22} />}
                  </button>
                </div>
              );
            })}
          </div>
          {errors.length > 0 && (
            <div className="errors">
              <strong>À corriger avant de lancer :</strong>
              <ul>
                {errors.slice(0, 6).map((e, i) => (
                  <li key={i}>{e}</li>
                ))}
                {errors.length > 6 && <li>… et {errors.length - 6} autre(s)</li>}
              </ul>
            </div>
          )}
          {launchError && <p className="error banner">{launchError}</p>}
        </main>

        <aside className="q-settings">
          <label>
            Type de question
            <select value={q.type} onChange={e => setType(e.target.value)}>
              <option value="quiz">Quiz (2 à 4 réponses)</option>
              <option value="truefalse">Vrai ou faux</option>
            </select>
          </label>
          <label>
            Temps imparti
            <select value={q.timeLimit} onChange={e => patchQ({ timeLimit: Number(e.target.value) })}>
              {TIME_LIMITS.map(t => (
                <option key={t} value={t}>
                  {t < 60 ? `${t} secondes` : `${t / 60} minute${t >= 120 ? 's' : ''}`}
                </option>
              ))}
            </select>
          </label>
          <label>
            Points
            <select value={q.points} onChange={e => patchQ({ points: Number(e.target.value) })}>
              {POINTS.map(p => (
                <option key={p} value={p}>
                  {POINT_LABELS[p]}
                </option>
              ))}
            </select>
          </label>
          <label>
            Description du quiz
            <textarea
              rows={3}
              value={quiz.description}
              maxLength={LIMITS.description}
              onChange={e => patchQuiz({ description: e.target.value })}
            />
          </label>
          <div className="settings-actions">
            <div className="row">
              <button className="btn ghost" onClick={() => moveQ(-1)} disabled={index === 0} title="Monter">
                ↑
              </button>
              <button className="btn ghost" onClick={() => moveQ(1)} disabled={index === count - 1} title="Descendre">
                ↓
              </button>
              <button className="btn ghost grow" onClick={duplicateQ} disabled={count >= LIMITS.questions}>
                Dupliquer
              </button>
            </div>
            <button className="btn danger block" onClick={removeQ} disabled={count === 1}>
              Supprimer la question
            </button>
          </div>
          <p className="muted small">
            Coche une ou plusieurs bonnes réponses. Les réponses vides sont ignorées. Les points baissent avec le temps
            de réponse, avec un bonus de série.
          </p>
        </aside>
      </div>
    </div>
  );
}
