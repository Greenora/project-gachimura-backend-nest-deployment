import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { ValidationPipe } from '@nestjs/common';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // 전역 유효성 검사 파이프 설정
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true, // DTO에 없는 속성 제거
      forbidNonWhitelisted: true, // DTO에 없는 속성 있으면 오류 발생
      transform: true, // 요청 데이터를 DTO 타입으로 변환
    }),
  );

  // CORS 설정
  // 로그인/쿠키 기능을 위해 origin: true, credentials: true 필수
  app.enableCors({
    origin: true,
    credentials: true,
  });

  // Swagger 설정
  const config = new DocumentBuilder()
    .setTitle('Gachimura Backend API')
    .setDescription(
      [
        '가치무라 백엔드 API 문서입니다.',
        '',
        '사용 가이드',
        '1) 우측 상단 Authorize 버튼 클릭',
        '2) accessToken 값을 Bearer 없이 입력',
        '3) 자물쇠 표시가 있는 엔드포인트 호출',
      ].join('\n'),
    )
    .setVersion('1.0')
    .addServer('http://localhost:8000', 'Local')
    .addServer('http://backend:3000', 'Docker network')
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        name: 'Authorization',
        description: 'JWT Access Token을 입력하세요 (Bearer 접두어 자동 처리).',
        in: 'header',
      },
      'access-token', // 이 이름으로 @ApiBearerAuth('access-token') 사용
    )
    .addTag('Auth', '인증 관련 API (로그인, 회원가입)')
    .addTag('Users', '유저 프로필/정보 API')
    .addTag('Parties', '모임 관련 API')
    .addTag('Chat', '채팅 메시지 API')
    .addTag('Settlements', '정산 관련 API')
    .addTag('Community', '커뮤니티 피드/좋아요/댓글 API')
    .addTag('Reviews', '후기/평가 API')
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api-docs', app, document);

  // 서버 실행 (중복 제거 & 8000번 포트 통일)
  await app.listen(process.env.PORT ?? 8000, '0.0.0.0');

  console.log(`Application is running on: ${await app.getUrl()}`);
  console.log(`Swagger UI is available at: ${await app.getUrl()}/api-docs`);
}
void bootstrap();
