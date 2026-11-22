import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { pool } from './db.js';

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), 'migrations');
await pool.query('CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY)');
for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.sql')).sort()) {
  if ((await pool.query('SELECT 1 FROM schema_migrations WHERE name=$1', [f])).rowCount) continue;
  await pool.query(fs.readFileSync(path.join(dir, f), 'utf8'));
  await pool.query('INSERT INTO schema_migrations (name) VALUES ($1)', [f]);
  console.log('applied', f);
}
await pool.end();
