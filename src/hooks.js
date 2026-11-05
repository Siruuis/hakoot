import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { socket, call } from './socket.js';
import { getSession, setSession, clearSession } from './session.js';
import { validateQuiz } from '../shared/quiz.js';

export function useGame(role) {
  const [state, setState] = useState(null);
  const [ended, setEnded] = useState(() => {
    const s = getSession();
    return s && s.role === role ? null : 'Aucune partie en cours';
  });
  const [connected, setConnected] = useState(socket.connected);

  useEffect(() => {
    const session = getSession();
    if (!session || session.role !== role) return;
    let active = true;

    const finish = reason => {
      if (!active) return;
      clearSession();
      setEnded(reason || 'La partie est terminée');
    };
    const onState = s => {
      if (active) setState({ ...s, receivedAt: Date.now() });
    };
    const onEnded = data => finish(data && data.reason);
    const onKicked = () => finish("L'hôte t'a retiré de la partie");
    const rejoin = async () => {
      const res = await call(`${role}:rejoin`, { pin: session.pin, token: session.token });
      if (res.error && !res.timeout) finish(res.error);
    };
    const onConnect = () => {
      setConnected(true);
      rejoin();
    };
    const onDisconnect = () => setConnected(false);

    socket.on(`${role}:state`, onState);
    socket.on('game:ended', onEnded);
    socket.on('kicked', onKicked);
    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    if (socket.connected) rejoin();

    return () => {
      active = false;
      socket.off(`${role}:state`, onState);
      socket.off('game:ended', onEnded);
      socket.off('kicked', onKicked);
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
    };
  }, [role]);

  return { state, ended, connected };
}

export function useRemaining(state) {
  const hasTimer = !!state && typeof state.remaining === 'number';
  const end = hasTimer ? state.receivedAt + state.remaining : null;
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (end === null) return;
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 100);
    return () => clearInterval(id);
  }, [end]);

  if (!hasTimer) return null;
  return Math.max(0, Math.min(state.remaining, end - now));
}

export function useLaunch() {
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);

  const launch = async quiz => {
    const { errors, quiz: clean } = validateQuiz(quiz);
    if (errors.length) return errors[0];
    setBusy(true);
    const res = await call('host:create', { quiz: clean });
    setBusy(false);
    if (res.error) return res.error;
    setSession({ role: 'host', pin: res.pin, token: res.token });
    navigate('/host');
    return null;
  };

  return { launch, busy };
}

const ORIGIN_KEY = 'hakoot:origin';

export function useJoinOrigin() {
  const [options, setOptions] = useState([window.location.origin]);
  const [origin, setOriginState] = useState(window.location.origin);

  useEffect(() => {
    const local = ['localhost', '127.0.0.1', '[::1]'].includes(window.location.hostname);
    if (!local) return;
    let active = true;
    fetch('/api/network')
      .then(r => r.json())
      .then(d => {
        if (!active || !d || !Array.isArray(d.addresses) || !d.addresses.length) return;
        const port = window.location.port ? `:${window.location.port}` : '';
        const list = d.addresses.map(ip => `${window.location.protocol}//${ip}${port}`);
        const saved = localStorage.getItem(ORIGIN_KEY);
        setOptions(list);
        setOriginState(list.includes(saved) ? saved : list[0]);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  const setOrigin = value => {
    localStorage.setItem(ORIGIN_KEY, value);
    setOriginState(value);
  };

  return { origin, options, setOrigin };
}
