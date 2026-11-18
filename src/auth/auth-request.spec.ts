import { ExecutionContext, INestApplication } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Test } from '@nestjs/testing';
import { ThrottlerModule } from '@nestjs/throttler';
import { Server } from 'node:http';
import request from 'supertest';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { PasswordResetService } from './password-reset.service';

describe('인증 요청의 출처와 JSON 경계', () => {
  let app: INestApplication<Server>;
  let previousOrigins: string | undefined;
  const checkEmail = jest.fn().mockResolvedValue({ exists: false });
  const refresh = jest
    .fn()
    .mockResolvedValue({ accessToken: 'fixture-access-token' });
  const logout = jest
    .fn()
    .mockResolvedValue({ message: '로그아웃되었습니다.' });

  beforeAll(async () => {
    previousOrigins = process.env.CORS_ORIGINS;
    process.env.CORS_ORIGINS = 'https://gachimura.com,http://localhost:3000';
    const module = await Test.createTestingModule({
      imports: [ThrottlerModule.forRoot([{ ttl: 60000, limit: 100 }])],
      controllers: [AuthController],
      providers: [
        { provide: AuthService, useValue: { checkEmail, refresh, logout } },
        { provide: PasswordResetService, useValue: {} },
      ],
    })
      .overrideGuard(AuthGuard('jwt'))
      .useValue({
        canActivate(context: ExecutionContext) {
          context.switchToHttp().getRequest<{ user: { id: number } }>().user = {
            id: 1,
          };
          return true;
        },
      })
      .compile();
    app = module.createNestApplication();
    app.enableCors({ origin: ['https://gachimura.com'], credentials: true });
    await app.listen(0, '127.0.0.1');
  });

  beforeEach(() => {
    checkEmail.mockClear();
    refresh.mockClear();
    logout.mockClear();
  });
  afterAll(async () => {
    await app?.close();
    if (previousOrigins === undefined) delete process.env.CORS_ORIGINS;
    else process.env.CORS_ORIGINS = previousOrigins;
  });

  it.each([
    'https://outside.example.test',
    'null',
    'https://gachimura.com.outside.example.test',
  ])(
    '허용되지 않은 Origin %s의 JSON 요청을 서비스 호출 전에 거절한다',
    async (origin) => {
      await request(app.getHttpServer())
        .post('/auth/check')
        .set('Origin', origin)
        .send({ email: 'fixture@example.test' })
        .expect(403);
      expect(checkEmail).not.toHaveBeenCalled();
    },
  );

  it.each(['form', 'text/plain'])(
    '출처를 숨긴 %s 요청을 서비스 호출 전에 거절한다',
    async (type) => {
      await request(app.getHttpServer())
        .post('/auth/check')
        .type(type)
        .send('email=fixture%40example.test')
        .expect(415);
      expect(checkEmail).not.toHaveBeenCalled();
    },
  );

  it.each(['cross-site', 'same-site', 'none'])(
    'Origin이 없는 브라우저 %s 요청은 허용하지 않는다',
    async (site) => {
      await request(app.getHttpServer())
        .post('/auth/check')
        .set('Sec-Fetch-Site', site)
        .send({ email: 'fixture@example.test' })
        .expect(403);
      expect(checkEmail).not.toHaveBeenCalled();
    },
  );

  it.each(['https://gachimura.com', 'http://localhost:3000'])(
    '정확한 허용 Origin %s의 JSON 요청을 허용한다',
    async (origin) => {
      await request(app.getHttpServer())
        .post('/auth/check')
        .set('Origin', origin)
        .send({ email: 'fixture@example.test' })
        .expect(201);
      expect(checkEmail).toHaveBeenCalledWith('fixture@example.test');
    },
  );

  it('Origin 없는 비브라우저 JSON 요청은 기존 API와 호환된다', async () => {
    await request(app.getHttpServer())
      .post('/auth/check')
      .send({ email: 'fixture@example.test' })
      .expect(201);
    expect(checkEmail).toHaveBeenCalledTimes(1);
  });

  it.each(['refresh', 'logout'])(
    '기존 탭의 허용 출처·빈 본문 %s 요청은 JSON 헤더 없이도 호환된다',
    async (route) => {
      await request(app.getHttpServer())
        .post('/auth/' + route)
        .set('Origin', 'https://gachimura.com')
        .set('Cookie', 'refreshToken=fixture-refresh-token')
        .expect(201);
      expect(route === 'refresh' ? refresh : logout).toHaveBeenCalledTimes(1);
    },
  );

  it.each(['refresh', 'logout'])(
    '빈 본문의 %s 예외로 출처 없는 요청이나 폼 본문을 허용하지 않는다',
    async (route) => {
      await request(app.getHttpServer())
        .post('/auth/' + route)
        .expect(415);
      await request(app.getHttpServer())
        .post('/auth/' + route)
        .set('Origin', 'https://outside.example.test')
        .expect(403);
      await request(app.getHttpServer())
        .post('/auth/' + route)
        .set('Origin', 'null')
        .expect(403);
      await request(app.getHttpServer())
        .post('/auth/' + route)
        .set('Origin', 'https://gachimura.com')
        .type('form')
        .send('refreshToken=fixture')
        .expect(415);
      expect(refresh).not.toHaveBeenCalled();
      expect(logout).not.toHaveBeenCalled();
    },
  );

  it('허용 출처라도 인증 코드·가입 요청은 빈 본문 예외에 포함하지 않는다', async () => {
    for (const route of ['kakao', 'line', 'login', 'signup']) {
      await request(app.getHttpServer())
        .post('/auth/' + route)
        .set('Origin', 'https://gachimura.com')
        .expect(415);
    }
  });

  it.each([
    'kakao',
    'line',
    'login',
    'signup',
    'refresh',
    'logout',
    'password-reset/request',
    'password-reset/confirm',
    'email-verification/send',
    'email-verification/verify',
  ])('%s도 외부 출처에서 직접 호출할 수 없다', async (route) => {
    await request(app.getHttpServer())
      .post('/auth/' + route)
      .set('Origin', 'https://outside.example.test')
      .send({})
      .expect(403);
  });
});
