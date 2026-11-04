import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { randomBytes } from 'node:crypto';
import request from 'supertest';
import { JwtStrategy } from '../auth/jwt.strategy';
import { PushController } from './push.controller';
import { PushService } from './push.service';

describe('authenticated push routes', () => {
  let app: NestExpressApplication;
  let token: string;
  const subscribe = jest.fn().mockResolvedValue({ subscribed: true });
  const unsubscribe = jest.fn().mockResolvedValue({ subscribed: false });

  beforeAll(async () => {
    const secret = randomBytes(48).toString('hex');
    const fixture = await Test.createTestingModule({
      controllers: [PushController],
      providers: [
        JwtStrategy,
        {
          provide: ConfigService,
          useValue: new ConfigService({ JWT_SECRET: secret }),
        },
        {
          provide: PushService,
          useValue: {
            getConfig: () => ({
              enabled: true,
              publicKey: 'fixture-public-key',
            }),
            subscribe,
            unsubscribe,
          },
        },
      ],
    }).compile();
    app = fixture.createNestApplication<NestExpressApplication>();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    token = new JwtService({ secret }).sign({
      sub: 5,
      email: 'fixture@example.test',
      nickname: 'Fixture',
    });
    await app.listen(0, '127.0.0.1');
  });
  afterAll(async () => {
    await app?.close();
  });
  beforeEach(() => jest.clearAllMocks());

  it.each(['get', 'post', 'delete'] as const)(
    'rejects unauthenticated %s requests',
    async (method) => {
      const path = method === 'get' ? 'config' : 'subscriptions';
      await request(app.getHttpServer())
        [method](`/api/push/${path}`)
        .expect(401);
    },
  );

  it('returns the public runtime configuration without caching', async () => {
    const result = await request(app.getHttpServer())
      .get('/api/push/config')
      .set('Authorization', `Bearer ${token}`)
      .expect(200)
      .expect('Cache-Control', 'no-store');
    expect(result.body).toEqual({
      enabled: true,
      publicKey: 'fixture-public-key',
    });
  });

  it('binds subscriptions to JWT identity and refuses an injected user ID', async () => {
    const body = {
      endpoint: 'https://fcm.googleapis.com/fcm/send/fixture',
      keys: { p256dh: 'fixture', auth: 'fixture' },
    };
    await request(app.getHttpServer())
      .post('/api/push/subscriptions')
      .set('Authorization', `Bearer ${token}`)
      .send({ ...body, userId: 999 })
      .expect(400);
    expect(subscribe).not.toHaveBeenCalled();
    await request(app.getHttpServer())
      .post('/api/push/subscriptions')
      .set('Authorization', `Bearer ${token}`)
      .send(body)
      .expect(201, { subscribed: true });
    expect(subscribe).toHaveBeenCalledWith(5, expect.objectContaining(body));
  });

  it('requires encryption keys and rejects unknown nested properties', async () => {
    const endpoint = 'https://fcm.googleapis.com/fcm/send/fixture';
    await request(app.getHttpServer())
      .post('/api/push/subscriptions')
      .set('Authorization', `Bearer ${token}`)
      .send({ endpoint })
      .expect(400);
    await request(app.getHttpServer())
      .post('/api/push/subscriptions')
      .set('Authorization', `Bearer ${token}`)
      .send({
        endpoint,
        keys: {
          p256dh: 'fixture',
          auth: 'fixture',
          privateKey: 'invalid-extra-field',
        },
      })
      .expect(400);
    expect(subscribe).not.toHaveBeenCalled();
  });

  it.each(['post', 'delete'] as const)(
    'rejects an untrusted Origin for authenticated %s mutations',
    async (method) => {
      await request(app.getHttpServer())
        [method]('/api/push/subscriptions')
        .set('Authorization', `Bearer ${token}`)
        .set('Origin', 'https://untrusted.example')
        .send({
          endpoint: 'https://fcm.googleapis.com/fcm/send/fixture',
          ...(method === 'post'
            ? { keys: { p256dh: 'fixture', auth: 'fixture' } }
            : {}),
        })
        .expect(403);
      expect(subscribe).not.toHaveBeenCalled();
      expect(unsubscribe).not.toHaveBeenCalled();
    },
  );

  it('uses the current JWT account when removing an endpoint', async () => {
    const endpoint = 'https://fcm.googleapis.com/fcm/send/fixture';
    await request(app.getHttpServer())
      .delete('/api/push/subscriptions')
      .set('Authorization', `Bearer ${token}`)
      .send({ endpoint })
      .expect(200, { subscribed: false });
    expect(unsubscribe).toHaveBeenCalledWith(5, endpoint);
  });
});
