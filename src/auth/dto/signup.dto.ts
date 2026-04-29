import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';
import { CreateUserDto } from '../../users/dto/create-user.dto';

export class SignupDto extends CreateUserDto {
  @ApiProperty({
    description: '이메일 인증 완료 후 발급받은 토큰',
  })
  @IsString()
  @IsNotEmpty({ message: '이메일 인증 토큰이 필요합니다.' })
  emailVerificationToken: string;
}
