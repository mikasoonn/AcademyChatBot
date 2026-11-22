let token = localStorage.getItem('token');

export const setToken = (t) => {
  token = t;
  t ? localStorage.setItem('token', t) : localStorage.removeItem('token');
};

const API_URL = import.meta.env.VITE_API_URL || '';

export async function api(path, { method = 'GET', body } = {}) {
  const r = await fetch(API_URL + '/api' + path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token && { Authorization: 'Bearer ' + token }),
    },
    body: body && JSON.stringify(body),
  });

  if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || r.status);
  return r.status === 204 ? null : r.json();
}
