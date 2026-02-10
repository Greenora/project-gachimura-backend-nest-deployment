import { IsNotEmpty, IsString } from 'class-validator';

// 카카오 로그인 요청 데이터 (프론트에서 받은 카카오 토큰 전달)
export class KakaoLoginDto {
  @IsString()
  @IsNotEmpty()
  kakaoAccessToken: string;
}
