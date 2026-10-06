import { Module } from '@nestjs/common';
import { RecipeChatService } from './recipe-chat.service';
import { RecipeChatController } from './recipe-chat.controller';

@Module({
  controllers: [RecipeChatController],
  providers: [RecipeChatService],
})
export class RecipeChatModule {}
