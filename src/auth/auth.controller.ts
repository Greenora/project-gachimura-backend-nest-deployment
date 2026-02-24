import { Controller, Post, Body, UseGuards, Request, Res, Response } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags, ApiOperation, ApiBody, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { CreateUserDto } from '../users/dto/create-user.dto';
import { LineLoginDto } from './dto/line-login.dto';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  // 프론트에서 이메일 입력하면 이 API 호출해서 기존 회원인지 체크함
  // 있으면 로그인 화면, 없으면 회원가입 화면으로 전환
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

  // 이메일/비번으로 회원가입
  // 닉네임 안보내면 랜덤으로 생성됨 (한글/일본어 둘 다)
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

  // 이메일/비번 로그인
  // rememberMe 체크하면 refresh token 30일, 안하면 1일
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
        expiresIn: 3600,
        user: { 
          email: 'user@example.com', 
          nickname: '(랜덤 생성)',
          nickname_jp: '(랜덤 생성)'
        },
      },
    },
  })
  @ApiResponse({ status: 401, description: '이메일 또는 비밀번호가 잘못됨' })
  async login(
    @Body() body: { email: string; password: string; rememberMe?: boolean },
  ) {
    return await this.authService.login(body);
  }

  // 카카오 소셜 로그인
  // 프론트에서 카카오 인가 코드 받아서 여기로 보냄
  // 신규 유저면 자동으로 회원가입 처리됨
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
        expiresIn: 3600,
        user: { 
          email: 'kakao@kakao.com', 
          nickname: '(랜덤 생성)',
          nickname_jp: '(랜덤 생성)'
        },
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

  // LINE 소셜 로그인
  // 프론트에서 LINE 인가 코드 받아서 여기로 보냄
  // redirectUri는 LINE Developers 콘솔 설정이랑 똑같아야 함
  @Post('line')
  @ApiOperation({
    summary: 'LINE 로그인',
    description:
      'LINE 인가 코드로 로그인/회원가입. 신규 유저는 자동 가입됨',
  })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        code: {
          type: 'string',
          example: 'line_authorization_code_here',
          description: 'LINE OAuth에서 받은 인가 코드',
        },
        redirectUri: {
          type: 'string',
          example: 'http://localhost:3000/line/callback',
          description: 'LINE Developers 콘솔에 등록한 Callback URL (100% 일치 필요)',
        },
        language: {
          type: 'string',
          example: 'ko',
          description: '언어 설정 (ko/jp)',
        },
      },
      required: ['code', 'redirectUri'],
    },
  })
  @ApiResponse({
    status: 200,
    description: 'LINE 로그인 성공',
    schema: {
      example: {
        accessToken: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
        refreshToken: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
        expiresIn: 3600,
        user: { 
          email: 'U1234567890@line.me', 
          nickname: '(랜덤 생성)',
          nickname_jp: '(랜덤 생성)'
        },
      },
    },
  })
  @ApiResponse({ status: 500, description: 'LINE 인증 실패' })
  async lineLogin(@Body() body: LineLoginDto) {
    return await this.authService.loginWithLine(
      body.code, 
      body.redirectUri, 
      body.language
    );
  }

  // Access Token 만료되면 이거로 새로 발급받음
  // Refresh Token만 있으면 됨 (로그인 안해도 됨)
  // TODO: 프론트에서 axios interceptor로 자동 갱신 구현하면 좋음
  @Post('refresh')
  @ApiOperation({
    summary: '토큰 갱신',
    description: '로그인 시 발급받은 Refresh Token으로 새로운 Access Token을 발급받습니다. Access Token이 만료되었을 때 사용하세요.',
  })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        refreshToken: {
          type: 'string',
          example: '로그인 응답에서 받은 refreshToken 값을 입력하세요',
          description: '로그인 시 발급받은 Refresh Token',
        },
      },
      required: ['refreshToken'],
    },
  })
  @ApiResponse({
    status: 200,
    description: '토큰 갱신 성공',
    schema: {
      example: { accessToken: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...새로운토큰' },
    },
  })
  @ApiResponse({ status: 401, description: '유효하지 않거나 만료된 Refresh Token' })
  async refresh(@Body() body: { refreshToken: string }) {
    return await this.authService.refresh(body.refreshToken);
  }

  // 로그아웃 - DB에서 Refresh Token 삭제함
  // 주의: JWT 인증 필요 (Bearer 토큰 헤더에 넣어야 함)
  // 
  // TODO: 나중에 프론트에서 로그아웃 버튼 만들 때 사용
  // 사용법:
  // 1. 이 API 호출해서 서버에서 Refresh Token 삭제
  // 2. 클라이언트에서 쿠키 삭제 (Cookies.remove('accessToken'))
  // 3. 로그인 페이지로 리다이렉트 (router.push('/login'))
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
  async logout(@Request() req: { user: { id: number } }, @Res() res) {
    await this.authService.logout(req.user.id);
    // 쿠키 만료 헤더 내려주기
    res.clearCookie('refreshToken', { path: '/', httpOnly: true, secure: true });
    res.clearCookie('accessToken', { path: '/', httpOnly: true, secure: true });
    return res.status(200).json({ message: '로그아웃 되었습니다.' });
  }
}
