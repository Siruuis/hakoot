import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { call } from '../socket.js';
import { setSession } from '../session.js';
import { Backdrop, Logo } from '../components/ui.jsx';

export default function Home() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const initialPin = (params.get('pin') || '').replace(/\D/g, '').slice(0, 6);
  const [pin, setPin] = useState(initialPin);
  const [step, setStep] = useState('pin');
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const autoChecked = useRef(false);

  const checkPin = async value => {
    if (value.length !== 6) return setError('Le code PIN contient 6 chiffres');
    setBusy(true);
    setError('');
    const res = await call('game:check', { pin: value });
    setBusy(false);
    if (res.error) return setError(res.error);
    setStep('name');
  };

  useEffect(() => {
    if (autoChecked.current || initialPin.length !== 6) return;
    autoChecked.current = true;
    checkPin(initialPin);
  }, []);

  const submitPin = e => {
    e.preventDefault();
    if (!busy) checkPin(pin);
  };

  const submitName = async e => {
    e.preventDefault();
    if (busy) return;
    const n = name.trim();
    if (!n) return setError('Choisis un pseudo');
    setBusy(true);
    setError('');
    const res = await call('player:join', { pin, name: n });
    setBusy(false);
    if (res.error) return setError(res.error);
    setSession({ role: 'player', pin: res.pin, token: res.token });
    navigate('/play');
  };

  return (
    <div className="screen center home">
      <Backdrop />
      <div className="hero">
        <Logo />
        <p className="tagline">Le quiz qui fait du bruit.</p>
      </div>
      {step === 'pin' ? (
        <form className="card narrow" onSubmit={submitPin}>
          <input
            className="big-input"
            inputMode="numeric"
            autoComplete="off"
            placeholder="Code PIN"
            value={pin}
            maxLength={7}
            onChange={e => {
              setPin(e.target.value.replace(/\D/g, '').slice(0, 6));
              setError('');
            }}
            autoFocus
          />
          <button className="btn dark block big" disabled={busy}>
            {busy ? '…' : 'Entrer'}
          </button>
          {error && <p className="error">{error}</p>}
        </form>
      ) : (
        <form className="card narrow" onSubmit={submitName}>
          <input
            className="big-input"
            autoComplete="off"
            autoCapitalize="off"
            spellCheck={false}
            placeholder="Pseudo"
            value={name}
            maxLength={15}
            onChange={e => {
              setName(e.target.value);
              setError('');
            }}
            autoFocus
          />
          <button className="btn dark block big" disabled={busy}>
            {busy ? '…' : "C'est parti !"}
          </button>
          {error && <p className="error">{error}</p>}
          <button
            type="button"
            className="link"
            onClick={() => {
              setStep('pin');
              setError('');
            }}
          >
            Changer de code PIN
          </button>
        </form>
      )}
      <Link to="/create" className="home-footer">
        Créer ou animer un quiz →
      </Link>
    </div>
  );
}
