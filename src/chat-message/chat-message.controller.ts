import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Req,
  UseGuards,
  ParseIntPipe,
} from '@nestjs/common';
import { ChatMessageService } from './chat-message.service';
import { CreateChatMessageDto } from './dto/create-chat-message.dto';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';

@ApiTags('Chat')
@ApiBearerAuth('access-token')
@UseGuards(AuthGuard('jwt'))
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
  @ApiResponse({ status: 401, description: '인증되지 않은 요청' })
  @ApiResponse({ status: 403, description: '승인된 모임 멤버가 아닌 사용자' })
  create(
    @Body() createChatMessageDto: CreateChatMessageDto,
    @Req() req: { user: { id: number } },
  ) {
    return this.chatMessageService.create(createChatMessageDto, req.user.id);
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
  @ApiResponse({ status: 401, description: '인증되지 않은 요청' })
  @ApiResponse({ status: 403, description: '승인된 모임 멤버가 아닌 사용자' })
  findAll(
    @Param('partyId', ParseIntPipe) partyId: number,
    @Req() req: { user: { id: number } },
  ) {
    return this.chatMessageService.findAllByParty(partyId, req.user.id);
  }
}
