import {
  BadRequestException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { MoreThan, Repository } from 'typeorm';
import { createHash, randomBytes } from 'crypto';
import * as bcrypt from 'bcrypt';
import * as nodemailer from 'nodemailer';
import { User } from '../users/entities/user.entity';

const RECEIVED = {
  message: '가입된 이메일이라면 비밀번호 재설정 안내를 보내드립니다.',
};

@Injectable()
export class PasswordResetService {
  constructor(
    @InjectRepository(User) private readonly users: Repository<User>,
    private readonly config: ConfigService,
  ) {}

  async request(email: string) {
    const host = this.config.get<string>('SMTP_HOST');
    const from = this.config.get<string>('SMTP_FROM');
    const resetUrl = this.config.get<string>('PASSWORD_RESET_URL');
    if (!host || !from || !resetUrl) {
      throw new ServiceUnavailableException(
        '메일 서비스가 준비되지 않았습니다.',
      );
    }
    const url = new URL(resetUrl);
    if (
      url.protocol !== 'https:' &&
      !(
        this.config.get('NODE_ENV') !== 'production' &&
        url.protocol === 'http:' &&
        ['localhost', '127.0.0.1'].includes(url.hostname)
      )
    )
      throw new ServiceUnavailableException(
        '비밀번호 재설정 주소를 확인해주세요.',
      );

    const user = await this.users.findOne({ where: { email } });
    if (!user?.password) return RECEIVED;

    // One reset email per account per minute, including requests from different IPs.
    const token = randomBytes(32).toString('hex');
    const tokenHash = createHash('sha256').update(token).digest('hex');
    const now = Date.now();
    const expiresAt = new Date(now + 15 * 60_000);
    const result = await this.users
      .createQueryBuilder()
      .update(User)
      .set({
        passwordResetHash: tokenHash,
        passwordResetExpiresAt: expiresAt,
      })
      .where('id = :id', { id: user.id })
      .andWhere(
        '(password_reset_expires_at IS NULL OR password_reset_expires_at <= :cooldown)',
        {
          cooldown: new Date(now + 14 * 60_000),
        },
      )
      .execute();
    if (!result.affected) return RECEIVED;

    // Fragment avoids sending the reset token to HTTP request logs/referrers.
    url.hash = token;
    const smtpUser = this.config.get<string>('SMTP_USER');
    const smtpPass = this.config.get<string>('SMTP_PASS');
    const port = Number(this.config.get('SMTP_PORT') || 587);
    const transporter = nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      ...(smtpUser && smtpPass
        ? { auth: { user: smtpUser, pass: smtpPass } }
        : {}),
    });
    try {
      await transporter.sendMail({
        from,
        to: email,
        subject: '[Gachimura] 비밀번호 재설정',
        text: `아래 링크에서 15분 안에 새 비밀번호를 설정해주세요. 한 번만 사용할 수 있습니다.\n${url.toString()}\n요청하지 않았다면 이 메일을 무시해주세요.`,
      });
    } catch {
      // Do not expose whether this email has an account through mail errors.
      await this.users.update(
        { id: user.id, passwordResetHash: tokenHash },
        {
          passwordResetHash: null,
          passwordResetExpiresAt: null,
        },
      );
    }
    return RECEIVED;
  }

  async reset(token: string, password: string) {
    const hash = createHash('sha256').update(token).digest('hex');
    const passwordHash = await bcrypt.hash(password, 12);
    // Conditional update consumes the token atomically, so concurrent reuse fails.
    const result = await this.users.update(
      {
        passwordResetHash: hash,
        passwordResetExpiresAt: MoreThan(new Date()),
      },
      {
        password: passwordHash,
        refreshToken: null,
        passwordResetHash: null,
        passwordResetExpiresAt: null,
      },
    );
    if (!result.affected)
      throw new BadRequestException(
        '재설정 링크가 만료되었거나 이미 사용되었습니다.',
      );
    return { message: '비밀번호가 변경되었습니다. 다시 로그인해주세요.' };
  }
}
