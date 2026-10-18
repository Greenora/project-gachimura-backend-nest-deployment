import {
  INestApplication,
  UnauthorizedException,
  ValidationPipe,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { ThrottlerModule } from '@nestjs/throttler';
import { Server } from 'node:http';
import request from 'supertest';
import { UsersController } from '../users/users.controller';
import { UsersService } from '../users/users.service';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtStrategy } from './jwt.strategy';
import { PasswordResetService } from './password-reset.service';

describe('HTTP cookie session contract', () => {
  const user = {
    id: 1,
    email: 'session@example.com',
    nickname: 'Session test',
  };
  const payload = { sub: user.id, email: user.email, nickname: user.nickname };
  const secret = 'http-session-fixture-only-'.repeat(3);
  const jwt = new JwtService({ secret });
  const accessToken = jwt.sign(payload, { expiresIn: '1h' });
  const refreshToken = jwt.sign({ sub: user.id }, { expiresIn: '1d' });
  let app: INestApplication<Server>;
  let previousNodeEnv: string | undefined;

  beforeAll(async () => {
    previousNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    const fixture = await Test.createTestingModule({
      imports: [ThrottlerModule.forRoot([{ ttl: 60_000, limit: 100 }])],
      controllers: [AuthController, UsersController],
      providers: [
        JwtStrategy,
        {
          provide: ConfigService,
          useValue: new ConfigService({ JWT_SECRET: secret }),
        },
        {
          provide: UsersService,
          useValue: { findOne: jest.fn().mockResolvedValue(user) },
        },
        { provide: PasswordResetService, useValue: {} },
        {
          provide: AuthService,
          useValue: {
            login: jest.fn().mockResolvedValue({
              accessToken,
              refreshToken,
              expiresIn: 3600,
              user,
            }),
            refresh: jest
              .fn()
              .mockImplementation((token: string) =>
                token === refreshToken
                  ? Promise.resolve({ accessToken })
                  : Promise.reject(new UnauthorizedException()),
              ),
          },
        },
      ],
    }).compile();
    app = fixture.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.listen(0, '127.0.0.1');
  });

  afterAll(async () => {
    try {
      await app?.close();
    } finally {
      if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = previousNodeEnv;
    }
  });

  it('issues production cookies and authenticates the next profile request without a bearer header', async () => {
    const login = await request(app.getHttpServer())
      .post('/api/auth/login')
      .set('X-Forwarded-Proto', 'https')
      .send({ email: user.email, password: 'Example123', rememberMe: false })
      .expect(201);
    expect(login.body).toEqual({ expiresIn: 3600, user });
    const cookies = login.headers['set-cookie'] as string[];
    expect(cookies).toHaveLength(2);
    expect(cookies[0]).toMatch(/^accessToken=.+; Max-Age=3600;/);
    expect(cookies[1]).toMatch(/^refreshToken=.+; Max-Age=86400;/);
    for (const cookie of cookies) {
      expect(cookie).toContain('; Path=/');
      expect(cookie).toContain('; HttpOnly');
      expect(cookie).toContain('; Secure');
      expect(cookie).toContain('; SameSite=Lax');
      expect(cookie).not.toContain('; Domain=');
    }
    await request(app.getHttpServer())
      .get('/api/users/profile')
      .set(
        'Cookie',
        `language=ko; ${cookies.map((cookie) => cookie.split(';')[0]).join('; ')}`,
      )
      .expect(200)
      .expect(user);
    await request(app.getHttpServer())
      .get('/api/users/profile')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
  });

  it('refreshes using only the refresh cookie and keeps tokens out of the response body', async () => {
    const refreshed = await request(app.getHttpServer())
      .post('/api/auth/refresh')
      .set('Cookie', `language=ko; refreshToken=${refreshToken}`)
      .expect(201);
    expect(refreshed.body).toEqual({ expiresIn: 3600 });
    const cookies = refreshed.headers['set-cookie'] as string[];
    expect(cookies).toHaveLength(1);
    expect(cookies[0]).toMatch(/^accessToken=/);
    expect(cookies[0]).toContain('; HttpOnly');
    expect(cookies[0]).toContain('; Secure');
    await request(app.getHttpServer())
      .get('/api/users/profile')
      .set('Cookie', cookies[0].split(';')[0])
      .expect(200);
    await request(app.getHttpServer()).post('/api/auth/refresh').expect(401);
  });

  it('rejects missing, invalid, expired and refresh tokens on protected routes', async () => {
    await request(app.getHttpServer()).get('/api/users/profile').expect(401);
    const expiredToken = jwt.sign(payload, { expiresIn: -1 });
    for (const token of ['invalid-token', expiredToken, refreshToken]) {
      await request(app.getHttpServer())
        .get('/api/users/profile')
        .set('Cookie', `accessToken=${token}`)
        .expect(401);
    }
  });
});
