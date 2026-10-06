import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsString, IsOptional } from 'class-validator';

export class RecommendRecipeDto {
  @ApiProperty({
    description: '보유한 식재료 목록',
    example: ['토마토', '계란', '대파'],
    type: [String],
  })
  @IsArray()
  @IsString({ each: true })
  ingredients: string[];

  @ApiProperty({
    description: '사용자 요청 메시지',
    example: '냉장고에 있는 재료로 간단하게 만들 수 있는 요리 추천해줘',
  })
  @IsString()
  message: string;

  @ApiProperty({
    description: '응답 언어 (korean 또는 japanese)',
    example: 'korean',
    required: false,
    enum: ['korean', 'japanese'],
    default: 'korean',
  })
  @IsString()
  @IsOptional()
  lang?: string;
}
