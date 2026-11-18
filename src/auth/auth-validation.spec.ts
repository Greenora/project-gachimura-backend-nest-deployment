import { validate } from 'class-validator';
import { ConfigService } from '@nestjs/config';
import { LoginDto } from './dto/login.dto';
import { JwtStrategy } from './jwt.strategy';
import { AuthService, JwtPayload } from './auth.service';
import { UsersService } from '../users/users.service';
import { User } from '../users/entities/user.entity';
import { JwtService } from '@nestjs/jwt';
import { Repository } from 'typeorm';
import { EmailVerification } from './entities/email-verification.entity';
import * as bcrypt from 'bcrypt';

describe('login trust boundaries', () => {
  it('only bypasses signup email verification outside production', async () => {
    const users = { findByEmail: jest.fn().mockResolvedValue(null) };
    const jwt = { sign: jest.fn().mockReturnValue('test-signup-token') };
    const repository = {
      findOne: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockReturnValue({}),
      save: jest.fn().mockResolvedValue({}),
    };
    const config = new ConfigService({
      NODE_ENV: 'development',
      EMAIL_VERIFICATION_REQUIRED: 'false',
    });
    const service = new AuthService(
      users as unknown as UsersService,
      jwt as unknown as JwtService,
      config,
      repository as unknown as Repository<EmailVerification>,
    );
    expect(
      await service.sendEmailVerificationCode('test@example.com'),
    ).toHaveProperty('emailVerificationToken', 'test-signup-token');
    jwt.sign.mockClear();
    config.set('NODE_ENV', 'production');
    await expect(
      service.sendEmailVerificationCode('test@example.com'),
    ).rejects.toThrow('SMTP');
    expect(jwt.sign).not.toHaveBeenCalled();
  });
  it('accepts existing local passwords but rejects malformed requests', async () => {
    const dto = Object.assign(new LoginDto(), {
      email: 'user@example.com',
      password: '123456',
      rememberMe: false,
    });
    expect(await validate(dto)).toHaveLength(0);
    Object.assign(dto, { password: {}, rememberMe: 'false' });
    expect(await validate(dto)).toHaveLength(2);
  });

  it('rejects refresh and signup tokens when used as access tokens', () => {
    const strategy = new JwtStrategy(
      new ConfigService({ JWT_SECRET: 'test-only-'.repeat(8) }),
    );
    expect(() => strategy.validate({ sub: 1 })).toThrow();
    expect(() => strategy.validate({ email: 'user@example.com' })).toThrow();
    expect(() =>
      strategy.validate({ sub: -1, email: 'a', nickname: 'b' }),
    ).toThrow();
    expect(() =>
      strategy.validate({ sub: 1, email: 'user@example.com', nickname: '' }),
    ).toThrow();
    expect(
      strategy.validate({
        sub: 1,
        email: 'user@example.com',
        nickname: 'User',
      }),
    ).toEqual({ id: 1, email: 'user@example.com', nickname: 'User' });
  });
});

describe('access tokens issued for legacy display names', () => {
  const secret = 'display-name-regression-only-'.repeat(3);
  const config = new ConfigService({ JWT_SECRET: secret });
  const jwt = new JwtService({ secret });
  const strategy = new JwtStrategy(config);
  const password = 'Example123';
  let passwordHash: string;

  beforeAll(async () => {
    passwordHash = await bcrypt.hash(password, 4);
  });

  it.each([
    ['', undefined, '사용자'],
    ['', '日本語の名前', '日本語の名前'],
    [null, undefined, '사용자'],
    [undefined, undefined, '사용자'],
    [null, '日本語の名前', '日本語の名前'],
    ['기존 이름', '日本語の名前', '기존 이름'],
  ])(
    'validates login and refresh tokens for nickname %p and Japanese name %p',
    async (nickname, nicknameJp, expectedName) => {
      const user = Object.assign(new User(), {
        id: 42,
        email: 'legacy@example.com',
        password: passwordHash,
        nickname,
        nickname_jp: nicknameJp,
      });
      const users = {
        findByEmail: jest.fn().mockResolvedValue(user),
        findOne: jest.fn().mockResolvedValue(user),
        updateRefreshToken: jest.fn(async (_id: number, token: string) => {
          user.refreshToken = await bcrypt.hash(token, 4);
        }),
      };
      const service = new AuthService(
        users as unknown as UsersService,
        jwt,
        config,
        {} as Repository<EmailVerification>,
      );

      const login = await service.login({ email: user.email, password });
      const refreshed = await service.refresh(login.refreshToken);
      for (const token of [login.accessToken, refreshed.accessToken]) {
        const payload = jwt.verify<JwtPayload>(token);
        expect(strategy.validate(payload)).toEqual({
          id: user.id,
          email: user.email,
          nickname: expectedName,
        });
      }
    },
  );
});
