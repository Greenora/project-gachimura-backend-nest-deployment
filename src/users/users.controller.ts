import {
  Controller,
  Get,
  Patch,
  Body,
  UseGuards,
  Request,
  Param,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiResponse, ApiParam, ApiBody } from '@nestjs/swagger';
import { UsersService } from './users.service';

// 유저 정보 조회 API
@ApiTags('Users')
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  // 내 프로필 조회 (JWT 인증 필요, req.user에 자동으로 담김)
  @Get('profile')
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary: '내 정보 조회',
    description: '로그인된 사용자의 프로필 정보를 조회합니다. Authorization 헤더에 Bearer 토큰이 필요합니다.',
  })
  @ApiResponse({
    status: 200,
    description: '프로필 조회 성공',
    schema: {
      example: {
        id: 1,
        email: 'user@example.com',
        nickname: '행복한 고양이',
        nickname_jp: '楽しい 猫',
        profileImage: null,
        provider: 'LOCAL',
      },
    },
  })
  @ApiResponse({ status: 401, description: '인증 실패 - 유효하지 않은 토큰' })
  async getProfile(@Request() req: { user: { id: number; email: string; nickname: string } }) {
    // DB에서 최신 유저 정보 조회 (nickname_jp 포함)
    const user = await this.usersService.findOne(req.user.id);
    if (!user) {
      return req.user;
    }
    return {
      id: user.id,
      email: user.email,
      nickname: user.nickname,
      nickname_jp: user.nickname_jp,
      profileImage: user.profileImage,
      provider: user.provider,
    };
  }

  @Patch('profile')
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary: '프로필(위치) 수정',
    description: '유저의 위치 정보(latitude, longitude, region, district)를 업데이트합니다.',
  })
  @ApiBody({
    schema: {
      example: {
        latitude: 35.8714,
        longitude: 128.6014,
        region: '대구광역시',
        district: '수성구',
      },
    },
  })
  @ApiResponse({ status: 200, description: '업데이트 성공' })
  async updateProfile(@Request() req, @Body() updateData: any) {
    // req.user.id는 토큰에서 추출한 내 ID
    // updateData에는 { latitude, longitude, region, district }가 들어옴
    return this.usersService.updateLocation(req.user.id, updateData);
  }

  // 특정 유저 조회 (로그인 불필요, 공개 정보만 반환)
  @Get(':id')
  @ApiOperation({
    summary: '특정 유저 조회',
    description: 'ID를 기반으로 특정 유저의 공개 정보를 가져옵니다.',
  })
  @ApiParam({
    name: 'id',
    type: 'number',
    description: '조회할 유저의 ID',
    example: 1,
  })
  @ApiResponse({
    status: 200,
    description: '유저 조회 성공',
    schema: {
      example: {
        id: 1,
        email: 'user@example.com',
        nickname: '행복한 고양이',
        profileImage: null,
      },
    },
  })
  @ApiResponse({ status: 404, description: '해당 ID의 유저를 찾을 수 없음' })
  findOne(@Param('id') id: string) {
    return this.usersService.findOne(+id);
  }
}
