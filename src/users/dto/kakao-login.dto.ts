import { IsNotEmpty, IsString } from 'class-validator';

export class KakaoLoginDto {
  @IsString()
  @IsNotEmpty()
  kakaoAccessToken: string; // 프론트에서 받은 토큰
}