import { Transform, Type } from 'class-transformer';
import {
  IsDate,
  IsIn,
  IsLatitude,
  IsLongitude,
  IsOptional,
  IsString,
  Matches,
  MaxDate,
  MaxLength,
  MinDate,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { normalizePhone, parseBirthDate } from '../../common/member-details';

export class UpdateProfileDto {
  @ApiPropertyOptional({ example: '01012341234' })
  @Transform(({ value }) => normalizePhone(value))
  @IsOptional()
  @IsString()
  @Matches(/^0\d{8,10}$/, {
    message: '전화번호는 0으로 시작하는 9~11자리 숫자로 입력해주세요.',
  })
  phone?: string | null;

  @ApiPropertyOptional({ type: String, example: '1998-01-01' })
  @Transform(({ value }) => parseBirthDate(value))
  @IsOptional()
  @IsDate({ message: '생년월일을 실제 존재하는 날짜로 입력해주세요.' })
  @MinDate(new Date(1000, 0, 1), {
    message: '생년월일은 1000년 이후로 입력해주세요.',
  })
  @MaxDate(() => new Date(), { message: '생년월일은 미래 날짜일 수 없습니다.' })
  birthdate?: Date | null;

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
