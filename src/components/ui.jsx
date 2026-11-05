import { useMemo } from 'react';
import { Link } from 'react-router-dom';

export const ANSWER_STYLES = [
  { name: 'Étoile', color: '#ff5a36', path: 'M12 2.5l2.9 6.3 6.9.7-5.2 4.6 1.5 6.8L12 17.4l-6.1 3.5 1.5-6.8-5.2-4.6 6.9-.7z' },
  { name: 'Lune', color: '#2f6bff', path: 'M20.5 14.6A8.6 8.6 0 1 1 9.4 3.5a7 7 0 0 0 11.1 11.1z' },
  { name: 'Éclair', color: '#14c38e', path: 'M13.5 2L4.5 13.5h6.5L9.8 22l9.7-12h-6.6z' },
  { name: 'Cœur', color: '#ff4fa3', path: 'M12 20.8C5.2 16 2.2 12.6 2.2 8.7 2.2 5.7 4.6 3.3 7.6 3.3c1.8 0 3.4.9 4.4 2.3 1-1.4 2.6-2.3 4.4-2.3 3 0 5.4 2.4 5.4 5.4 0 3.9-3 7.3-9.8 12.1z' },
];

export const CHIP_COLORS = ['#ff5a36', '#2f6bff', '#14c38e', '#ff4fa3', '#8b5cf6', '#00b8d9'];
const CONFETTI_COLORS = [...CHIP_COLORS, '#ffd23f', '#fff7e6'];

export function Shape({ index, size = 28 }) {
  const s = ANSWER_STYLES[index];
  return (
    <svg className="shape" width={size} height={size} viewBox="-1 -1 26 26" aria-label={s.name}>
      <path d={s.path} fill="currentColor" />
    </svg>
  );
}

export function Check({ size = 28 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className="check">
      <path d="M4 12.5l5 5L20 6.5" fill="none" stroke="currentColor" strokeWidth="3.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function Cross({ size = 28 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className="check">
      <path d="M6 6l12 12M18 6L6 18" fill="none" stroke="currentColor" strokeWidth="3.6" strokeLinecap="round" />
    </svg>
  );
}

export function AnswerTile({ index, text, state = '', onClick, disabled }) {
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag
      type={onClick ? 'button' : undefined}
      className={`answer ${state}`}
      style={{ '--c': ANSWER_STYLES[index].color }}
      onClick={onClick}
      disabled={onClick ? disabled : undefined}
    >
      <span className="answer-icon">
        <Shape index={index} size={34} />
      </span>
      <span className="answer-text">{text}</span>
      {state === 'correct' && (
        <span className="answer-mark">
          <Check size={26} />
        </span>
      )}
      {state === 'wrong' && (
        <span className="answer-mark">
          <Cross size={26} />
        </span>
      )}
    </Tag>
  );
}

export function CircleTimer({ remaining, duration }) {
  const ratio = duration ? remaining / duration : 0;
  const r = 42;
  const c = 2 * Math.PI * r;
  return (
    <div className={`circle-timer ${remaining <= 5000 ? 'urgent' : ''}`}>
      <svg viewBox="0 0 100 100">
        <circle cx="50" cy="50" r={r} className="track" />
        <circle cx="50" cy="50" r={r} className="bar" strokeDasharray={c} strokeDashoffset={c * (1 - ratio)} />
      </svg>
      <span key={Math.ceil(remaining / 1000)}>{Math.ceil(remaining / 1000)}</span>
    </div>
  );
}

export function ProgressBar({ remaining, duration }) {
  const ratio = duration ? Math.max(0, Math.min(1, remaining / duration)) : 0;
  return (
    <div className="progress">
      <div style={{ width: `${ratio * 100}%` }} />
    </div>
  );
}

export function Logo({ small }) {
  return (
    <div className={`logo ${small ? 'small' : ''}`} aria-label="Hakoot!">
      {'HAKOOT!'.split('').map((ch, i) => (
        <span key={i} style={{ '--i': i }}>
          {ch}
        </span>
      ))}
    </div>
  );
}

export function Backdrop() {
  return (
    <div className="backdrop" aria-hidden="true">
      {ANSWER_STYLES.map((s, i) => (
        <svg key={i} className={`float f${i}`} viewBox="-2 -2 28 28">
          <path d={s.path} fill={s.color} stroke="#111" strokeWidth="1.4" strokeLinejoin="round" />
        </svg>
      ))}
    </div>
  );
}

export function Confetti({ count = 90 }) {
  const pieces = useMemo(
    () =>
      Array.from({ length: count }, (_, i) => ({
        left: Math.random() * 100,
        delay: Math.random() * 2.5,
        duration: 2.8 + Math.random() * 2.8,
        color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
        rot: Math.random() * 360,
        drift: (Math.random() - 0.5) * 240,
        size: 10 + Math.random() * 10,
      })),
    [count],
  );
  return (
    <div className="confetti" aria-hidden="true">
      {pieces.map((p, i) => (
        <i
          key={i}
          style={{
            left: `${p.left}%`,
            width: p.size,
            height: p.size * 0.5,
            background: p.color,
            animationDelay: `${p.delay}s`,
            animationDuration: `${p.duration}s`,
            '--rot': `${p.rot}deg`,
            '--drift': `${p.drift}px`,
          }}
        />
      ))}
    </div>
  );
}

export function Ended({ message, to, label }) {
  return (
    <div className="screen center">
      <Backdrop />
      <Logo />
      <div className="card narrow">
        <h2 className="card-title">Partie terminée</h2>
        <p className="muted">{message}</p>
        <Link className="btn primary block big" to={to}>
          {label}
        </Link>
      </div>
    </div>
  );
}

export function Loading({ text = 'Connexion…' }) {
  return (
    <div className="screen center">
      <Backdrop />
      <div className="spinner" />
      <p className="loading-text">{text}</p>
    </div>
  );
}

export function Offline({ connected }) {
  if (connected) return null;
  return <div className="offline">Connexion perdue, reconnexion…</div>;
}
