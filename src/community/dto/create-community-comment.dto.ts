import { ApiProperty } from '@nestjs/swagger';
import {
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { COMMUNITY_LOCALES } from '../community-locale.constants';
import type { CommunityLocale } from '../community-locale.constants';

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

  @ApiProperty({
    description: '커뮤니티 언어 구분',
    enum: COMMUNITY_LOCALES,
    required: false,
    default: 'ko',
  })
  @IsOptional()
  @IsIn(COMMUNITY_LOCALES)
  locale?: CommunityLocale;
}
