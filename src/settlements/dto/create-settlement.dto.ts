import { IsNumber } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateSettlementDto {
  @ApiProperty({ description: '모임 ID', example: 1 })
  @IsNumber()
  partyId: number;
}
