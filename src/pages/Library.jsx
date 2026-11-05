import { useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { createQuiz, deleteQuiz, loadQuizzes } from '../storage.js';
import { validateQuiz } from '../../shared/quiz.js';
import { useLaunch } from '../hooks.js';
import { download, plural, slug } from '../utils.js';
import { Backdrop, Logo } from '../components/ui.jsx';

export default function Library() {
  const navigate = useNavigate();
  const [quizzes, setQuizzes] = useState(loadQuizzes);
  const [error, setError] = useState('');
  const { launch, busy } = useLaunch();
  const fileRef = useRef(null);

  const refresh = () => setQuizzes(loadQuizzes());

  const create = () => navigate(`/create/${createQuiz({ questions: [] }).id}`);

  const play = async quiz => {
    setError('');
    const err = await launch(quiz);
    if (err) setError(`« ${quiz.title || 'Sans titre'} » : ${err}`);
  };

  const duplicate = quiz => {
    createQuiz({ ...quiz, title: `${quiz.title || 'Sans titre'} (copie)` });
    refresh();
  };

  const remove = quiz => {
    if (!window.confirm(`Supprimer « ${quiz.title || 'Sans titre'} » ?`)) return;
    deleteQuiz(quiz.id);
    refresh();
  };

  const exportQuiz = quiz => {
    const { title, description, questions } = validateQuiz(quiz).quiz;
    download(`${slug(title)}.hakoot.json`, JSON.stringify({ title, description, questions }, null, 2), 'application/json');
  };

  const onImport = async e => {
    const file = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!file) return;
    setError('');
    try {
      const data = JSON.parse(await file.text());
      let count = 0;
      for (const item of Array.isArray(data) ? data : [data]) {
        const { quiz } = validateQuiz(item);
        if (!quiz.questions.length) continue;
        createQuiz({ ...quiz, title: quiz.title || 'Quiz importé' });
        count++;
      }
      if (!count) setError('Aucun quiz valide dans ce fichier');
      refresh();
    } catch {
      setError('Fichier JSON invalide');
    }
  };

  return (
    <div className="screen page">
      <Backdrop />
      <header className="topbar">
        <Link to="/">
          <Logo small />
        </Link>
        <div className="row">
          <button className="btn ghost" onClick={() => fileRef.current.click()}>
            Importer
          </button>
          <input ref={fileRef} type="file" accept=".json,application/json" hidden onChange={onImport} />
          <button className="btn primary" onClick={create}>
            + Nouveau quiz
          </button>
        </div>
      </header>

      <main className="library">
        <h1 className="page-title">Mes quiz</h1>
        {error && <p className="error banner">{error}</p>}
        {quizzes.length === 0 ? (
          <div className="card empty">
            <p>Tu n'as encore aucun quiz.</p>
            <button className="btn primary" onClick={create}>
              Créer mon premier quiz
            </button>
          </div>
        ) : (
          <div className="quiz-grid">
            {quizzes.map(quiz => {
              const { errors } = validateQuiz(quiz);
              return (
                <article key={quiz.id} className="quiz-card">
                  <div className="quiz-card-body">
                    <h3>{quiz.title || 'Sans titre'}</h3>
                    {quiz.description && <p className="muted small">{quiz.description}</p>}
                    <p className="muted small">
                      {plural(quiz.questions.length, 'question')} · modifié le{' '}
                      {new Date(quiz.updatedAt || Date.now()).toLocaleDateString('fr-FR')}
                    </p>
                    {errors.length > 0 && <p className="tag warn">Incomplet : {errors[0]}</p>}
                  </div>
                  <div className="quiz-card-actions">
                    <button className="btn primary" disabled={busy || errors.length > 0} onClick={() => play(quiz)}>
                      ▶ Lancer
                    </button>
                    <Link className="btn ghost" to={`/create/${quiz.id}`}>
                      Modifier
                    </Link>
                    <div className="row small-actions">
                      <button className="link" onClick={() => duplicate(quiz)}>
                        Dupliquer
                      </button>
                      <button className="link" onClick={() => exportQuiz(quiz)}>
                        Exporter
                      </button>
                      <button className="link danger" onClick={() => remove(quiz)}>
                        Supprimer
                      </button>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
