import { Type } from 'class-transformer';
import {
  IsIn,
  IsLatitude,
  IsLongitude,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateProfileDto {
  @ApiPropertyOptional({ example: 35.8714 })
  @IsOptional()
  @Type(() => Number)
  @IsLatitude()
  latitude?: number;

  @ApiPropertyOptional({ example: 128.6014 })
  @IsOptional()
  @Type(() => Number)
  @IsLongitude()
  longitude?: number;

  @ApiPropertyOptional({ example: '대구광역시' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  region?: string | null;

  @ApiPropertyOptional({ example: '수성구' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  district?: string | null;

  @ApiPropertyOptional({ example: '088' })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  bankCode?: string | null;

  @ApiPropertyOptional({ example: 'KR', enum: ['KR', 'JP'] })
  @IsOptional()
  @IsIn(['KR', 'JP'])
  accountCountry?: 'KR' | 'JP' | null;

  @ApiPropertyOptional({ example: '신한은행' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  bankName?: string | null;

  @ApiPropertyOptional({ example: '新宿支店' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  bankBranchName?: string | null;

  @ApiPropertyOptional({ example: '123' })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  bankBranchCode?: string | null;

  @ApiPropertyOptional({ example: 'FUTSU', enum: ['FUTSU', 'TOZA'] })
  @IsOptional()
  @IsIn(['FUTSU', 'TOZA'])
  accountType?: 'FUTSU' | 'TOZA' | null;

  @ApiPropertyOptional({ example: '110123456789' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  accountNumber?: string | null;

  @ApiPropertyOptional({ example: '홍길동' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  accountHolder?: string | null;

  @ApiPropertyOptional({ example: '행복한 고양이' })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  nickname?: string;

  @ApiPropertyOptional({ example: '幸せな猫' })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  nickname_jp?: string | null;
}
