// Turns a public web page into plain text for the knowledge base.
const ALLOWED = (process.env.KB_ALLOWED_HOSTS || 'picsartacademy.am,www.picsartacademy.am').split(',').map((s) => s.trim());
const ENT = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'", '&nbsp;': ' ' };

export function htmlToText(html) {
  let t = html.replace(/<(script|style|noscript|svg|header|nav)\b[\s\S]*?<\/\1>/gi, ' ');
  t = t.replace(/<(br|\/p|\/div|\/h[1-6]|\/li|\/tr|\/section)\b[^>]*>/gi, '\n').replace(/<[^>]+>/g, ' ');
  t = t.replace(/&(amp|lt|gt|quot|#39|nbsp);/g, (m) => ENT[m]).replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n));
  return t.split('\n').map((l) => l.replace(/[ \t\u00a0]+/g, ' ').trim()).filter(Boolean).join('\n');
}

export async function fetchUrlText(url) {
  const u = new URL(url);
  if (!['http:', 'https:'].includes(u.protocol) || !ALLOWED.includes(u.hostname)) throw new Error('host_not_allowed'); // admin-only + allow-list
  const r = await fetch(u, { headers: { 'User-Agent': 'AcademyChatbot/1.0' }, signal: AbortSignal.timeout(15000) });
  if (!r.ok) throw new Error('http_' + r.status);
  const html = await r.text();
  const title = ((html.match(/<title>([^<]*)<\/title>/i) || [])[1] || url).trim();
  return { title, text: htmlToText(html).slice(0, 30000) };
}
