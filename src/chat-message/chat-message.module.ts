import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ChatMessageService } from './chat-message.service';
import { ChatMessageController } from './chat-message.controller';
import { ChatMessage } from './entities/chat-message.entity';

@Module({
  imports: [TypeOrmModule.forFeature([ChatMessage])],
  controllers: [ChatMessageController],
  providers: [ChatMessageService],
  exports: [ChatMessageService],
})
export class ChatMessageModule {}
