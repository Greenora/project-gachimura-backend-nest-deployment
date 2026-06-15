import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ChatMessageService } from './chat-message.service';
import { ChatMessageController } from './chat-message.controller';
import { ChatMessage } from './entities/chat-message.entity';
import { PartyMember } from '../party-members/entities/party-member.entity';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [TypeOrmModule.forFeature([ChatMessage, PartyMember]), AuthModule],
  controllers: [ChatMessageController],
  providers: [ChatMessageService],
  exports: [ChatMessageService],
})
export class ChatMessageModule {}
