import { IsIn, IsNotEmpty, IsOptional, IsString } from 'class-validator';

// 프론트가 카카오 콜백에서 받은 인가 코드를 백엔드로 전달한다.
export class KakaoLoginDto {
  @IsString()
  @IsNotEmpty()
  code: string;

  @IsString()
  @IsNotEmpty()
  redirectUri: string;

  @IsOptional()
  @IsIn(['ko', 'jp'])
  language?: string;
}
