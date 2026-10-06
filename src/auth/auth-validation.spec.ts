import { validate } from 'class-validator';
import { ConfigService } from '@nestjs/config';
import { LoginDto } from './dto/login.dto';
import { JwtStrategy } from './jwt.strategy';
import { AuthService } from './auth.service';
import { UsersService } from '../users/users.service';
import { JwtService } from '@nestjs/jwt';
import { Repository } from 'typeorm';
import { EmailVerification } from './entities/email-verification.entity';

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
    expect(
      strategy.validate({
        sub: 1,
        email: 'user@example.com',
        nickname: 'User',
      }),
    ).toEqual({ id: 1, email: 'user@example.com', nickname: 'User' });
  });
});
