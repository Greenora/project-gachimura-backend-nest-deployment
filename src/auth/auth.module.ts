import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtStrategy } from './jwt.strategy';
import { UsersModule } from '../users/users.module';
import { EmailVerification } from './entities/email-verification.entity';

/**
 * Auth 모듈 - 인증 관련 기능들을 한데 모아놓음
 * NestJS는 모듈 단위로 기능을 관리함
 * 이 모듈은 로그인, 회원가입, 토큰 관리 등을 담당함
 */
@Module({
  imports: [
    UsersModule, // 유저 정보 가져올 때 필요해서 import
    PassportModule, // JWT 인증 라이브러리
    TypeOrmModule.forFeature([EmailVerification]),
    
    // JWT 모듈 설정 - 토큰 만들고 검증하는 기능
    JwtModule.registerAsync({
      imports: [ConfigModule], // 환경변수(.env) 읽으려고
      inject: [ConfigService], // ConfigService 주입받아서 사용
      useFactory: async (configService: ConfigService) => ({
        // 토큰 암호화할 때 사용할 비밀키 (절대 노출되면 안됨)
        secret: configService.get<string>('JWT_SECRET'),
        // 토큰 옵션 설정
        signOptions: { 
          expiresIn: '10s' // Access Token은 1시간만 유효 (보안상 짧게)
        },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy],
  exports: [AuthService], 
})
export class AuthModule {}
