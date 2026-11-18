import {
  IsEmail,
  IsDate,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxDate,
  MinDate,
  MinLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { normalizePhone, parseBirthDate } from '../../common/member-details';

// 회원가입 요청 데이터 (class-validator로 자동 검증)
export class CreateUserDto {
  @ApiProperty({
    example: 'user@example.com',
    description: '사용자 이메일 주소',
  })
  @IsEmail({}, { message: '이메일 형식이 올바르지 않습니다.' })
  @IsNotEmpty({ message: '이메일을 입력해주세요.' })
  email: string;

  @ApiPropertyOptional({
    example: 'password123',
    description: '비밀번호 (영문+숫자 6자 이상). 소셜 로그인 시 불필요',
  })
  @IsOptional()
  @IsString()
  @MinLength(6, { message: '비밀번호는 최소 6자 이상이어야 합니다.' })
  @Matches(/^(?=.*[A-Za-z])(?=.*\d)[A-Za-z\d]{6,}$/, {
    message: '비밀번호는 영문과 숫자를 포함해야 합니다.',
  })
  password?: string;

  @ApiPropertyOptional({
    example: '01012345678',
    description: '전화번호 (하이픈·공백 허용, 저장 시 제거)',
  })
  @Transform(({ value }) => normalizePhone(value))
  @IsOptional()
  @IsString()
  @Matches(/^0\d{8,10}$/, {
    message: '전화번호는 0으로 시작하는 9~11자리 숫자로 입력해주세요.',
  })
  phone?: string | null;

  @ApiPropertyOptional({
    type: String,
    example: '1998-01-01',
    description: '생년월일 YYYY-MM-DD (기존 YYMMDD도 허용)',
  })
  @Transform(({ value }) => parseBirthDate(value))
  @IsOptional()
  @IsDate({ message: '생년월일을 실제 존재하는 날짜로 입력해주세요.' })
  @MinDate(new Date(1000, 0, 1), {
    message: '생년월일은 1000년 이후로 입력해주세요.',
  })
  @MaxDate(() => new Date(), { message: '생년월일은 미래 날짜일 수 없습니다.' })
  birthdate?: Date | null;

  @ApiPropertyOptional({
    description: '닉네임 (미입력시 랜덤 생성)',
  })
  @IsOptional()
  @IsString()
  nickname?: string;

  @ApiPropertyOptional({
    example: 'ko',
    description: '언어 설정 (ko: 한국어, jp: 일본어)',
  })
  @IsOptional()
  @IsString()
  language?: string;
}
