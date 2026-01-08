import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private configService: ConfigService) {
    super({
      // 프론트엔드가 보낸 토큰을 어디서 찾을까? -> 헤더의 Bearer 토큰에서!
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      // 만료된 토큰은 거절할까? -> 네 (false)
      ignoreExpiration: false,
      // 암호 풀 때 쓸 비밀키 (환경변수에서 가져옴)
      secretOrKey: configService.get<string>('JWT_SECRET'),
    });
  }

  // 토큰 검사가 성공하면 이 함수가 실행됨
  async validate(payload: any) {
    // payload: 토큰 안에 들어있던 정보 (email, sub 등)
    if (!payload) {
      throw new UnauthorizedException();
    }
    // req.user에 이 정보를 넣어줌 -> 이제 컨트롤러에서 쓸 수 있음
    return {
      id: payload.sub,
      email: payload.email,
      nickname: payload.nickname,
    };
  }
}
