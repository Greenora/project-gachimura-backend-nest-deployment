import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class CreateCommunityCommentDto {
  @ApiProperty({
    description: '댓글 내용',
    example: '저도 오늘 갔다 왔는데 할인 좋았어요.',
    maxLength: 300,
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(300)
  content: string;
}
