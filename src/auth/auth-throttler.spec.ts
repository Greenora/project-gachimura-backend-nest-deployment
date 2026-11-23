import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ThrottlerModule } from '@nestjs/throttler';
import request from 'supertest';
import type { Server } from 'node:http';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { PasswordResetService } from './password-reset.service';
import { authEmailTracker } from './auth-throttler.guard';
import { RequestLimitStorage } from '../common/request-limit.storage';

describe('recipient and shared traffic auth limits', () => {
  let app: INestApplication<Server>;
  const send = jest.fn().mockResolvedValue({ message: 'fixture sent' });

  beforeEach(async () => {
    send.mockClear();
    const fixture = await Test.createTestingModule({
      imports: [
        ThrottlerModule.forRoot({
          storage: new RequestLimitStorage(),
          throttlers: [{ ttl: 60_000, limit: 20 }],
        }),
      ],
      controllers: [AuthController],
      providers: [
        { provide: AuthService, useValue: { sendEmailVerificationCode: send } },
        { provide: PasswordResetService, useValue: {} },
      ],
    }).compile();
    app = fixture.createNestApplication({ logger: false });
    await app.init();
  });

  afterEach(async () => {
    await app?.close();
  });

  const sendMail = (email: unknown) =>
    request(app.getHttpServer())
      .post('/auth/email-verification/send')
      .send({ email });

  it('keeps recipients on the same proxy independent and retains each retry limit', async () => {
    for (let attempt = 0; attempt < 3; attempt++) {
      await sendMail('first@example.test').expect(201);
      await sendMail('second@example.test').expect(201);
    }
    const blocked = await sendMail('first@example.test').expect(429);
    expect(Number(blocked.headers['retry-after'])).toBeGreaterThan(0);
    expect(send).toHaveBeenCalledTimes(6);
  });

  it('does not bypass a recipient limit using case, spaces or forwarded IP headers', async () => {
    await sendMail('first@example.test').expect(201);
    await sendMail(' FIRST@example.test ')
      .set('X-Forwarded-For', '203.0.113.1')
      .expect(201);
    await sendMail('First@EXAMPLE.TEST')
      .set('X-Forwarded-For', '203.0.113.2')
      .expect(201);
    await sendMail('first@example.test')
      .set('X-Forwarded-For', '203.0.113.3')
      .expect(429);
    expect(send).toHaveBeenCalledTimes(3);
  });

  it('still bounds aggregate traffic when the email changes for every request', async () => {
    for (let index = 0; index < 60; index++)
      await sendMail(`fixture-${index}@example.test`).expect(201);
    await sendMail('one-more@example.test')
      .set('X-Forwarded-For', '203.0.113.4')
      .expect(429);
    expect(send).toHaveBeenCalledTimes(60);
  });

  it('recovers after the recipient window expires', async () => {
    const now = Date.now();
    const clock = jest.spyOn(Date, 'now').mockReturnValue(now);
    try {
      for (let index = 0; index < 3; index++)
        await sendMail('first@example.test').expect(201);
      await sendMail('first@example.test').expect(429);
      clock.mockReturnValue(now + 600_001);
      await sendMail('first@example.test').expect(201);
    } finally {
      clock.mockRestore();
    }
  });

  it('returns a short Japanese retry message without echoing the recipient', async () => {
    for (let index = 0; index < 3; index++)
      await sendMail('first@example.test').expect(201);
    const response = await sendMail('first@example.test')
      .set('Cookie', 'language=japanese')
      .expect(429);
    expect((response.body as { message: string }).message).toBe(
      'しばらく待ってから、もう一度お試しください。',
    );
    expect(response.text).not.toContain('first@example.test');
  });

  it('does not retain raw addresses and tolerates malformed JSON fields', () => {
    const first = authEmailTracker({
      body: { email: 'First@Example.Test' },
      ip: '127.0.0.1',
    });
    expect(first).toBe(
      authEmailTracker({
        body: { email: ' first@example.test ' },
        ip: '203.0.113.1',
      }),
    );
    expect(first).toMatch(/^[a-f0-9]{64}$/);
    for (const body of [
      undefined,
      null,
      {},
      { email: [] },
      { email: 'x'.repeat(255) },
    ]) {
      expect(authEmailTracker({ body, ip: '127.0.0.1' })).toMatch(
        /^[a-f0-9]{64}$/,
      );
    }
  });
});
