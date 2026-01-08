import { Controller, Post, Body } from '@nestjs/common';
import { AuthService } from './auth.service';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  // 이메일 체크 
  @Post('check')
  async checkEmail(@Body() body: {email: string}) {
    return await this.authService.checkEmail(body.email);
  }

  // 이메일 회원가입
  @Post('signup')
  async signup(@Body() body: any) {
    return await this.authService.signup(body);
  }

  // 이메일 로그인
  @Post('login')
  async login(@Body() body: any) {
    return await this.authService.login(body);
  }

  // 카카오 로그인
  @Post('kakao')
  async kakaoLogin(@Body() body: { kakaoAccessToken: string }) {
    return await this.authService.loginWithKakao(body.kakaoAccessToken);
  }
}