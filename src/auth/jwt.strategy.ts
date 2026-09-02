import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';

/**
 * 프론트에서 Bearer 토큰으로 API 요청할 때 이 클래스가 토큰을 검증함
 * @UseGuards(AuthGuard('jwt')) 데코레이터 쓰면 이 클래스가 작동함
 *
 * 작동 순서:
 * 1. 요청 헤더에서 "Authorization: Bearer <토큰>" 추출
 * 2. JWT_SECRET으로 토큰 복호화 (암호 풀기)
 * 3. 토큰이 유효하면 validate() 함수 실행
 * 4. validate()가 반환한 값을 req.user에 저장
 * 5. 컨트롤러에서 @Request() req 쓰면 req.user로 접근 가능
 */
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private configService: ConfigService) {
    super({
      // 토큰을 어디서 찾을지 설정
      // 헤더의 "Authorization: Bearer <토큰>" 형식에서 추출함
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),

      // 만료된 토큰 허용 안함 (false = 거절)
      // true로 하면 만료된 토큰도 통과시켜버림 (보안상 위험)
      ignoreExpiration: false,

      // 토큰 암호 풀 때 사용할 비밀키
      // 로그인할 때 토큰 만들 때 쓴 키랑 똑같아야 함
      secretOrKey:
        configService.get<string>('JWT_SECRET') ||
        'gachimura_jwt_secret_key_default',
    });
  }

  /**
   * 토큰 검증 성공하면 자동으로 실행되는 함수
   *
   * @param payload - 토큰 안에 들어있던 데이터 (로그인할 때 넣었던 정보)
   *                  예: { email: 'user@test.com', sub: 1, nickname: '닉네임' }
   * @returns req.user에 저장될 유저 정보
   */
  async validate(payload: any) {
    // payload 없으면 잘못된 토큰
    if (!payload) {
      throw new UnauthorizedException('유효하지 않은 토큰입니다');
    }

    // 이 return 값이 컨트롤러에서 req.user로 들어감
    // sub는 유저 ID (subject의 약자)
    return {
      id: payload.sub, // 유저 ID
      email: payload.email, // 유저 이메일
      nickname: payload.nickname, // 유저 닉네임
    };
  }
}
