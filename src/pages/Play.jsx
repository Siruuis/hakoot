import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { call } from '../socket.js';
import { clearSession } from '../session.js';
import { useGame, useRemaining } from '../hooks.js';
import { ordinal } from '../utils.js';
import { AnswerTile, Backdrop, Confetti, Ended, Loading, Logo, Offline, ProgressBar } from '../components/ui.jsx';

export default function Play() {
  const { state, ended, connected } = useGame('player');
  const remaining = useRemaining(state);
  const navigate = useNavigate();
  const [pending, setPending] = useState(null);
  const [toast, setToast] = useState('');

  const key = state ? `${state.index}:${state.phase}` : '';
  useEffect(() => setPending(null), [key]);

  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(''), 3000);
    return () => clearTimeout(id);
  }, [toast]);

  if (ended) return <Ended message={ended} to="/" label="Rejouer" />;
  if (!state) return <Loading />;

  const choose = async i => {
    if (pending !== null || state.answered) return;
    setPending(i);
    const res = await call('player:answer', { choice: i });
    if (res.error) {
      setPending(null);
      setToast(res.error);
    }
  };

  const leave = async () => {
    if (!window.confirm('Quitter la partie ?')) return;
    await call('player:leave');
    clearSession();
    navigate('/');
  };

  const tone =
    state.phase === 'reveal' && state.result
      ? state.result.correct
        ? 'tone-good'
        : 'tone-bad'
      : '';

  return (
    <div className={`screen player phase-${state.phase} ${tone}`}>
      {state.phase !== 'question' && <Backdrop />}
      <Offline connected={connected} />
      <header className="player-bar">
        <span className="player-name">{state.name}</span>
        {state.phase !== 'lobby' && state.phase !== 'end' && (
          <span className="pill">
            {state.index + 1} / {state.total}
          </span>
        )}
        <span className="player-score">{state.score}</span>
      </header>
      <main className="player-main">
        <PlayerPhase state={state} remaining={remaining} pending={pending} choose={choose} leave={leave} />
      </main>
      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}

function Standing({ state }) {
  return (
    <div className="standing">
      <div className="standing-rank">{ordinal(state.rank)}</div>
      <div className="muted">
        {state.behind ? (
          <>
            à {state.behind.gap} pts de <strong>{state.behind.name}</strong>
          </>
        ) : state.playerCount > 1 ? (
          'Tu es en tête !'
        ) : (
          'Seul en lice'
        )}
      </div>
    </div>
  );
}

function PlayerPhase({ state, remaining, pending, choose, leave }) {
  const q = state.question;

  if (state.phase === 'lobby') {
    return (
      <div className="center-col">
        <Logo />
        <h2>Tu es dans la partie !</h2>
        <p className="muted">Ton pseudo s'affiche sur l'écran de l'hôte. La partie va bientôt commencer.</p>
        <div className="dots">
          <span />
          <span />
          <span />
        </div>
        <button className="link" onClick={leave}>
          Quitter
        </button>
      </div>
    );
  }

  if (state.phase === 'intro') {
    return (
      <div className="center-col">
        <div className="intro-num">
          <span>Question</span>
          <strong>{state.index + 1}</strong>
          <span>sur {state.total}</span>
        </div>
        <h2 className="player-q">{q.text}</h2>
        {q.points === 2000 && <div className="badge-double">Points doublés !</div>}
        <div className="intro-progress">
          <ProgressBar remaining={remaining || 0} duration={state.duration} />
        </div>
        <p className="muted">Prépare-toi…</p>
      </div>
    );
  }

  if (state.phase === 'question') {
    const chosen = state.answered ? state.choice : pending;
    if (chosen !== null) {
      return (
        <div className="center-col">
          <div className="sent-tile">
            <AnswerTile index={chosen} text={q.answers[chosen]} />
          </div>
          <h2>Réponse envoyée !</h2>
          <p className="muted">On attend les autres joueurs…</p>
          <div className="dots">
            <span />
            <span />
            <span />
          </div>
        </div>
      );
    }
    return (
      <div className="player-question">
        <div className="player-q-head">
          <p className="player-q-small">{q.text}</p>
          <span className="timer-chip">{Math.ceil((remaining || 0) / 1000)}</span>
        </div>
        <div className={`answers player-answers n${q.answers.length}`}>
          {q.answers.map((a, i) => (
            <AnswerTile key={i} index={i} text={a} onClick={() => choose(i)} />
          ))}
        </div>
      </div>
    );
  }

  if (state.phase === 'reveal' || state.phase === 'scoreboard') {
    const r = state.result;
    let title = 'Prépare-toi pour la suite';
    let detail = 'Tu as rejoint pendant la question';
    if (r) {
      title = r.correct ? 'Correct !' : r.answered ? 'Raté !' : 'Temps écoulé !';
      detail = r.correct ? (r.points > 0 ? `+${r.points}` : 'Question sans points') : '+0';
    }
    return (
      <div className="center-col">
        {r && r.correct && state.phase === 'reveal' && <Confetti count={50} />}
        <h1 className="result-title">{title}</h1>
        <div className="result-points">{detail}</div>
        {r && r.streak >= 2 && <div className="streak">🔥 Série de {r.streak}</div>}
        {r && !r.correct && state.phase === 'reveal' && state.correct && (
          <p className="muted">
            Bonne réponse : <strong>{state.correct.map(i => q.answers[i]).join(' / ')}</strong>
          </p>
        )}
        <Standing state={state} />
      </div>
    );
  }

  if (state.phase === 'end') {
    const medal = ['🥇', '🥈', '🥉'][state.rank - 1];
    return (
      <div className="center-col">
        {medal && <Confetti count={60} />}
        {medal && <div className="end-medal">{medal}</div>}
        <h1 className="result-title">{state.rank === 1 ? '1re' : `${state.rank}e`} place</h1>
        <div className="result-points">{state.score} points</div>
        <p className="muted">
          sur {state.playerCount} joueur{state.playerCount > 1 ? 's' : ''}
        </p>
        <p className="muted">Regarde le podium sur l'écran de l'hôte !</p>
      </div>
    );
  }

  return null;
}
