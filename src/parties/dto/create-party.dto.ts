import { ApiProperty } from '@nestjs/swagger';
import {
  IsNotEmpty,
  IsOptional,
  IsString,
  IsNumberString,
} from 'class-validator';

export class CreatePartyDto {
  @ApiProperty({
    description: '모임 제목',
    example: '[costco] 연어 필렛 같이 사실 분',
  })
  @IsString()
  @IsNotEmpty()
  title: string;

  @ApiProperty({
    description: '모임 상세 설명',
    example: '코스트코 대구점에서 연어 같이 사실 분 구해요!',
    required: false,
  })
  @IsString()
  @IsOptional()
  content?: string;

  @ApiProperty({
    description: '마트 이름',
    example: '코스트코 대구점',
    required: false,
  })
  @IsString()
  @IsOptional()
  store_name?: string;

  @ApiProperty({
    description: '상세 주소',
    example: '서울 성동구 뚝섬로 379',
    required: false,
  })
  @IsString()
  @IsOptional()
  address?: string;

  @ApiProperty({
    description: '위도',
    example: 37.5399,
    required: false,
  })
  @IsOptional()
  @IsNumberString()
  latitude?: number;

  @ApiProperty({
    description: '경도',
    example: 127.0536,
    required: false,
  })
  @IsOptional()
  @IsNumberString()
  longitude?: number;

  @ApiProperty({
    description: '모임 날짜',
    example: '2026-02-04',
  })
  @IsString()
  @IsNotEmpty()
  meetingDate: string;

  @ApiProperty({
    description: '모임 시간',
    example: '13:00',
  })
  @IsString()
  @IsNotEmpty()
  meetingTime: string;

  @ApiProperty({
    type: 'string',
    format: 'binary',
    description: '모임 대표 이미지',
    required: false,
  })
  @IsOptional()
  thumbnail_image?: any;
}
