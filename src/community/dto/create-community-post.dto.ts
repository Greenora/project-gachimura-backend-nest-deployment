import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class CreateCommunityPostDto {
  @ApiProperty({
    description: '커뮤니티 게시글 내용(원문 그대로 저장)',
    example: '북구 코스트코 오늘 연어 할인 들어왔어요.',
    maxLength: 500,
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  content: string;
}
