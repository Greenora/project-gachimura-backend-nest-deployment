import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';
import { CreateUserDto } from '../../users/dto/create-user.dto';

export class SignupDto extends CreateUserDto {
  @ApiPropertyOptional({
    description: '이메일 인증 완료 후 발급받은 토큰',
  })
  @IsString()
  @IsOptional()
  emailVerificationToken?: string;
}
