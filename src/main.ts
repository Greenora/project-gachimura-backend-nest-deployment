import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableCors({
    origin: true,     // 모든 도메인 허용
    credentials: true,// 쿠키 허용
  }); //CORS 설정
  await app.listen(process.env.PORT ?? 8000);
}
bootstrap();
