import { IsInt, Min } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateSettlementDto {
  @ApiProperty({ description: '모임 ID', example: 1 })
  @IsInt()
  @Min(1)
  partyId: number;
}
