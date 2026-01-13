import {
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MinLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

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
    description: '전화번호 (하이픈 없이)',
  })
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiPropertyOptional({
    example: '980101',
    description: '생년월일 6자리 (YYMMDD)',
  })
  @IsOptional()
  @IsString()
  birthdate?: string;

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
