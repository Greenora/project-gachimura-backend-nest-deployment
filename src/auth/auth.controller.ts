import { Controller, Post, Body, UseGuards, Request } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import {
  ApiTags,
  ApiOperation,
  ApiBody,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { CreateUserDto } from '../users/dto/create-user.dto';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('check')
  @ApiOperation({
    summary: '이메일 중복 체크',
    description: '해당 이메일로 가입된 유저가 있는지 확인',
  })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        email: { type: 'string', example: 'user@example.com' },
      },
    },
  })
  @ApiResponse({
    status: 200,
    description: '이메일 존재 여부',
    schema: { example: { exists: true } },
  })
  async checkEmail(@Body() body: { email: string }) {
    return await this.authService.checkEmail(body.email);
  }

  @Post('signup')
  @ApiOperation({
    summary: '이메일 회원가입',
    description: '이메일과 비밀번호로 회원가입. 닉네임 미입력시 랜덤 생성',
  })
  @ApiResponse({
    status: 201,
    description: '회원가입 성공',
    schema: { example: { message: '회원가입이 완료되었습니다.' } },
  })
  @ApiResponse({ status: 400, description: '유효성 검사 실패' })
  @ApiResponse({ status: 409, description: '이미 사용중인 이메일' })
  async signup(@Body() createUserDto: CreateUserDto) {
    return await this.authService.signup(createUserDto);
  }

  @Post('login')
  @ApiOperation({
    summary: '이메일 로그인',
    description:
      '이메일과 비밀번호로 로그인하여 JWT 토큰 발급. rememberMe=true 시 30일 유지',
  })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        email: { type: 'string', example: 'user@example.com' },
        password: { type: 'string', example: 'password123' },
        rememberMe: {
          type: 'boolean',
          example: false,
          description: '자동 로그인 여부 (30일 유지)',
        },
      },
      required: ['email', 'password'],
    },
  })
  @ApiResponse({
    status: 200,
    description: '로그인 성공',
    schema: {
      example: {
        accessToken: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
        refreshToken: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
        expiresIn: 86400,
        user: { email: 'user@example.com', nickname: '행복한 쿼카' },
      },
    },
  })
  @ApiResponse({ status: 401, description: '이메일 또는 비밀번호가 잘못됨' })
  async login(
    @Body() body: { email: string; password: string; rememberMe?: boolean },
  ) {
    return await this.authService.login(body);
  }

  @Post('kakao')
  @ApiOperation({
    summary: '카카오 로그인',
    description:
      '카카오 액세스 토큰으로 로그인/회원가입. 신규 유저는 자동 가입됨',
  })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        kakaoAccessToken: {
          type: 'string',
          example: 'kakao_access_token_here',
          description: '카카오 SDK에서 받은 액세스 토큰',
        },
        language: {
          type: 'string',
          example: 'ko',
          description: '언어 설정 (ko/jp)',
        },
      },
      required: ['kakaoAccessToken'],
    },
  })
  @ApiResponse({
    status: 200,
    description: '카카오 로그인 성공',
    schema: {
      example: {
        accessToken: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
        refreshToken: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
        user: { id: 1, email: 'kakao@kakao.com', nickname: '幸せな クオッカ' },
      },
    },
  })
  async kakaoLogin(
    @Body() body: { kakaoAccessToken: string; language?: string },
  ) {
    return await this.authService.loginWithKakao(
      body.kakaoAccessToken,
      body.language,
    );
  }

  @Post('refresh')
  @ApiOperation({
    summary: '토큰 갱신',
    description: 'Refresh Token으로 새로운 Access Token 발급',
  })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        refreshToken: {
          type: 'string',
          example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
        },
      },
      required: ['refreshToken'],
    },
  })
  @ApiResponse({
    status: 200,
    description: '토큰 갱신 성공',
    schema: {
      example: { accessToken: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...' },
    },
  })
  @ApiResponse({ status: 401, description: '유효하지 않은 Refresh Token' })
  async refresh(@Body() body: { refreshToken: string }) {
    return await this.authService.refresh(body.refreshToken);
  }

  @Post('logout')
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary: '로그아웃',
    description: 'Refresh Token 무효화. Access Token 필요',
  })
  @ApiResponse({
    status: 200,
    description: '로그아웃 성공',
    schema: { example: { message: '로그아웃 되었습니다.' } },
  })
  @ApiResponse({ status: 401, description: '인증 실패' })
  async logout(@Request() req: { user: { id: number } }) {
    return await this.authService.logout(req.user.id);
  }
}
