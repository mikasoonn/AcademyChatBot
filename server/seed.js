import bcrypt from 'bcryptjs';
import { pool, q } from './db.js';

if ((await q('SELECT 1 FROM users LIMIT 1')).rowCount) {
  console.log('already seeded');
  await pool.end();
  process.exit(0);
}

const seedPassword = process.env.SEED_PASSWORD;

if (!seedPassword) {
  throw new Error('SEED_PASSWORD environment variable is required');
}

const hash = bcrypt.hashSync(seedPassword, 10);

for (const [name, email, role] of [
  ['Anna Petrosyan', 'student@academy.am', 'student'],
  ['Davit Grigoryan', 'staff@academy.am', 'staff'],
  ['Sona M.', 'admin@academy.am', 'admin']
]) {
  await q(
    'INSERT INTO users (name,email,password_hash,role) VALUES ($1,$2,$3,$4)',
    [name, email, hash, role]
  );
}

// Knowledge base is filled from the real website: npm run kb:import
await q(
  "INSERT INTO support_requests (from_name,topic) VALUES ('Anna Petrosyan (student)','Payment question'),('Guest (applicant)','Unclear course info')"
);

console.log('seeded');
await pool.end();
