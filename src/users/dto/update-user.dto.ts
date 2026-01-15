import { PartialType } from '@nestjs/mapped-types';
import { CreateUserDto } from './create-user.dto';
import { IsNotEmpty, IsString, MaxLength, IsOptional } from 'class-validator';

export class UpdateUserDto extends PartialType(CreateUserDto) {
  // 닉네임 수정
  @IsOptional()
  @IsString()
  @IsNotEmpty({ message: '닉네임을 입력해주세요.' })
  @MaxLength(10, { message: '닉네임은 10자 이하여야 합니다.' })
  nickname: string;
}
