// Imports the official Picsart Academy pages into the knowledge base as APPROVED sources.
// Run:  npm run kb:import     (needs internet). Re-run any time the site changes.
import { pool, q } from './db.js';
import { fetchUrlText } from './kb.js';

const B = 'https://picsartacademy.am';
const URLS = [
  B + '/hy', B + '/hy/contact',
  ...['modern-ai-software-developer', 'uxui', 'junior', 'aiappdev', 'ai', 'devhack', 'graphic-design', 'course-for-conscripts-1991', 'atmk-technologies'].map((s) => `${B}/hy/courses/${s}`),
];

// remove the hand-written sample rows from the first seed (they were only placeholders)
await q("DELETE FROM kb_sources WHERE name IN ('Courses 2026 - program overview.pdf','Admission and entry test rules.docx','picsartacademy.am/courses','Payment and discounts FAQ.txt')");

for (const url of URLS) {
  try {
    const { text } = await fetchUrlText(url);
    const topic = url.includes('/courses/') ? 'courses' : 'general';
    const ex = await q('SELECT id FROM kb_sources WHERE name=$1', [url]);
    if (ex.rowCount) await q("UPDATE kb_sources SET content=$1, status='Approved', topic=$2, updated_at=now() WHERE id=$3", [text, topic, ex.rows[0].id]);
    else await q("INSERT INTO kb_sources (name,type,topic,status,content) VALUES ($1,'URL',$2,'Approved',$3)", [url, topic, text]);
    console.log('ok  ', text.length, 'chars', url);
  } catch (e) { console.log('FAIL', url, e.message); }
}
await pool.end();
