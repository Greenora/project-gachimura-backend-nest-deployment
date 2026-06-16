import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';
import { COMMUNITY_LOCALES } from '../community-locale.constants';
import type { CommunityLocale } from '../community-locale.constants';

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

  @ApiProperty({
    description: '커뮤니티 언어 구분',
    enum: COMMUNITY_LOCALES,
    required: false,
    default: 'ko',
  })
  @IsOptional()
  @IsIn(COMMUNITY_LOCALES)
  locale?: CommunityLocale;

  @ApiProperty({
    description: '게시글에 연결할 작성자 본인의 모임 ID',
    example: 12,
    required: false,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  linkedPartyId?: number | null;
}
