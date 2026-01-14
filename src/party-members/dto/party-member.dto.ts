import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsNumber, IsString } from 'class-validator';

export class CreatePartyMemberDto {
  @ApiProperty({ description: '모임 ID', example: 1 })
  @IsNumber()
  partyId: number;

  @ApiProperty({ description: '유저 ID', example: 1 })
  @IsNumber()
  userId: number;
}

export class UpdatePartyMemberStatusDto {
  @ApiProperty({
    description: '상태 (APPROVED | REJECTED)',
    enum: ['APPROVED', 'REJECTED'],
    example: 'APPROVED',
  })
  @IsString()
  @IsEnum(['APPROVED', 'REJECTED'])
  status: string;
}
