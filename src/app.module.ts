import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UsersModule } from './users/users.module';
import { AuthModule } from './auth/auth.module';
import { User } from './users/entity/user.entity';

@Module({
  imports: [
    // 환경변수 설정 (.env 파일 읽기)
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),

    // DB 설정 (환경변수 적용 버전)
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        type: 'mysql',
        host: configService.get<string>('DB_HOST'),
        port: configService.get<number>('DB_PORT'),
        username: configService.get<string>('DB_USERNAME'),
        password: configService.get<string>('DB_PASSWORD'),
        database: configService.get<string>('DB_NAME'),
        entities: [User],
        synchronize: true,
      }),
    }),

    UsersModule,
    AuthModule,
  ],
  controllers: [], 
  providers: [],    
})
export class AppModule {}