import { ApiProperty } from '@nestjs/swagger';

export class CreateReviewDto {
  @ApiProperty({ description: '모임 ID' })
  partyId: number;

  @ApiProperty({ description: '평가받는 유저 ID' })
  revieweeId: number;

  @ApiProperty({ description: '점수 (-4, -2, 0, 2, 4)' })
  score: number;
}
