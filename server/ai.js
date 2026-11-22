import { q } from './db.js';
import { rules, buildMessages, selectContext } from './prompt.js';

// AI_PROVIDER: "anthropic" (paid), "gemini" (free tier at aistudio.google.com), or "openai" (any OpenAI-compatible API:
// Groq, OpenRouter, or a local Ollama at http://localhost:11434/v1 - fully free).
const KEY = process.env.AI_API_KEY || process.env.ANTHROPIC_API_KEY || '';
const PROVIDER = process.env.AI_PROVIDER || (process.env.ANTHROPIC_API_KEY ? 'anthropic' : '');
const DEFAULT_MODEL = { anthropic: 'claude-sonnet-5-5', gemini: 'gemini-3.8-flash', openai: 'llama3.1' }[PROVIDER];
const MODEL = process.env.AI_MODEL || process.env.ANTHROPIC_MODEL || DEFAULT_MODEL;
const FALLBACK_MODEL = process.env.AI_FALLBACK_MODEL || '';
const MAX_KB_CHARS = Number(process.env.MAX_KB_CHARS || 16000);
const BASE = (process.env.AI_BASE_URL || 'http://localhost:11434/v1').replace(/\/$/, '');

export const aiEnabled = () => (PROVIDER === 'openai' ? true : Boolean(PROVIDER && KEY));

// retries a few times on temporary provider errors (429 rate limit, 500/503 overloaded)
async function post(url, headers, body) {
  for (let attempt = 1; ; attempt++) {
    const r = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body), signal: AbortSignal.timeout(60000) });
    if (r.ok) return r.json();
    if (![429, 500, 503].includes(r.status) || attempt === 3) throw new Error(`${PROVIDER} ${r.status}: ${(await r.text()).slice(0, 300)}`);
    console.warn(`AI ${r.status}, retrying (${attempt}/2)...`);
    await new Promise((res) => setTimeout(res, 1500 * attempt));
  }
}

async function complete(system, kbText, messages, model) {
  const kbBlock = 'KNOWLEDGE BASE (approved Academy information):\n\n' + kbText;
  if (PROVIDER === 'anthropic') {
    const d = await post('https://api.anthropic.com/v1/messages', { 'x-api-key': KEY, 'anthropic-version': '2023-06-01' }, {
      model, max_tokens: 1200,
      system: [{ type: 'text', text: system }, { type: 'text', text: kbBlock, cache_control: { type: 'ephemeral' } }], messages });
    return d.content.filter((b) => b.type === 'text').map((b) => b.text).join('\n');
  }
  if (PROVIDER === 'gemini') {
    const d = await post(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, { 'x-goog-api-key': KEY }, {
      systemInstruction: { parts: [{ text: system + '\n\n' + kbBlock }] },
      contents: messages.map((m) => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] })),
      generationConfig: { maxOutputTokens: 3000, ...(process.env.AI_THINKING_LEVEL && { thinkingConfig: { thinkingLevel: process.env.AI_THINKING_LEVEL } }) } });
    if (d.candidates?.[0]?.finishReason === 'MAX_TOKENS') console.warn('AI answer was cut at the token limit');
    return (d.candidates?.[0]?.content?.parts || []).map((p) => p.text || '').join('\n');
  }
  const d = await post(`${BASE}/chat/completions`, KEY ? { authorization: 'Bearer ' + KEY } : {}, {
    model, max_tokens: 1200, messages: [{ role: 'system', content: system + '\n\n' + kbBlock }, ...messages] });
  return d.choices?.[0]?.message?.content || '';
}

export async function askAI({ text, lang, conversationId }) {
  const kb = (await q("SELECT name,content FROM kb_sources WHERE status='Approved' AND content<>'' ORDER BY id")).rows;
  const hist = conversationId
    ? (await q('SELECT role,content FROM (SELECT id,role,content FROM messages WHERE conversation_id=$1 ORDER BY id DESC LIMIT 6) t ORDER BY id', [conversationId])).rows : [];
  const ctx = selectContext(kb, text, MAX_KB_CHARS), msgs = buildMessages(hist, text);
  let lastErr;
  for (const m of [MODEL, FALLBACK_MODEL].filter(Boolean)) { // second model is tried if the first keeps failing
    try { const t0 = Date.now(); const out = (await complete(rules(lang), ctx, msgs, m)).trim(); console.log(`AI ${m}: ${Date.now() - t0} ms, context ${ctx.length} chars`); if (out) return out; }
    catch (e) { lastErr = e; console.error(`AI model ${m} failed:`, e.message.slice(0, 200)); }
  }
  const err = new Error(lastErr?.message || 'empty_answer');
  err.transient = /\b(429|500|503)\b/.test(lastErr?.message || '');
  throw err;
}
