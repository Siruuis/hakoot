export async function api(path, options = {}) {
  let res;
  try {
    res = await fetch(`/api${path}`, {
      ...options,
      headers: { 'content-type': 'application/json', ...(options.headers || {}) },
    });
  } catch {
    return { ok: false, status: 0, error: 'Serveur injoignable' };
  }
  if (res.status === 204) return { ok: true, status: 204 };
  const data = await res.json().catch(() => ({}));
  return res.ok ? { ok: true, status: res.status, ...data } : { ok: false, status: res.status, error: data.error || `Erreur ${res.status}` };
}
