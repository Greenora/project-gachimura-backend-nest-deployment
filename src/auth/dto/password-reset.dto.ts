import { IsEmail, IsString, Matches, MaxLength } from 'class-validator';

export class RequestPasswordResetDto {
  @IsEmail()
  @MaxLength(255)
  email: string;
}

export class ResetPasswordDto {
  @IsString()
  @Matches(/^[a-f0-9]{64}$/)
  token: string;

  @IsString()
  @MaxLength(72)
  @Matches(/^(?=.*[A-Za-z])(?=.*\d)[A-Za-z\d]{6,}$/)
  password: string;
}
