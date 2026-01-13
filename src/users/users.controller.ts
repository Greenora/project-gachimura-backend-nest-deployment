import {
  Body,
  Controller,
  Get,
  Post,
  UseGuards,
  ValidationPipe,
  Request,
  Param,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { UsersService } from './users.service';
import { CreateUserDto } from './dto/create-user.dto';
import { KakaoLoginDto } from './dto/kakao-login.dto';

@ApiTags('users')
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  // 회원가입
  @ApiOperation({ summary: '회원가입' })
  @Post('/signup')
  async signUp(
    @Body(ValidationPipe) createUserDto: CreateUserDto,
  ): Promise<{ message: string }> {
    await this.usersService.signUp(createUserDto);
    return { message: '회원가입이 완료되었습니다.' };
  }

  // 카카오 로그인
  @ApiOperation({ summary: '카카오 로그인' })
  @Post('/kakao')
  async kakaoLogin(@Body() kakaoLoginDto: KakaoLoginDto) {
    return await this.usersService.kakaoLogin(kakaoLoginDto.kakaoAccessToken);
  }

  // 내 프로필 조회 (로그인 필수)
  @ApiOperation({
    summary: '내 정보 조회',
    description: 'JWT 토큰이 필요합니다.',
  })
  @UseGuards(AuthGuard('jwt'))
  @Get('profile')
  getProfile(@Request() req) {
    return req.user;
  }

  // 특정 유저 ID로 조회
  @Get(':id')
  @ApiOperation({
    summary: '특정 유저 조회',
    description: 'ID를 기반으로 특정 유저의 상세 정보를 가져옵니다.',
  })
  findOne(@Param('id') id: string) {
    return this.usersService.findOne(+id);
  }
}
