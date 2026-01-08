import { Module, Global } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ChatGateway } from './chat.gateway';
import { ChatMessage } from '../chat-message/entities/chat-message.entity';
import { PartyMember } from '../party-members/entities/party-member.entity';

@Global()
@Module({
  imports: [TypeOrmModule.forFeature([ChatMessage, PartyMember])],
  providers: [ChatGateway],
  exports: [ChatGateway],
})
export class ChatModule { }
