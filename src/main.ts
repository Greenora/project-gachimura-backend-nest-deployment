import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // CORS 설정 
  // 로그인/쿠키 기능을 위해 origin: true, credentials: true 필수
  app.enableCors({
    origin: true,
    credentials: true,
  });

  // Swagger 설정 
  const config = new DocumentBuilder()
    .setTitle('Gachimura API docs')
    .setDescription('가치무라 프로젝트를 위한 채팅 및 모임 관리 API 문서입니다.')
    .setVersion('1.0')
    .addTag('chat', '채팅 관련 API')
    .addTag('party', '모임/모임 관련 API')
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api-docs', app, document);

  // 서버 실행 (중복 제거 & 8000번 포트 통일)
  await app.listen(process.env.PORT ?? 8000, '0.0.0.0');
  
  console.log(`Application is running on: ${await app.getUrl()}`);
  console.log(`Swagger UI is available at: ${await app.getUrl()}/api-docs`);
}
bootstrap();