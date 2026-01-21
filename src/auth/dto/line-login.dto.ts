import { IsNotEmpty, IsString, IsOptional} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

/**
 * LineLoginDto - LINE 로그인 API 요청 데이터
 * 
 * OAuth 2.0 Authorization Code 방식에서 사용
 * 프론트가 콜백 URL에서 받은 인가 코드를 백엔드로 전달할 때 사용
 */
export class LineLoginDto {
    /**
     * LINE 인가 코드 (Authorization Code)
     * 
     * 프론트가 LINE 서버로부터 콜백 URL로 받은 code 파라미터
     * 백엔드는 이 코드를 LINE 서버에 전달해서 Access Token으로 교환함
     * 
     * 주의: 이 코드는 1회용이고 5분 정도만 유효함
     */
    @ApiProperty({ description: 'LINE 인가 코드 (Callback URL에서 획득)'})
    @IsNotEmpty()
    @IsString()
    code: string;

    /**
     * 리다이렉트 URI (Redirect URI)
     * 
     * LINE Developers 콘솔에 등록한 콜백 URL
     * 프론트에서 사용한 redirect_uri와 100% 일치해야 함
     * 안맞으면 LINE 서버가 에러 반환
     * 
     * 예: http://localhost:3000/line/callback
     */
    @ApiProperty({ description: '리다이렉트 URI (프론트랑 일치해야 함)'})
    @IsNotEmpty()
    @IsString()
    redirectUri: string;

    /**
     * 언어 설정 - 선택 입력
     * 
     * 'ko': 한국어 닉네임 생성
     * 'jp': 일본어 닉네임 생성
     * 기본값: 'ko'
     */
    @ApiProperty({ description: '언어 설정 (ko: 한국어, jp: 일본어)'})
    @IsOptional()
    @IsString()
    language?: string;
}