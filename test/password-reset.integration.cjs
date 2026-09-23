/* eslint-disable @typescript-eslint/no-require-imports -- standalone integration check */
// Requires local MySQL and Mailpit (SMTP 1026, HTTP 8026). Never connects to a remote DB.
require('ts-node/register');
require('tsconfig-paths/register');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const path = require('node:path');
const mysql = require('mysql2/promise');
const bcrypt = require('bcrypt');
require('dotenv').config({ path: process.env.AUTH_TEST_ENV_FILE || '.env', quiet: true });

async function main() {
  assert.ok(['localhost', '127.0.0.1'].includes(process.env.DB_HOST || 'localhost'), 'local DB only');
  const database = `gachimura_auth_check_${Date.now()}`;
  const connection = await mysql.createConnection({ host: '127.0.0.1', port: Number(process.env.DB_PORT || 3307), user: process.env.DB_USERNAME || 'root', password: process.env.DB_PASSWORD });
  let app;
  let source;
  let created = false;
  try {
    await connection.query(`CREATE DATABASE \`${database}\` CHARACTER SET utf8mb4`);
    created = true;
    Object.assign(process.env, { NODE_ENV: 'test', DB_HOST: '127.0.0.1', DB_NAME: database, DB_DATABASE: database, JWT_SECRET: crypto.randomBytes(48).toString('hex'), SMTP_HOST: '127.0.0.1', SMTP_PORT: '1026', SMTP_FROM: 'test@gachimura.local', SMTP_USER: '', SMTP_PASS: '', PASSWORD_RESET_URL: 'http://localhost:3102/reset-password' });
    const { DataSource } = require('typeorm');
    const { Schema1788318104441 } = require(process.env.BASELINE_MIGRATION_PATH || '../src/database/migrations/1788318104441-Schema');
    const { PasswordReset1790100000000 } = require('../src/database/migrations/1790100000000-PasswordReset');
    source = new DataSource({ type: 'mysql', host: '127.0.0.1', port: Number(process.env.DB_PORT || 3307), username: process.env.DB_USERNAME || 'root', password: process.env.DB_PASSWORD, database, entities: [path.resolve('src/**/*.entity.ts')], migrations: [Schema1788318104441, PasswordReset1790100000000] });
    await source.initialize();
    assert.equal((await source.runMigrations()).length, 2);
    assert.equal((await source.runMigrations()).length, 0, 'migrations are recorded');
    const diff = await source.driver.createSchemaBuilder().log();
    assert.equal(diff.upQueries.length, 0, 'migrations must match current entities');
    const email = `reset-${Date.now()}@example.com`;
    await connection.query(`INSERT INTO \`${database}\`.users (email,password,nickname,provider) VALUES (?,?,?,'LOCAL')`, [email, await bcrypt.hash('Oldpass123', 12), 'Reset test']);
    const { NestFactory } = require('@nestjs/core');
    const { ValidationPipe } = require('@nestjs/common');
    const { AppModule } = require('../src/app.module');
    app = await NestFactory.create(AppModule, { logger: false });
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    app.setGlobalPrefix('api');
    await app.listen(0, '127.0.0.1');
    const base = await app.getUrl();
    const post = (url, body, cookie) => fetch(`${base}/api/auth/${url}`, { method: 'POST', headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) }, body: JSON.stringify(body) });
    const login = await post('login', { email, password: 'Oldpass123' });
    assert.equal(login.status, 201);
    const cookie = login.headers.getSetCookie().map(value => value.split(';')[0]).join('; ');
    const request = await post('password-reset/request', { email });
    assert.equal(request.status, 201);
    const body = await request.json();
    assert.equal('token' in body, false);
    const mailbox = await fetch('http://127.0.0.1:8026/api/v1/messages').then(r => r.json());
    const mail = mailbox.messages.find(message => message.To.some(to => to.Address === email));
    assert.ok(mail, 'SMTP message delivered to local Mailpit');
    const content = await fetch(`http://127.0.0.1:8026/api/v1/message/${mail.ID}`).then(r => r.json());
    const token = content.Text.match(/#([a-f0-9]{64})/)[1];
    const unknown = await post('password-reset/request', { email: 'unknown@example.com' });
    assert.deepEqual(await unknown.json(), body, 'do not disclose account existence');
    assert.equal((await post('password-reset/confirm', { token, password: 'Newpass123' })).status, 201);
    assert.equal((await post('password-reset/confirm', { token, password: 'Again123' })).status, 400);
    assert.equal((await post('login', { email, password: 'Oldpass123' })).status, 401);
    assert.equal((await post('login', { email, password: 'Newpass123' })).status, 201);
    assert.equal((await post('refresh', {}, cookie)).status, 401, 'old refresh token revoked');
    const expired = crypto.randomBytes(32).toString('hex');
    await connection.query(`UPDATE \`${database}\`.users SET password_reset_hash=?,password_reset_expires_at=DATE_SUB(NOW(), INTERVAL 1 MINUTE) WHERE email=?`, [crypto.createHash('sha256').update(expired).digest('hex'), email]);
    assert.equal((await post('password-reset/confirm', { token: expired, password: 'Again123' })).status, 400);
    assert.equal((await post('password-reset/confirm', { token: 'bad', password: 'x' })).status, 400);
    console.log('PASS: migration alignment, SMTP, reset, replay/expiry rejection, login and refresh revocation');
  } finally {
    if (app) await app.close();
    if (source?.isInitialized) await source.destroy();
    if (created) await connection.query(`DROP DATABASE \`${database}\``);
    await connection.end();
  }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
