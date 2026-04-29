import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty, Matches } from 'class-validator';

export class VerifyEmailVerificationDto {
  @ApiProperty({
    example: 'user@gmail.com',
    description: '인증한 이메일',
  })
  @IsEmail({}, { message: '이메일 형식이 올바르지 않습니다.' })
  @IsNotEmpty({ message: '이메일을 입력해주세요.' })
  email: string;

  @ApiProperty({
    example: '123456',
    description: '6자리 인증 코드',
  })
  @Matches(/^\d{6}$/, { message: '인증 코드는 숫자 6자리여야 합니다.' })
  code: string;
}
