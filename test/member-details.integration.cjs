/* eslint-disable @typescript-eslint/no-require-imports -- standalone local integration check */
// Requires a dedicated local MySQL and a production build. No .env or external email delivery.
const assert = require('node:assert/strict');
const { randomBytes } = require('node:crypto');
const { existsSync } = require('node:fs');
const path = require('node:path');
const mysql = require('mysql2/promise');
const { DataSource } = require('typeorm');
const { Test } = require('@nestjs/testing');
const { ValidationPipe } = require('@nestjs/common');

async function main() {
  assert.equal(existsSync('.env') || existsSync('.env.local'), false, 'use an isolated checkout without environment files');
  const port = Number(process.env.CONTACT_TEST_DB_PORT);
  assert.ok(Number.isInteger(port) && port > 0 && port <= 65535, 'set CONTACT_TEST_DB_PORT for a dedicated local MySQL');
  const admin = await mysql.createConnection({ host: '127.0.0.1', port, user: 'root', password: '' });
  const suffix = Date.now() + '_' + randomBytes(4).toString('hex');
  const database = 'gachimura_member_check_' + suffix;
  const username = 'member_' + randomBytes(8).toString('hex');
  let created = false;
  let userCreated = false;
  let source;
  let app;
  const nodemailer = require('nodemailer');
  const originalTransport = nodemailer.createTransport;
  const messages = [];
  try {
    await admin.query('CREATE DATABASE `' + database + '` CHARACTER SET utf8mb4');
    created = true;
    const password = randomBytes(24).toString('hex');
    await admin.query("CREATE USER ?@'%' IDENTIFIED BY ?", [username, password]);
    userCreated = true;
    await admin.query('GRANT ALL PRIVILEGES ON `' + database + "`.* TO ?@'%'", [username]);
    Object.assign(process.env, {
      NODE_ENV: 'test', DB_HOST: '127.0.0.1', DB_PORT: String(port), DB_USERNAME: username,
      DB_PASSWORD: password, DB_NAME: database, DB_DATABASE: database,
      DB_SYNCHRONIZE: 'false', DB_MIGRATIONS_RUN: 'false', JWT_SECRET: randomBytes(48).toString('hex'),
      EMAIL_VERIFICATION_REQUIRED: 'true', SMTP_HOST: 'capture.invalid', SMTP_PORT: '587',
      SMTP_USER: 'capture-only', SMTP_PASS: 'capture-only', SMTP_FROM: 'no-reply@example.test',
      PASSWORD_RESET_URL: 'http://localhost:3121/reset-password',
      WEB_PUSH_PUBLIC_KEY: '', WEB_PUSH_PRIVATE_KEY: '',
      GOOGLE_VISION_CREDENTIALS_BASE64: '', GOOGLE_APPLICATION_CREDENTIALS: '',
    });
    nodemailer.createTransport = () => ({ sendMail: async message => { messages.push(message); return {}; } });
    const { Schema1788318104441 } = require('../dist/database/migrations/1788318104441-Schema');
    const { PasswordReset1790100000000 } = require('../dist/database/migrations/1790100000000-PasswordReset');
    const { PushSubscriptions1793750400000 } = require('../dist/database/migrations/1793750400000-PushSubscriptions');
    source = new DataSource({
      type: 'mysql', host: '127.0.0.1', port, username, password, database, synchronize: false,
      entities: [path.resolve('dist/**/*.entity.js')],
      migrations: [Schema1788318104441, PasswordReset1790100000000, PushSubscriptions1793750400000],
    });
    await source.initialize();
    assert.equal((await source.runMigrations()).length, 3);
    assert.equal((await source.driver.createSchemaBuilder().log()).upQueries.length, 0);
    const { AppModule } = require('../dist/app.module');
    const fixture = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = fixture.createNestApplication({ logger: false });
    app.setGlobalPrefix('api');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.listen(0, '127.0.0.1');
    const base = await app.getUrl();
    const request = (method, route, body, cookie) => fetch(base + '/api' + route, {
      method, headers: { 'Content-Type': 'application/json', ...(cookie ? { cookie } : {}) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const verifyEmail = async email => {
      assert.equal((await request('POST', '/auth/email-verification/send', { email })).status, 201);
      const message = messages.findLast(entry => entry.to === email);
      assert.ok(message, 'verification email captured locally');
      const code = message.text.match(/\b\d{6}\b/)?.[0];
      assert.ok(code, 'verification message contains a code');
      const result = await request('POST', '/auth/email-verification/verify', { email, code });
      assert.equal(result.status, 201);
      return (await result.json()).emailVerificationToken;
    };
    const email = 'member-' + suffix + '@example.net';
    const details = { email, password: 'Oldpass123', nickname: 'Member fixture', phone: '010 1234-5678', birthdate: '1998-01-02' };
    assert.equal((await request('POST', '/auth/signup', details)).status, 400, 'email verification remains required');
    const emailVerificationToken = await verifyEmail(email);
    assert.equal((await request('POST', '/auth/signup', { ...details, emailVerificationToken })).status, 201);
    const login = await request('POST', '/auth/login', { email, password: details.password });
    assert.equal(login.status, 201);
    const cookie = login.headers.getSetCookie().map(value => value.split(';')[0]).join('; ');
    const profile = () => request('GET', '/users/profile', undefined, cookie).then(value => value.json());
    const own = await profile();
    const id = own.id;
    assert.ok(Number.isInteger(id), 'authenticated profile identifies the new member');
    assert.equal(own.phone, '01012345678');
    assert.equal(own.birthdate, '1998-01-02');
    const stored = (await source.query('SELECT phone_number, DATE_FORMAT(birth_date, \'%Y-%m-%d\') AS birthday FROM users WHERE id=?', [id]))[0];
    assert.equal(stored.phone_number, own.phone);
    assert.equal(stored.birthday, own.birthdate);
    const publicProfile = await request('GET', '/users/' + id).then(value => value.json());
    for (const name of ['phone', 'phoneNumber', 'birthdate', 'birthDate', 'email']) {
      assert.equal(Object.hasOwn(publicProfile, name), false, 'private member fields stay absent from public profile');
    }
    assert.equal((await request('GET', '/users/profile')).status, 401);
    assert.equal((await request('PATCH', '/users/profile', { phone: '09012345678' })).status, 401);
    await source.query('UPDATE users SET bank_name=?, account_number=? WHERE id=?', ['Fixture Bank', 'FIXTURE_ONLY', id]);
    assert.equal((await request('PATCH', '/users/profile', { phone: '090-1234-5678' }, cookie)).status, 200);
    let updated = await profile();
    assert.equal(updated.phone, '09012345678');
    assert.equal(updated.birthdate, own.birthdate, 'omitted birthdate is preserved');
    assert.equal(updated.bankName, 'Fixture Bank');
    assert.equal(updated.accountNumber, 'FIXTURE_ONLY', 'contact changes preserve the bank account');
    for (const invalid of [{ phone: '010abc12345' }, { phone: '1234' }, { birthdate: '2023-02-29' }, { birthdate: '2099-01-01' }]) {
      assert.equal((await request('PATCH', '/users/profile', invalid, cookie)).status, 400, 'malformed or future member details are rejected');
    }
    assert.equal((await profile()).phone, '09012345678', 'invalid requests cannot change saved data');
    assert.equal((await request('PATCH', '/users/profile', { phone: null, birthdate: null }, cookie)).status, 200);
    updated = await profile();
    assert.equal(updated.phone, null);
    assert.equal(updated.birthdate, null);
    assert.equal((await request('PATCH', '/users/profile', { phone: '010-9999-8888', birthdate: '2000-02-29' }, cookie)).status, 200);
    const legacyEmail = 'legacy-' + suffix + '@example.net';
    const legacyToken = await verifyEmail(legacyEmail);
    assert.equal((await request('POST', '/auth/signup', {
      ...details, email: legacyEmail, phone: '09012345678', birthdate: '980101', emailVerificationToken: legacyToken,
    })).status, 201, 'previous YYMMDD signup format remains supported');
    const legacyDate = (await source.query('SELECT DATE_FORMAT(birth_date, \'%Y-%m-%d\') AS birthday FROM users WHERE email=?', [legacyEmail]))[0];
    assert.equal(legacyDate.birthday, '1998-01-01');
    assert.equal((await request('POST', '/auth/password-reset/request', { email })).status, 201);
    const reset = messages.findLast(entry => entry.to === email);
    const resetToken = reset.text.match(/#([a-f0-9]{64})/)?.[1];
    assert.ok(resetToken, 'reset mail captured locally');
    assert.equal((await request('POST', '/auth/password-reset/confirm', { token: resetToken, password: 'Newpass123' })).status, 201);
    assert.equal((await request('POST', '/auth/password-reset/confirm', { token: resetToken, password: 'Again123' })).status, 400);
    assert.equal((await request('POST', '/auth/login', { email, password: details.password })).status, 401);
    const relogin = await request('POST', '/auth/login', { email, password: 'Newpass123' });
    assert.equal(relogin.status, 201);
    const nextCookie = relogin.headers.getSetCookie().map(value => value.split(';')[0]).join('; ');
    const afterReset = await request('GET', '/users/profile', undefined, nextCookie).then(value => value.json());
    assert.equal(afterReset.phone, '01099998888');
    assert.equal(afterReset.birthdate, '2000-02-29');
    assert.equal(afterReset.accountNumber, 'FIXTURE_ONLY');
    console.log('PASS: verified signup, phone/date SQL persistence, private-only profile, partial update/clear, invalid input rejection, legacy signup, reset replay rejection and new-password login. Email delivery captured locally; no SES or external mailbox contacted.');
  } finally {
    nodemailer.createTransport = originalTransport;
    await app?.close();
    if (source?.isInitialized) await source.destroy();
    if (created) await admin.query('DROP DATABASE `' + database + '`');
    if (userCreated) await admin.query("DROP USER ?@'%'", [username]);
    await admin.end();
  }
}

main().catch(error => { console.error(error.message); process.exitCode = 1; });
