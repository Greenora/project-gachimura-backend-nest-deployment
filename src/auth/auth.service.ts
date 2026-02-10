import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { UsersService } from '../users/users.service';
import { User } from '../users/entities/user.entity';
import { CreateUserDto } from '../users/dto/create-user.dto';
import * as bcrypt from 'bcrypt';

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
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

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

  async signup(body: CreateUserDto): Promise<{ message: string }> {
    await this.usersService.signUp(body);
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