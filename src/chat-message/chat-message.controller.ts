import { Controller, Get, Post, Delete, Body, Param } from '@nestjs/common';
import { ChatMessageService } from './chat-message.service';
import { CreateChatMessageDto } from './dto/create-chat-message.dto';
import { ApiTags, ApiOperation, ApiParam, ApiResponse } from '@nestjs/swagger';

@ApiTags('Chat')
@Controller('chat-message')
export class ChatMessageController {
  constructor(private readonly chatMessageService: ChatMessageService) {}

  @Post()
  @ApiOperation({
    summary: '채팅 메시지 생성',
    description: '새로운 채팅 메시지를 데이터베이스에 저장합니다.',
  })
  @ApiResponse({
    status: 201,
    description: '메시지 생성 성공',
    schema: {
      example: {
        id: 1,
        content: '안녕하세요!',
        partyId: 1,
        senderId: 1,
        createdAt: '2026-02-10T12:00:00.000Z',
      },
    },
  })
  create(@Body() createChatMessageDto: CreateChatMessageDto) {
    return this.chatMessageService.create(createChatMessageDto);
  }

  @Get(':partyId')
  @ApiOperation({
    summary: '모임별 채팅 이력 조회',
    description: '특정 모임의 모든 채팅 메시지를 시간순으로 가져옵니다.',
  })
  @ApiParam({ name: 'partyId', example: 1, description: '모임 ID' })
  @ApiResponse({
    status: 200,
    description: '채팅 이력 조회 성공',
    schema: {
      example: [
        {
          id: 1,
          content: '안녕하세요!',
          senderId: 1,
          senderNickname: '근사한 백조',
          createdAt: '2026-02-10T12:00:00.000Z',
        },
      ],
    },
  })
  findAll(@Param('partyId') partyId: string) {
    return this.chatMessageService.findAllByParty(+partyId);
  }
}
