import { Body, Controller, Get, Post, UseGuards, ValidationPipe } from '@nestjs/common'; 
import { UsersService } from './users.service'; 
import { CreateUserDto } from './dto/create-user.dto';
import { KakaoLoginDto } from './dto/kakao-login.dto';
import { AuthGuard } from '@nestjs/passport';
import { Request } from '@nestjs/common';

@Controller('users')
export class UsersController {
  constructor(private usersService: UsersService) {}

  @Post('/signup')
  async signUp(@Body(ValidationPipe) createUserDto: CreateUserDto): Promise<string> {
    await this.usersService.signUp(createUserDto);
    return '회원가입이 완료되었습니다.';
  }

  @Post('/kakao')
  async kakaoLogin(@Body() KakaoLoginDto: KakaoLoginDto) {
    return await this.usersService.kakaoLogin(KakaoLoginDto.kakaoAccessToken);
  }

  @UseGuards(AuthGuard('jwt'))
  @Get('profile')
  getProfile(@Request() req) {
    return req.user;
  }
}