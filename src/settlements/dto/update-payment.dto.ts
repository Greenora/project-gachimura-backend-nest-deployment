import { IsIn, IsInt, Min } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class UpdatePaymentDto {
  @ApiProperty({ description: '대상 유저 ID', example: 2 })
  @IsInt()
  @Min(1)
  userId: number;

  @ApiProperty({ description: '상태 (PAID)', example: 'PAID' })
  @IsIn(['PAID'])
  status: 'PAID';
}
