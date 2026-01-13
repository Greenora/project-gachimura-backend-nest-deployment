import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UsersModule } from './users/users.module';
import { AuthModule } from './auth/auth.module';
import { User } from './users/entities/user.entity';
import { PartiesModule } from './parties/parties.module';
import { Party } from './parties/entities/party.entity';
import { ChatMessageModule } from './chat-message/chat-message.module';
import { ChatMessage } from './chat-message/entities/chat-message.entity';
import { PartyMembersModule } from './party-members/party-members.module';
import { PartyMember } from './party-members/entities/party-member.entity';
import { ChatModule } from './chat/chat.module';

@Module({
  imports: [
    // 환경변수 설정
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),

    //DB 설정 (Async 방식 유지)
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
        entities: [User, Party, ChatMessage, PartyMember],
        synchronize: true,
        charset: 'utf8mb4',
      }),
    }),
    UsersModule,
    AuthModule, // (로그인)
    PartiesModule, // 팀원 (파티)
    ChatMessageModule, // 팀원 (채팅메시지)
    PartyMembersModule, // 팀원 (파티멤버)
    ChatModule, // 팀원 (채팅)
  ],
  controllers: [],
  providers: [],
})
export class AppModule {}
