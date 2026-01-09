import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { UsersService } from '../users/users.service';
import * as bcrypt from 'bcrypt';

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService, // 1. 유저 서비스 가져오기
    private readonly jwtService: JwtService, // 2. 토큰 서비스 가져오기
  ) {}

  async checkEmail(email: string) {
    const user = await this.usersService.findByEmail(email);
    return { exists: !!user };
  }

  // 이메일 회원가입
  async signup(body: any) {
    // UsersService의 signUp 함수 재사용
    await this.usersService.signUp(body);
    return { message: '회원가입이 완료되었습니다.' };
  }

  // 이메일 로그인
  async login(body: any) {
    const { email, password } = body;

    // 유저 찾기
    const user = await this.usersService.findByEmail(email);
    if (!user) {
      throw new UnauthorizedException('이메일 또는 비밀번호가 잘못되었습니다.');
    }

    // 비밀번호 확인 (DB의 암호화된 비번 vs 입력한 비번 비교)
    // 소셜 로그인 유저는 비밀번호가 없을 수 있으므로 체크
    if (!user.password) {
      throw new UnauthorizedException('소셜 로그인으로 가입된 계정입니다.');
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      throw new UnauthorizedException('이메일 또는 비밀번호가 잘못되었습니다.');
    }

    // 토큰 발급
    const payload = {
      email: user.email,
      sub: user.id,
      nickname: user.nickname,
    };
    return {
      accessToken: this.jwtService.sign(payload),
      user: { email: user.email, nickname: user.nickname },
    };
  }

  async loginWithKakao(kakaoAccessToken: string) {
    // UsersService를 써서 유저를 가져옵니다 (없으면 생성까지 됨)
    const result = await this.usersService.kakaoLogin(kakaoAccessToken);
    const user = result.user; // { message, user } 형태니까 user만 꺼냄

    // 토큰에 넣을 정보 (Payload) 정하기
    const payload = {
      email: user.email,
      sub: user.id, // sub는 토큰 주인의 ID를 뜻하는 표준 필드
      nickname: user.nickname,
    };

    // 진짜 JWT 토큰 발급!
    return {
      accessToken: this.jwtService.sign(payload),
      user: user, // 프론트에 유저 정보도 같이 주면 좋음
    };
  }
}
