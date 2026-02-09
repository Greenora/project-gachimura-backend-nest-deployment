import { IsString, IsOptional, IsNumber, IsDateString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreatePartyDto {
  @ApiProperty({ description: '모임 제목' })
  @IsString()
  title: string;

  @ApiProperty({ description: '모임 내용', required: false })
  @IsString()
  @IsOptional()
  content?: string;

  @ApiProperty({ description: '가게 이름', required: false })
  @IsString()
  @IsOptional()
  storeName?: string;

  @ApiProperty({ description: '주소 (한국어)', required: false })
  @IsString()
  @IsOptional()
  addressKo?: string;

  @ApiProperty({ description: '주소 (일본어)', required: false })
  @IsString()
  @IsOptional()
  addressJp?: string;

  @ApiProperty({ description: '위도', required: false })
  @IsNumber()
  @IsOptional()
  latitude?: number;

  @ApiProperty({ description: '경도', required: false })
  @IsNumber()
  @IsOptional()
  longitude?: number;

  @ApiProperty({ description: '모임 시간', required: false })
  @IsDateString()
  @IsOptional()
  meetDate?: string;
}
