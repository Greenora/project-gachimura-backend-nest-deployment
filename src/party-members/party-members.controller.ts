import { Controller, Get, Post, Patch, Delete, Param, Body } from '@nestjs/common';
import { PartyMembersService } from './party-members.service';
import { ApiTags, ApiOperation, ApiBody } from '@nestjs/swagger';
import { UpdatePartyMemberStatusDto } from './dto/party-member.dto';

@ApiTags('party')
@Controller('party-members')
export class PartyMembersController {
  constructor(private readonly partyMembersService: PartyMembersService) { }

  @Get(':partyId')
  @ApiOperation({ summary: '모임 멤버 목록 조회', description: '특정 모임에 참여 중인 유저 목록과 그들의 상세 정보를 가져옵니다.' })
  findAll(@Param('partyId') partyId: number) {
    return this.partyMembersService.findAllByParty(partyId);
  }

  @Post(':partyId/:userId')
  @ApiOperation({ summary: '모임 가입 신청', description: '특정 모임에 가입을 신청합니다. 초기 상태는 PENDING입니다.' })
  create(@Param('partyId') partyId: number, @Param('userId') userId: number) {
    return this.partyMembersService.create(partyId, userId);
  }

  @Patch(':partyId/:userId/status')
  @ApiOperation({ summary: '모임 멤버 상태 변경', description: '방장이 멤버의 상태를 APPROVE 또는 REJECT로 변경합니다.' })
  @ApiBody({ type: UpdatePartyMemberStatusDto })
  updateStatus(
    @Param('partyId') partyId: number,
    @Param('userId') userId: number,
    @Body() updateDto: UpdatePartyMemberStatusDto
  ) {
    return this.partyMembersService.updateStatus(partyId, userId, updateDto.status);
  }

  @Delete(':partyId/:userId')
  @ApiOperation({ summary: '모임 멤버 삭제', description: '특정 모임에서 특정 유저를 강퇴합니다.' })
  async remove(@Param('partyId') partyId: number, @Param('userId') userId: number) {
    const result = await this.partyMembersService.remove(partyId, userId);

    if (result.affected === 0) {
      return { success: false, message: '해당하는 멤버를 찾을 수 없습니다.' };
    }

    return {
      success: true,
      message: '모임 멤버 삭제 성공',
      data: { partyId, userId }
    };
  }
}
