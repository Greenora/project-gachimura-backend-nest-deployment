import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { UsersService } from '../users/users.service';
import { User } from '../users/entities/user.entity';
import { CreateUserDto } from '../users/dto/create-user.dto';
import * as bcrypt from 'bcrypt';
import type { StringValue } from 'ms';

export interface LoginDto {
  email: string;
  password: string;
  rememberMe?: boolean;
}

export interface JwtPayload {
  email: string;
  sub: number;
  nickname: string;
}

export interface AuthResponse {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  user: { email: string; nickname: string };
}

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  // Access Token 생성 (1시간)
  private generateAccessToken(user: User): string {
    const payload: JwtPayload = {
      email: user.email,
      sub: user.id,
      nickname: user.nickname,
    };
    return this.jwtService.sign(payload, { expiresIn: '1h' });
  }

  // expiresIn 타입을 'string | number'로 변경
  private generateRefreshToken(
    user: User,
    expiresIn: string | number = '7d',
  ): string {
    const payload = { sub: user.id };
    return this.jwtService.sign(payload, {
      expiresIn: expiresIn as StringValue,
    });
  }

  async checkEmail(email: string): Promise<{ exists: boolean }> {
    const user = await this.usersService.findByEmail(email);
    return { exists: !!user };
  }

  async signup(body: CreateUserDto): Promise<{ message: string }> {
    await this.usersService.signUp(body);
    return { message: '회원가입이 완료되었습니다.' };
  }

  // 이메일 로그인
  async login(body: LoginDto): Promise<AuthResponse> {
    const { email, password, rememberMe } = body;

    const user = await this.usersService.findByEmail(email);
    if (
      !user ||
      !user.password ||
      !(await bcrypt.compare(password, user.password))
    ) {
      throw new UnauthorizedException('이메일 또는 비밀번호가 잘못되었습니다.');
    }

    // rememberMe가 true면 30일, false면 1일
    const refreshTokenExpiresIn = rememberMe ? '30d' : '1d';

    const accessToken = this.generateAccessToken(user);
    const refreshToken = this.generateRefreshToken(user, refreshTokenExpiresIn);

    await this.usersService.updateRefreshToken(user.id, refreshToken);

    return {
      accessToken,
      refreshToken,
      expiresIn: 3600, // AccessToken 만료 시간 (1시간)
      user: { email: user.email, nickname: user.nickname },
    };
  }

  // 카카오 로그인
  async loginWithKakao(
    kakaoAccessToken: string,
    language?: string,
  ): Promise<AuthResponse> {
    // UsersService에서 반환하는 타입이 명시적이지 않을 수 있으므로 any로 받거나 추론
    const result = await this.usersService.kakaoLogin(
      kakaoAccessToken,
      language,
    );
    const user = result.user;

    const accessToken = this.generateAccessToken(user);
    // 카카오는 기본 7일로 설정
    const refreshToken = this.generateRefreshToken(user, '7d');

    await this.usersService.updateRefreshToken(user.id, refreshToken);

    return {
      accessToken,
      refreshToken,
      expiresIn: 3600,
      user: { email: user.email, nickname: user.nickname },
    };
  }

  // Refresh Token으로 Access Token 재발급
  async refresh(refreshToken: string): Promise<{ accessToken: string }> {
    try {
      const payload = this.jwtService.verify<{ sub: number }>(refreshToken);
      const user = await this.usersService.findOne(payload.sub);

      if (!user || !user.refreshToken) {
        throw new UnauthorizedException('유효하지 않은 토큰입니다.');
      }

      const isMatch = await bcrypt.compare(refreshToken, user.refreshToken);
      if (!isMatch) {
        throw new UnauthorizedException('토큰이 일치하지 않습니다.');
      }

      const newAccessToken = this.generateAccessToken(user);
      return { accessToken: newAccessToken };
    } catch {
      throw new UnauthorizedException('토큰이 만료되었거나 유효하지 않습니다.');
    }
  }

  async logout(userId: number): Promise<{ message: string }> {
    await this.usersService.removeRefreshToken(userId);
    return { message: '로그아웃 되었습니다.' };
  }
}
