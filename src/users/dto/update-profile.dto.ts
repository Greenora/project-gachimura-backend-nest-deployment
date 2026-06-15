import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  Matches,
} from 'class-validator';

export class UpdateProfileDto {
  @ApiPropertyOptional({
    example: 35.8714,
    description: '위도',
  })
  @IsOptional()
  @IsNumber({}, { message: '위도는 숫자여야 합니다.' })
  @Min(-90, { message: '위도는 -90 이상이어야 합니다.' })
  @Max(90, { message: '위도는 90 이하여야 합니다.' })
  latitude?: number;

  @ApiPropertyOptional({
    example: 128.6014,
    description: '경도',
  })
  @IsOptional()
  @IsNumber({}, { message: '경도는 숫자여야 합니다.' })
  @Min(-180, { message: '경도는 -180 이상이어야 합니다.' })
  @Max(180, { message: '경도는 180 이하여야 합니다.' })
  longitude?: number;

  @ApiPropertyOptional({
    example: '대구광역시',
    description: '지역(시/도)',
  })
  @IsOptional()
  @IsString({ message: '지역은 문자열이어야 합니다.' })
  region?: string;

  @ApiPropertyOptional({
    example: '수성구',
    description: '지역구(구/군)',
  })
  @IsOptional()
  @IsString({ message: '지역구는 문자열이어야 합니다.' })
  district?: string;

  @ApiPropertyOptional({
    example: '088',
    description: '은행 코드',
  })
  @IsOptional()
  @IsString({ message: '은행 코드는 문자열이어야 합니다.' })
  bankCode?: string;

  @ApiPropertyOptional({
    example: '신한은행',
    description: '은행명',
  })
  @IsOptional()
  @IsString({ message: '은행명은 문자열이어야 합니다.' })
  bankName?: string;

  @ApiPropertyOptional({
    example: '110123456789',
    description: '계좌번호',
  })
  @IsOptional()
  @IsString({ message: '계좌번호는 문자열이어야 합니다.' })
  @Matches(/^[0-9]*$/, { message: '계좌번호는 숫자만 입력해야 합니다.' })
  accountNumber?: string;

  @ApiPropertyOptional({
    example: '김철수',
    description: '예금주',
  })
  @IsOptional()
  @IsString({ message: '예금주는 문자열이어야 합니다.' })
  accountHolder?: string;

  @ApiPropertyOptional({
    example: '행복한 고양이',
    description: '닉네임',
  })
  @IsOptional()
  @IsString({ message: '닉네임은 문자열이어야 합니다.' })
  @IsNotEmpty({ message: '닉네임은 비어 있을 수 없습니다.' })
  @MaxLength(10, { message: '닉네임은 10자 이하여야 합니다.' })
  nickname?: string;

  @ApiPropertyOptional({
    example: '楽しい猫',
    description: '일본어 닉네임',
  })
  @IsOptional()
  @IsString({ message: '일본어 닉네임은 문자열이어야 합니다.' })
  @IsNotEmpty({ message: '일본어 닉네임은 비어 있을 수 없습니다.' })
  @MaxLength(10, { message: '일본어 닉네임은 10자 이하여야 합니다.' })
  nickname_jp?: string;
}
