import { Module, Global } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ChatGateway } from './chat.gateway';
import { ChatMessage } from '../chat-message/entities/chat-message.entity';
import { PartyMember } from '../party-members/entities/party-member.entity';
import { AuthModule } from '../auth/auth.module';
import { PushModule } from '../push/push.module';
import { ChatRateLimitService } from './chat-rate-limit.service';

@Global()
@Module({
  imports: [
    TypeOrmModule.forFeature([ChatMessage, PartyMember]),
    AuthModule,
    PushModule,
  ],
  providers: [ChatGateway, ChatRateLimitService],
  exports: [ChatGateway, ChatRateLimitService],
})
export class ChatModule {}
