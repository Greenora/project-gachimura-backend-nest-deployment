import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsNotEmpty } from 'class-validator';

export class CreateReviewDto {
  @ApiProperty({ description: '모임 ID' })
  @IsInt()
  @IsNotEmpty()
  partyId: number;

  @ApiProperty({ description: '평가받는 유저 ID' })
  @IsInt()
  @IsNotEmpty()
  revieweeId: number;

  @ApiProperty({ description: '점수 (-4, -2, 0, 2, 4)' })
  @IsInt()
  @IsNotEmpty()
  score: number;
}
