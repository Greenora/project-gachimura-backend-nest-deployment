import { IsNumber, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class UpdatePaymentDto {
  @ApiProperty({ description: '대상 유저 ID', example: 2 })
  @IsNumber()
  userId: number;

  @ApiProperty({ description: '상태 (PAID)', example: 'PAID' })
  @IsString()
  status: string;
}
