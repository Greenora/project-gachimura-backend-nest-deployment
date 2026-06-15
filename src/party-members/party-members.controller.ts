import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  Req,
  UseGuards,
  ParseIntPipe,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { PartyMembersService } from './party-members.service';
import {
  ApiTags,
  ApiOperation,
  ApiBody,
  ApiParam,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { UpdatePartyMemberStatusDto } from './dto/party-member.dto';

@ApiTags('Parties')
@ApiBearerAuth('access-token')
@UseGuards(AuthGuard('jwt'))
@Controller('party-members')
export class PartyMembersController {
  constructor(private readonly partyMembersService: PartyMembersService) {}

  @Get(':partyId')
  @ApiOperation({
    summary: '모임 멤버 목록 조회',
    description:
      '특정 모임에 참여 중인 유저 목록과 그들의 상세 정보를 가져옵니다.',
  })
  @ApiParam({ name: 'partyId', example: 1, description: '모임 ID' })
  @ApiResponse({
    status: 200,
    description: '멤버 목록 조회 성공',
    schema: {
      example: [
        {
          id: 1,
          status: 'APPROVED',
          joinedAt: '2026-02-10T12:00:00.000Z',
          user: {
            id: 1,
            nickname: '근사한 백조',
            profileImage: null,
          },
        },
      ],
    },
  })
  @ApiResponse({ status: 401, description: '인증되지 않은 요청' })
  @ApiResponse({ status: 403, description: '모임 멤버가 아닌 사용자' })
  findAll(
    @Param('partyId', ParseIntPipe) partyId: number,
    @Req() req: { user: { id: number } },
  ) {
    return this.partyMembersService.findAllByParty(partyId, req.user.id);
  }

  @Post(':partyId/:userId')
  @ApiOperation({
    summary: '모임 가입 신청',
    description: '특정 모임에 가입을 신청합니다. 초기 상태는 PENDING입니다.',
  })
  @ApiParam({ name: 'partyId', example: 1, description: '모임 ID' })
  @ApiParam({ name: 'userId', example: 1, description: '유저 ID' })
  @ApiResponse({
    status: 201,
    description: '가입 신청 성공',
    schema: {
      example: {
        id: 1,
        partyId: 1,
        userId: 1,
        status: 'PENDING',
        joinedAt: '2026-02-10T12:00:00.000Z',
      },
    },
  })
  @ApiResponse({ status: 401, description: '인증되지 않은 요청' })
  @ApiResponse({
    status: 403,
    description: '다른 사용자를 대신한 가입 신청',
  })
  create(
    @Param('partyId', ParseIntPipe) partyId: number,
    @Param('userId', ParseIntPipe) userId: number,
    @Req() req: { user: { id: number } },
  ) {
    return this.partyMembersService.create(partyId, userId, req.user.id);
  }

  @Patch(':partyId/:userId/status')
  @ApiOperation({
    summary: '모임 멤버 상태 변경',
    description: '방장이 멤버의 상태를 APPROVE 또는 REJECT로 변경합니다.',
  })
  @ApiParam({ name: 'partyId', example: 1, description: '모임 ID' })
  @ApiParam({ name: 'userId', example: 1, description: '유저 ID' })
  @ApiBody({ type: UpdatePartyMemberStatusDto })
  @ApiResponse({
    status: 200,
    description: '상태 변경 성공',
    schema: {
      example: {
        id: 1,
        status: 'APPROVED',
      },
    },
  })
  @ApiResponse({ status: 401, description: '인증되지 않은 요청' })
  @ApiResponse({ status: 403, description: '방장이 아닌 사용자' })
  updateStatus(
    @Param('partyId', ParseIntPipe) partyId: number,
    @Param('userId', ParseIntPipe) userId: number,
    @Body() updateDto: UpdatePartyMemberStatusDto,
    @Req() req: { user: { id: number } },
  ) {
    return this.partyMembersService.updateStatus(
      partyId,
      userId,
      updateDto.status,
      req.user.id,
    );
  }

  @Delete(':partyId/:userId')
  @ApiOperation({
    summary: '모임 멤버 삭제',
    description: '특정 모임에서 특정 유저를 강퇴합니다.',
  })
  @ApiParam({ name: 'partyId', example: 1, description: '모임 ID' })
  @ApiParam({ name: 'userId', example: 1, description: '유저 ID' })
  @ApiResponse({
    status: 200,
    description: '멤버 삭제 성공',
    schema: {
      example: {
        success: true,
        message: '모임 멤버 삭제 성공',
        data: { partyId: 1, userId: 1 },
      },
    },
  })
  @ApiResponse({ status: 401, description: '인증되지 않은 요청' })
  @ApiResponse({ status: 403, description: '방장이 아닌 사용자' })
  async remove(
    @Param('partyId', ParseIntPipe) partyId: number,
    @Param('userId', ParseIntPipe) userId: number,
    @Req() req: { user: { id: number } },
  ) {
    const result = await this.partyMembersService.remove(
      partyId,
      userId,
      req.user.id,
    );

    if (result.affected === 0) {
      return { success: false, message: '해당하는 멤버를 찾을 수 없습니다.' };
    }

    return {
      success: true,
      message: '모임 멤버 삭제 성공',
      data: { partyId, userId },
    };
  }
}
