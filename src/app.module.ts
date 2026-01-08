import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ChatGateway } from './chat/chat.gateway';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UsersModule } from './users/users.module';
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
    TypeOrmModule.forRoot({
      type: 'mysql',
      host: process.env.DB_HOST || 'db',
      port: 3306,
      username: 'user',
      password: 'password',
      database: 'gachimura',
      entities: [User, Party, ChatMessage, PartyMember],
      synchronize: true, // 배포 시 꺼야함. 코드 고칠 때 자동으로 데이터베이스도 수정
    }),
    UsersModule,
    PartiesModule,
    ChatMessageModule,
    PartyMembersModule,
    ChatModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule { }
