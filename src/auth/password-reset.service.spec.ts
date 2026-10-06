import { ConfigService } from '@nestjs/config';
import { Repository } from 'typeorm';
import { createHash } from 'crypto';
import * as nodemailer from 'nodemailer';
import * as bcrypt from 'bcrypt';
import { User } from '../users/entities/user.entity';
import { PasswordResetService } from './password-reset.service';

jest.mock('nodemailer');

describe('password reset', () => {
  const sendMail = jest.fn();
  const update = jest.fn();
  const execute = jest.fn();
  const query = {
    update: jest.fn(),
    set: jest.fn(),
    where: jest.fn(),
    andWhere: jest.fn(),
    execute,
  };
  const findOne = jest.fn();
  let service: PasswordResetService;

  beforeEach(() => {
    jest.resetAllMocks();
    for (const key of ['update', 'set', 'where', 'andWhere'] as const)
      query[key].mockReturnValue(query);
    execute.mockResolvedValue({ affected: 1 });
    update.mockResolvedValue({ affected: 1 });
    sendMail.mockResolvedValue({});
    findOne.mockResolvedValue({ id: 1, password: 'existing-hash' });
    (nodemailer.createTransport as jest.Mock).mockReturnValue({ sendMail });
    service = new PasswordResetService(
      {
        findOne,
        update,
        createQueryBuilder: () => query,
      } as unknown as Repository<User>,
      new ConfigService({
        NODE_ENV: 'development',
        SMTP_HOST: 'localhost',
        SMTP_FROM: 'test@example.com',
        PASSWORD_RESET_URL: 'http://localhost:3000/reset-password',
      }),
    );
  });

  it('emails a random token but stores only its hash and returns no token', async () => {
    const response = await service.request('user@example.com');
    const message = sendMail.mock.calls[0][0] as { text: string };
    const token = message.text.match(/#([a-f0-9]{64})/)?.[1];
    expect(token).toBeDefined();
    const stored = query.set.mock.calls[0][0] as {
      passwordResetHash: string;
      passwordResetExpiresAt: Date;
    };
    expect(stored.passwordResetHash).toBe(
      createHash('sha256').update(token!).digest('hex'),
    );
    expect(stored.passwordResetExpiresAt.getTime()).toBeGreaterThan(
      Date.now() + 14 * 60_000,
    );
    expect(JSON.stringify(response)).not.toContain(token);
    findOne.mockResolvedValue(null);
    expect(await service.request('unknown@example.com')).toEqual(response);
    expect(sendMail).toHaveBeenCalledTimes(1);
  });

  it('does not mail during cooldown and clears only its own token after delivery failure', async () => {
    execute.mockResolvedValueOnce({ affected: 0 });
    await service.request('user@example.com');
    expect(sendMail).not.toHaveBeenCalled();
    sendMail.mockRejectedValueOnce(new Error('SMTP unavailable'));
    await service.request('user@example.com');
    expect(update.mock.calls[0][0]).toMatchObject({
      id: 1,
      passwordResetHash: expect.any(String),
    });
  });

  it('atomically consumes unexpired token, hashes password and revokes refresh; rejects reuse/expiry', async () => {
    const token = 'a'.repeat(64);
    await service.reset(token, 'Newpass123');
    const [where, changes] = update.mock.calls[0] as [
      Record<string, unknown>,
      { password: string; refreshToken: null; passwordResetHash: null },
    ];
    expect(where.passwordResetHash).toBe(
      createHash('sha256').update(token).digest('hex'),
    );
    expect(where.passwordResetExpiresAt).toBeDefined();
    expect(await bcrypt.compare('Newpass123', changes.password)).toBe(true);
    expect(changes.refreshToken).toBeNull();
    expect(changes.passwordResetHash).toBeNull();
    update.mockResolvedValue({ affected: 0 });
    await expect(service.reset(token, 'Newpass123')).rejects.toThrow('만료');
  });
});
