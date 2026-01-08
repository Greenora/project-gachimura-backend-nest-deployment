import { ApiProperty } from '@nestjs/swagger';

export class CreatePartyMemberDto {
  @ApiProperty({ description: '모임 ID', example: 1 })
  partyId: number;

  @ApiProperty({ description: '유저 ID', example: 1 })
  userId: number;
}

export class UpdatePartyMemberStatusDto {
  @ApiProperty({
    description: '상태 (APPROVED | REJECTED)',
    enum: ['APPROVED', 'REJECTED'],
    example: 'APPROVED',
  })
  status: string;
}
