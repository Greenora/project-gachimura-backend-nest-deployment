import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Injectable,
  InternalServerErrorException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UsersService } from '../users/users.service';
import { User } from '../users/entities/user.entity';
import { CreateUserDto } from '../users/dto/create-user.dto';
import { SignupDto } from './dto/signup.dto';
import { EmailVerification } from './entities/email-verification.entity';
import * as bcrypt from 'bcrypt';
import { createHash } from 'crypto';
import * as nodemailer from 'nodemailer';

// 로그인 요청 DTO
export interface LoginDto {
  email: string;
  password: string;
  rememberMe?: boolean;
}

// JWT 페이로드 타입
export interface JwtPayload {
  email: string;
  sub: number;
  nickname: string;
}

// 로그인 응답 타입
export interface AuthResponse {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  user: {
    email: string;
    nickname: string;
    nickname_jp?: string; // 일본어 닉네임 필드 추가
  };
}

@Injectable()
export class AuthService {
  private readonly verificationCodeExpireMinutes = 10;
  private readonly verificationCodeCooldownSeconds = 60;
  private readonly verificationCodeMaxAttempts = 5;

  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    @InjectRepository(EmailVerification)
    private readonly emailVerificationRepository: Repository<EmailVerification>,
  ) {}

  private isEmailVerificationRequired(): boolean {
    const rawValue =
      this.configService.get<string>('EMAIL_VERIFICATION_REQUIRED') ?? 'false';
    return rawValue.toLowerCase() === 'true';
  }

  private hashVerificationCode(code: string): string {
    return createHash('sha256').update(code).digest('hex');
  }

  private generateVerificationCode(): string {
    return Math.floor(100000 + Math.random() * 900000).toString();
  }

  private async sendVerificationMail(email: string, code: string): Promise<void> {
    const host = this.configService.get<string>('SMTP_HOST');
    const port = Number(this.configService.get<string>('SMTP_PORT') || 587);
    const user = this.configService.get<string>('SMTP_USER');
    const pass = this.configService.get<string>('SMTP_PASS');
    const from =
      this.configService.get<string>('SMTP_FROM') ||
      `Gachimura <${user || 'no-reply@gachimura.local'}>`;

    if (!host || !user || !pass) {
      throw new InternalServerErrorException(
        'SMTP 설정이 누락되었습니다. SMTP_HOST/SMTP_USER/SMTP_PASS를 확인해주세요.',
      );
    }

    const transporter = nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      auth: { user, pass },
    });

    await transporter.sendMail({
      from,
      to: email,
      subject: '[Gachimura] 이메일 인증 코드',
      text: `가치무라 이메일 인증 코드: ${code}\n유효시간: ${this.verificationCodeExpireMinutes}분`,
      html: `
        <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #222;">
          <h2 style="margin-bottom: 8px;">가치무라 이메일 인증</h2>
          <p>아래 인증 코드를 입력해주세요.</p>
          <div style="font-size: 28px; font-weight: 700; letter-spacing: 6px; margin: 12px 0;">${code}</div>
          <p>유효시간은 ${this.verificationCodeExpireMinutes}분입니다.</p>
        </div>
      `,
    });
  }

  private createSignupVerificationToken(email: string): string {
    return this.jwtService.sign(
      {
        email,
        purpose: 'signup-email-verified',
      },
      { expiresIn: '15m' },
    );
  }

  private validateSignupVerificationToken(token: string, email: string): void {
    try {
      const payload = this.jwtService.verify<{ email: string; purpose: string }>(
        token,
      );

      if (payload.purpose !== 'signup-email-verified') {
        throw new BadRequestException('이메일 인증 토큰의 용도가 올바르지 않습니다.');
      }

      if (payload.email !== email) {
        throw new BadRequestException('이메일 인증 토큰의 이메일이 일치하지 않습니다.');
      }
    } catch (error) {
      if (error instanceof BadRequestException) {
        throw error;
      }
      throw new UnauthorizedException('이메일 인증 토큰이 유효하지 않거나 만료되었습니다.');
    }
  }

  // Access Token 생성 - API 요청할 때 인증용
  // 1시간 유효함
  private generateAccessToken(user: User): string {
    const payload: JwtPayload = {
      email: user.email,
      sub: user.id, // 유저 ID
      nickname: user.nickname,
    };
    return this.jwtService.sign(payload, { expiresIn: '1h' });
  }

  // Refresh Token 생성 - Access Token 갱신용
  // 기본 7일, rememberMe 체크하면 최대 30일
  private generateRefreshToken(
    user: User,
    expiresIn: string | number = '7d',
  ): string {
    const payload = { sub: user.id };
    return this.jwtService.sign(payload, {
      expiresIn: expiresIn as any,
    });
  }

  // 이메일이 DB에 있는지 체크
  async checkEmail(email: string): Promise<{ exists: boolean }> {
    const user = await this.usersService.findByEmail(email);
    return { exists: !!user }; // 있으면 true, 없으면 false
  }

  async sendEmailVerificationCode(
    email: string,
  ): Promise<{ message: string; expiresInMinutes: number }> {
    const existingUser = await this.usersService.findByEmail(email);
    if (existingUser) {
      throw new BadRequestException('이미 가입된 이메일입니다.');
    }

    if (!this.isEmailVerificationRequired()) {
      return {
        message: '개발 모드에서는 이메일 인증이 비활성화되어 있습니다.',
        expiresInMinutes: this.verificationCodeExpireMinutes,
      };
    }

    const latestRequest = await this.emailVerificationRepository.findOne({
      where: { email },
      order: { createdAt: 'DESC' },
    });

    if (latestRequest) {
      const diffSeconds =
        (Date.now() - latestRequest.createdAt.getTime()) / 1000;
      if (diffSeconds < this.verificationCodeCooldownSeconds) {
        throw new HttpException(
          `인증 코드는 ${this.verificationCodeCooldownSeconds}초마다 요청할 수 있습니다.`,
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
    }

    const code = this.generateVerificationCode();
    const expiresAt = new Date(
      Date.now() + this.verificationCodeExpireMinutes * 60 * 1000,
    );

    const verification = this.emailVerificationRepository.create({
      email,
      codeHash: this.hashVerificationCode(code),
      expiresAt,
    });

    await this.emailVerificationRepository.save(verification);
    await this.sendVerificationMail(email, code);

    return {
      message: '인증 코드를 발송했습니다.',
      expiresInMinutes: this.verificationCodeExpireMinutes,
    };
  }

  async verifyEmailVerificationCode(
    email: string,
    code: string,
  ): Promise<{ verified: boolean; emailVerificationToken: string }> {
    if (!this.isEmailVerificationRequired()) {
      return {
        verified: true,
        emailVerificationToken: this.createSignupVerificationToken(email),
      };
    }

    const now = new Date();
    const verification = await this.emailVerificationRepository.findOne({
      where: { email },
      order: { createdAt: 'DESC' },
    });

    if (!verification) {
      throw new BadRequestException('먼저 인증 코드를 요청해주세요.');
    }

    if (verification.verifiedAt) {
      throw new BadRequestException('이미 인증된 코드입니다. 새 코드를 요청해주세요.');
    }

    if (verification.expiresAt.getTime() < now.getTime()) {
      throw new BadRequestException('인증 코드가 만료되었습니다. 다시 요청해주세요.');
    }

    if (verification.attemptCount >= this.verificationCodeMaxAttempts) {
      throw new BadRequestException(
        '인증 시도 횟수를 초과했습니다. 새 코드를 요청해주세요.',
      );
    }

    const inputHash = this.hashVerificationCode(code);
    if (inputHash !== verification.codeHash) {
      verification.attemptCount += 1;
      await this.emailVerificationRepository.save(verification);
      throw new BadRequestException('인증 코드가 일치하지 않습니다.');
    }

    verification.verifiedAt = now;
    await this.emailVerificationRepository.save(verification);

    return {
      verified: true,
      emailVerificationToken: this.createSignupVerificationToken(email),
    };
  }

  async signup(body: SignupDto): Promise<{ message: string }> {
    if (this.isEmailVerificationRequired()) {
      if (!body.emailVerificationToken) {
        throw new BadRequestException('이메일 인증 토큰이 필요합니다.');
      }

      this.validateSignupVerificationToken(
        body.emailVerificationToken,
        body.email,
      );
    }

    const createUserBody: CreateUserDto = {
      email: body.email,
      password: body.password,
      phone: body.phone,
      birthdate: body.birthdate,
      nickname: body.nickname,
      language: body.language,
    };

    await this.usersService.signUp(createUserBody);
    return { message: '회원가입이 완료되었습니다.' };
  }

  // 이메일 로그인 처리
  async login(body: LoginDto): Promise<AuthResponse> {
    const { email, password, rememberMe } = body;

    // 이메일로 유저 찾고 비밀번호 검증
    const user = await this.usersService.findByEmail(email);
    if (
      !user ||
      !user.password ||
      !(await bcrypt.compare(password, user.password))
    ) {
      throw new UnauthorizedException('이메일 또는 비밀번호가 잘못되었습니다.');
    }

    // 자동 로그인 체크했으면 30일, 안했으면 1일
    const refreshTokenExpiresIn = rememberMe ? '30d' : '1d';

    const accessToken = this.generateAccessToken(user);
    const refreshToken = this.generateRefreshToken(user, refreshTokenExpiresIn);

    await this.usersService.updateRefreshToken(user.id, refreshToken);

    return {
      accessToken,
      refreshToken,
      expiresIn: 3600, // AccessToken 만료 시간 (1시간)
      user: {
        email: user.email,
        nickname: user.nickname,
        nickname_jp: user.nickname_jp,
      },
    };
  }

  // 카카오 소셜 로그인 처리
  // 신규 유저면 자동으로 회원가입됨
  async loginWithKakao(
    kakaoAccessToken: string,
    language?: string, // 닉네임 생성할 때 한글/일본어 선택용
  ): Promise<AuthResponse> {
    const result = await this.usersService.kakaoLogin(
      kakaoAccessToken,
      language,
    );
    const user = result.user;

    const accessToken = this.generateAccessToken(user);
    const refreshToken = this.generateRefreshToken(user, '7d'); // 카카오는 기본 7일

    await this.usersService.updateRefreshToken(user.id, refreshToken);

    return {
      accessToken,
      refreshToken,
      expiresIn: 3600,
      user: {
        email: user.email,
        nickname: user.nickname,
        nickname_jp: user.nickname_jp,
      },
    };
  }

  // LINE 소셜 로그인 처리
  // code로 LINE 서버에서 토큰 교환함
  // 신규 유저면 자동으로 회원가입됨
  async loginWithLine(
    code: string, // LINE에서 받은 인가 코드
    redirectUri: string, // LINE Developers 콘솔 설정이랑 똑같아야 함
    language?: string, // 닉네임 생성할 때 한글/일본어 선택용
  ): Promise<AuthResponse> {
    const result = await this.usersService.lineLogin(
      code,
      redirectUri,
      language,
    );
    const user = result.user;

    const accessToken = this.generateAccessToken(user);
    const refreshToken = this.generateRefreshToken(user, '7d');

    await this.usersService.updateRefreshToken(user.id, refreshToken);

    return {
      accessToken,
      refreshToken,
      expiresIn: 3600,
      user: {
        email: user.email,
        nickname: user.nickname,
        nickname_jp: user.nickname_jp,
      },
    };
  }

  // Access Token 갱신
  // Refresh Token으로 새 Access Token 발급
  // TODO: 프론트에서 axios interceptor로 401 에러시 자동 호출하게 구현하면 좋음
  async refresh(refreshToken: string): Promise<{ accessToken: string }> {
    try {
      // Refresh Token 검증
      const payload = this.jwtService.verify<{ sub: number }>(refreshToken);
      const user = await this.usersService.findOne(payload.sub);

      if (!user || !user.refreshToken) {
        throw new UnauthorizedException('유효하지 않은 토큰입니다.');
      }

      // DB에 저장된 Refresh Token이랑 비교
      const isMatch = await bcrypt.compare(refreshToken, user.refreshToken);
      if (!isMatch) {
        throw new UnauthorizedException('토큰이 일치하지 않습니다.');
      }

      // 새 Access Token 발급
      const newAccessToken = this.generateAccessToken(user);
      return { accessToken: newAccessToken };
    } catch {
      throw new UnauthorizedException('토큰이 만료되었거나 유효하지 않습니다.');
    }
  }

  // 로그아웃 처리
  // DB에서 Refresh Token 삭제해서 더 이상 토큰 갱신 못하게 함
  // Access Token은 만료될 때까지 유효함 (1시간)
  async logout(userId: number): Promise<{ message: string }> {
    await this.usersService.removeRefreshToken(userId); // DB에서 refresh token 삭제
    return { message: '로그아웃 되었습니다.' };
  }
}
