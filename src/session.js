const KEY = 'hakoot:session';

export function getSession() {
  try {
    const s = JSON.parse(sessionStorage.getItem(KEY));
    return s && s.pin && s.token && s.role ? s : null;
  } catch {
    return null;
  }
}

export const setSession = s => sessionStorage.setItem(KEY, JSON.stringify(s));
export const clearSession = () => sessionStorage.removeItem(KEY);
