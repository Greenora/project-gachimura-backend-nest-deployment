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
import { ApiTags, ApiOperation, ApiBearerAuth, ApiResponse, ApiParam } from '@nestjs/swagger';
import { UsersService } from './users.service';
import { User } from './entities/user.entity';

// 유저 정보 조회 API
@ApiTags('Users')
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) { }

  // 내 프로필 조회 (JWT 인증 필요, DB에서 직접 조회)
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
    return this.usersService.findOne(req.user.id);
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

  // 내 프로필 수정
  @Patch('profile')
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary: '내 정보 수정',
    description: '로그인된 사용자의 프로필 정보를 수정합니다.',
  })
  updateProfile(
    @Request() req: { user: { id: number } },
    @Body() updateData: Partial<User>,
  ) {
    return this.usersService.update(req.user.id, updateData);
  }
}
