let token = localStorage.getItem('token');
export const setToken = (t) => { token = t; t ? localStorage.setItem('token', t) : localStorage.removeItem('token'); };
export async function api(path, { method = 'GET', body } = {}) {
  const r = await fetch('/api' + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token && { Authorization: 'Bearer ' + token }) },
    body: body && JSON.stringify(body),
  });
  if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || r.status);
  return r.status === 204 ? null : r.json();
}
