// Explicit local-only fixture. Does not run the destructive demo seed.
const assert = require('node:assert/strict');
const mysql = require('mysql2/promise');
const bcrypt = require('bcrypt');
require('dotenv').config({ path: '.env.local', quiet: true });
require('dotenv').config({ path: '.env', quiet: true });

async function main() {
  assert.notEqual(process.env.NODE_ENV, 'production', 'production is forbidden');
  assert.ok(['localhost', '127.0.0.1'].includes(process.env.DB_HOST || 'localhost'), 'local DB only');
  const database = process.env.DB_NAME || process.env.DB_DATABASE || 'gachimura';
  assert.equal(database, 'gachimura', 'only the local gachimura database is allowed');
  const email = process.env.DEV_ACCOUNT_EMAIL || 'admin@gmail.com';
  const password = process.env.DEV_ACCOUNT_PASSWORD;
  assert.ok(password && password.length >= 6 && Buffer.byteLength(password) <= 72, 'DEV_ACCOUNT_PASSWORD (6-72 bytes) is required');
  const connection = await mysql.createConnection({ host: '127.0.0.1', port: Number(process.env.DB_PORT || 3307), user: process.env.DB_USERNAME || 'root', password: process.env.DB_PASSWORD, database });
  try {
    const [existing] = await connection.execute('SELECT id,password FROM users WHERE email=?', [email]);
    if (existing.length) {
      assert.ok(existing[0].password && await bcrypt.compare(password, existing[0].password), 'account already exists with a different password; nothing changed');
      console.log('Local login account already exists and password check passed. No changes.');
      return;
    }
    const hash = await bcrypt.hash(password, 12);
    await connection.execute("INSERT INTO users (email,password,nickname,nickname_jp,provider) VALUES (?,?,?,?,'LOCAL')", [email, hash, '개발 테스트', '開発テスト']);
    const [saved] = await connection.execute('SELECT password FROM users WHERE email=?', [email]);
    assert.ok(await bcrypt.compare(password, saved[0].password));
    console.log('Created local login account; hashed password verified. No administrator privileges.');
  } finally { await connection.end(); }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
