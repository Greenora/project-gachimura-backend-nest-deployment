import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';
import { User } from './entities/user.entity';

// 유저 관련 모듈 (CRUD, 소셜 로그인, 토큰 관리)
@Module({
  imports: [
    TypeOrmModule.forFeature([User]), // User 엔티티 레포지토리 등록
  ],
  controllers: [UsersController],
  providers: [UsersService],
  exports: [UsersService], // AuthModule에서 사용하려고 내보냄
})
export class UsersModule {}
