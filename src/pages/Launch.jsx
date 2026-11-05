import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../api.js';
import { useLaunch } from '../hooks.js';
import { Backdrop, Logo } from '../components/ui.jsx';

export default function Launch() {
  const { id } = useParams();
  const { launch } = useLaunch();
  const [error, setError] = useState('');
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    (async () => {
      const res = await api(`/quizzes/${encodeURIComponent(id)}`);
      if (!res.ok) {
        setError(
          res.status === 401
            ? "Ce lien s'ouvre sur l'ordinateur qui héberge Hakoot (http://localhost)."
            : res.status === 404
              ? "Ce quiz n'existe pas ou a été supprimé."
              : res.error,
        );
        return;
      }
      const err = await launch(res.quiz);
      if (err) setError(err);
    })();
  }, [id]);

  return (
    <div className="screen center">
      <Backdrop />
      <Logo />
      {error ? (
        <div className="card narrow">
          <h2 className="card-title">Impossible de lancer</h2>
          <p className="error">{error}</p>
          <Link className="btn primary block big" to="/create">
            Mes quiz
          </Link>
        </div>
      ) : (
        <>
          <div className="spinner" />
          <p className="loading-text">Création de la partie…</p>
        </>
      )}
    </div>
  );
}
