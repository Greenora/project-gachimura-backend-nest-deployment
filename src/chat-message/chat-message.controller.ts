import { Controller, Get, Post, Delete, Body, Param } from '@nestjs/common';
import { ChatMessageService } from './chat-message.service';
import { CreateChatMessageDto } from './dto/create-chat-message.dto';
import { ApiTags, ApiOperation } from '@nestjs/swagger';

@ApiTags('chat')
@Controller('chat-message')
export class ChatMessageController {
  constructor(private readonly chatMessageService: ChatMessageService) {}

  @Post()
  @ApiOperation({
    summary: '채팅 메시지 생성',
    description: '새로운 채팅 메시지를 데이터베이스에 저장합니다.',
  })
  create(@Body() createChatMessageDto: CreateChatMessageDto) {
    return this.chatMessageService.create(createChatMessageDto);
  }

  @Get(':partyId')
  @ApiOperation({
    summary: '모임별 채팅 이력 조회',
    description: '특정 모임의 모든 채팅 메시지를 시간순으로 가져옵니다.',
  })
  findAll(@Param('partyId') partyId: string) {
    return this.chatMessageService.findAllByParty(+partyId);
  }
}
