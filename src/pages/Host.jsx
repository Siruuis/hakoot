import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { QRCodeSVG } from 'qrcode.react';
import { call } from '../socket.js';
import { clearSession } from '../session.js';
import { useGame, useJoinOrigin, useRemaining } from '../hooks.js';
import { download, formatPin, ordinal, plural, slug } from '../utils.js';
import { ANSWER_STYLES, AnswerTile, Backdrop, CHIP_COLORS, Check, CircleTimer, Confetti, Ended, Loading, Logo, Offline, ProgressBar, Shape } from '../components/ui.jsx';

export default function Host() {
  const { state, ended, connected } = useGame('host');
  const remaining = useRemaining(state);
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState('');
  const busyRef = useRef(false);

  const act = async (event, payload) => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    const res = await call(event, payload);
    busyRef.current = false;
    setBusy(false);
    if (res.error) setToast(res.error);
  };

  const quit = async () => {
    if (state && state.phase !== 'end' && !window.confirm('Terminer la partie pour tout le monde ?')) return;
    await call('host:end');
    clearSession();
    navigate('/create');
  };

  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(''), 3500);
    return () => clearTimeout(id);
  }, [toast]);

  const phase = state && state.phase;
  useEffect(() => {
    if (phase !== 'reveal' && phase !== 'scoreboard') return;
    const onKey = e => {
      if (e.repeat || (e.key !== ' ' && e.key !== 'Enter' && e.key !== 'ArrowRight')) return;
      if (e.target instanceof HTMLElement && e.target.closest('input, textarea, select, button, a')) return;
      e.preventDefault();
      act('host:next');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [phase]);

  if (ended) return <Ended message={ended} to="/create" label="Retour à mes quiz" />;
  if (!state) return <Loading />;

  const screens = {
    lobby: <Lobby state={state} act={act} busy={busy} />,
    intro: <Intro state={state} remaining={remaining} />,
    question: <Question state={state} remaining={remaining} act={act} busy={busy} />,
    reveal: <Reveal state={state} act={act} busy={busy} />,
    scoreboard: <Scoreboard state={state} act={act} busy={busy} />,
    end: <Podium state={state} quit={quit} />,
  };

  return (
    <div className={`screen host phase-${state.phase}`}>
      {(state.phase === 'lobby' || state.phase === 'intro' || state.phase === 'scoreboard' || state.phase === 'end') && <Backdrop />}
      <Offline connected={connected} />
      <header className="host-bar">
        <Logo small />
        {state.phase !== 'lobby' && (
          <span className="pill">
            PIN <strong>{formatPin(state.pin)}</strong>
          </span>
        )}
        {state.phase !== 'lobby' && state.phase !== 'end' && (
          <span className="pill">
            Question {state.index + 1} / {state.total}
          </span>
        )}
        <span className="grow" />
        <span className="pill">👤 {state.connectedCount}</span>
        {state.phase !== 'end' && (
          <button className="btn ghost small-btn" onClick={quit}>
            Terminer
          </button>
        )}
      </header>
      {screens[state.phase]}
      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}

function Lobby({ state, act, busy }) {
  const { origin, options, setOrigin } = useJoinOrigin();
  const url = `${origin}/?pin=${state.pin}`;
  const strip = o => o.replace(/^https?:\/\//, '');

  const kick = p => {
    if (window.confirm(`Retirer ${p.name} de la partie ?`)) act('host:kick', { playerId: p.id });
  };

  return (
    <div className="lobby">
      <section className="join-card">
        <div className="join-info">
          <span className="join-label">Rejoins sur</span>
          {options.length > 1 ? (
            <select className="join-url join-select" value={origin} onChange={e => setOrigin(e.target.value)} title="Adresse réseau">
              {options.map(o => (
                <option key={o} value={o}>
                  {strip(o)}
                </option>
              ))}
            </select>
          ) : (
            <strong className="join-url">{strip(origin)}</strong>
          )}
          <span className="pin-sticker">Code PIN</span>
          <div className="pin">{formatPin(state.pin)}</div>
        </div>
        <div className="qr">
          <QRCodeSVG value={url} size={170} marginSize={2} />
        </div>
      </section>

      <section className="lobby-bar">
        <div className="count">
          <strong>{state.playerCount}</strong>
          <span>{state.playerCount > 1 ? 'joueurs' : 'joueur'}</span>
        </div>
        <h2 className="lobby-title">{state.title}</h2>
        <div className="row">
          <button className="btn ghost" onClick={() => act('host:lock', { locked: !state.locked })}>
            {state.locked ? '🔒 Verrouillée' : '🔓 Ouverte'}
          </button>
          <button className="btn primary big" disabled={busy || state.playerCount === 0} onClick={() => act('host:start')}>
            Commencer
          </button>
        </div>
      </section>

      <section className="players">
        {state.players.length === 0 ? (
          <p className="waiting">En attente des joueurs…</p>
        ) : (
          state.players.map((p, i) => (
            <button
              key={p.id}
              className={`chip ${p.connected ? '' : 'off'}`}
              style={{ '--c': CHIP_COLORS[i % CHIP_COLORS.length], '--r': `${((i * 37) % 7) - 3}deg` }}
              title="Cliquer pour retirer"
              onClick={() => kick(p)}
            >
              {p.name}
            </button>
          ))
        )}
      </section>
    </div>
  );
}

function Intro({ state, remaining }) {
  const q = state.question;
  return (
    <div className="intro">
      <div className="intro-num">
        <span>Question</span>
        <strong>{state.index + 1}</strong>
        <span>sur {state.total}</span>
      </div>
      <h1 className="intro-text">{q.text}</h1>
      {q.points === 2000 && <div className="badge-double">Points doublés !</div>}
      {q.points === 0 && <div className="badge-double muted-badge">Sans points</div>}
      <div className="intro-progress">
        <ProgressBar remaining={remaining || 0} duration={state.duration} />
      </div>
    </div>
  );
}

function QuestionHeader({ q }) {
  return (
    <div className="q-head">
      <h1>{q.text}</h1>
    </div>
  );
}

function Question({ state, remaining, act, busy }) {
  const q = state.question;
  return (
    <div className="stage">
      <QuestionHeader q={q} />
      <div className="q-middle">
        <CircleTimer remaining={remaining || 0} duration={state.duration} />
        <div className="media">{q.image ? <img src={q.image} alt="" /> : <Logo />}</div>
        <div className="answered-box">
          <strong>{state.answered}</strong>
          <span>{state.answered > 1 ? 'réponses' : 'réponse'}</span>
          <button className="btn ghost small-btn" disabled={busy} onClick={() => act('host:next')}>
            Passer
          </button>
        </div>
      </div>
      <div className={`answers n${q.answers.length}`}>
        {q.answers.map((a, i) => (
          <AnswerTile key={i} index={i} text={a} />
        ))}
      </div>
    </div>
  );
}

function Reveal({ state, act, busy }) {
  const q = state.question;
  const max = Math.max(1, ...state.distribution);
  return (
    <div className="stage">
      <QuestionHeader q={q} />
      <div className="q-middle reveal-middle">
        <div className="chart">
          {state.distribution.map((n, i) => {
            const good = state.correct.includes(i);
            return (
              <div key={i} className={`chart-col ${good ? 'good' : 'bad'}`} style={{ '--c': ANSWER_STYLES[i].color }}>
                <span className="chart-n">{n}</span>
                <div className="chart-bar" style={{ height: `${(n / max) * 100}%` }} />
                <div className="chart-foot">
                  <Shape index={i} size={22} />
                  {good && <Check size={22} />}
                </div>
              </div>
            );
          })}
        </div>
      </div>
      <div className={`answers n${q.answers.length}`}>
        {q.answers.map((a, i) => (
          <AnswerTile key={i} index={i} text={a} state={state.correct.includes(i) ? 'correct' : 'dim'} />
        ))}
      </div>
      <NextButton act={act} busy={busy} label={state.index + 1 >= state.total ? 'Voir le podium' : 'Suivant'} />
    </div>
  );
}

function Scoreboard({ state, act, busy }) {
  return (
    <div className="scoreboard">
      <h1 className="section-title">Classement</h1>
      <ol className="board">
        {state.leaderboard.map(p => (
          <li key={p.id}>
            <span className="board-rank">{p.rank}</span>
            <span className="board-name">{p.name}</span>
            {p.points > 0 && <span className="board-delta">+{p.points}</span>}
            <span className="board-score">{p.score}</span>
          </li>
        ))}
      </ol>
      {state.leaderboard.length === 0 && <p className="waiting">Aucun joueur</p>}
      <NextButton act={act} busy={busy} label="Question suivante" />
    </div>
  );
}

function NextButton({ act, busy, label }) {
  return (
    <div className="next-wrap">
      <button className="btn primary big" disabled={busy} onClick={() => act('host:next')}>
        {label} →
      </button>
    </div>
  );
}

function exportCsv(state) {
  const esc = v => `"${String(v).replace(/"/g, '""')}"`;
  const head = ['Rang', 'Pseudo', 'Score', 'Bonnes réponses', ...Array.from({ length: state.total }, (_, i) => `Q${i + 1}`)];
  const rows = state.results.map(r => [
    r.rank,
    r.name,
    r.score,
    `${r.correctCount}/${state.total}`,
    ...r.history.map(h => (!h ? '-' : h.correct ? `Correct (+${h.points})` : h.choice === null ? 'Sans réponse' : 'Faux')),
  ]);
  const csv = [head, ...rows].map(row => row.map(esc).join(';')).join('\r\n');
  download(`resultats-${slug(state.title)}.csv`, '\ufeff' + csv, 'text/csv;charset=utf-8');
}

function Podium({ state, quit }) {
  const top = state.results.slice(0, 3);
  const order = [top[1], top[0], top[2]];
  const places = [2, 1, 3];
  return (
    <div className="podium-screen">
      <Confetti count={70} />
      <h1 className="section-title">{state.title}</h1>
      <div className="podium">
        {order.map((p, i) =>
          p ? (
            <div key={p.id} className={`podium-col place-${places[i]}`}>
              <div className="podium-name">{p.name}</div>
              <div className="podium-block">
                <span className="podium-medal">{['🥈', '🥇', '🥉'][i]}</span>
                <strong>{p.score}</strong>
                <span className="small">
                  {p.correctCount}/{state.total} bonnes
                </span>
              </div>
            </div>
          ) : (
            <div key={`empty-${i}`} className="podium-col empty" />
          ),
        )}
      </div>
      {state.results.length > 0 && (
        <details className="results">
          <summary>Résultats complets ({plural(state.results.length, 'joueur')})</summary>
          <table>
            <thead>
              <tr>
                <th>Rang</th>
                <th>Pseudo</th>
                <th>Bonnes réponses</th>
                <th>Score</th>
              </tr>
            </thead>
            <tbody>
              {state.results.map(r => (
                <tr key={r.id}>
                  <td>{ordinal(r.rank)}</td>
                  <td>{r.name}</td>
                  <td>
                    {r.correctCount}/{state.total}
                  </td>
                  <td>{r.score}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      )}
      <div className="row center-row">
        <button className="btn ghost" onClick={() => exportCsv(state)} disabled={!state.results.length}>
          Exporter les résultats (CSV)
        </button>
        <button className="btn primary" onClick={quit}>
          Terminer
        </button>
      </div>
    </div>
  );
}
