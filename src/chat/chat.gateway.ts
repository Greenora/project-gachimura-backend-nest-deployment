import {
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ChatMessage } from '../chat-message/entities/chat-message.entity';

interface ChatPayload {
  userId: number;
  partyId: number;
  message: string;
  nickname: string;
  profileImage?: string | null;
}

import { PartyMember } from '../party-members/entities/party-member.entity';

@WebSocketGateway({
  cors: {
    origin: '*',
    credentials: true,
  },
})
export class ChatGateway {
  @WebSocketServer()
  server: Server;

  // DB 저장을 위해 Repository 주입
  constructor(
    @InjectRepository(ChatMessage)
    private chatRepository: Repository<ChatMessage>,
    @InjectRepository(PartyMember)
    private memberRepository: Repository<PartyMember>,
  ) {}

  @SubscribeMessage('joinRoom')
  async handleJoinRoom(
    @MessageBody() data: { userId: number; partyId: number },
    @ConnectedSocket() client: Socket,
  ): Promise<void> {
    // 1. 해당 모임의 승인된 멤버인지 확인
    const member = await this.memberRepository.findOne({
      where: {
        partyId: data.partyId,
        userId: data.userId,
        status: 'APPROVED',
      },
      relations: { user: true },
    });

    if (member) {
      // 2. 소켓 룸 입장
      const roomName = `party_${data.partyId}`;
      client.join(roomName);
      console.log(`[Socket] User ${data.userId} joined room: ${roomName}`);
    } else {
      console.log(
        `[Socket] Access denied for User ${data.userId} to Party ${data.partyId}`,
      );
      client.emit('error', '해당 모임의 멤버가 아닙니다.');
    }
  }

  @SubscribeMessage('message')
  async handleMessage(
    @MessageBody() payload: ChatPayload,
    @ConnectedSocket() client: Socket,
  ): Promise<void> {
    // 1. 해당 모임의 승인된 멤버인지 다시 한 번 확인 (보안)
    const member = await this.memberRepository.findOne({
      where: {
        partyId: payload.partyId,
        userId: payload.userId,
        status: 'APPROVED',
      },
    });

    if (!member) return;

    console.log(
      `[Room ${payload.partyId}] User ${payload.userId}: ${payload.message}`,
    );

    // 2. DB에 저장
    const newChat = this.chatRepository.create({
      partyId: payload.partyId,
      senderId: payload.userId,
      content: payload.message,
      messageType: 'TALK',
    });

    const savedChat = await this.chatRepository.save(newChat);

    const roomName = `party_${payload.partyId}`;
    this.server.to(roomName).emit('message', {
      ...payload,
      createdAt: savedChat.createdAt?.toISOString() || new Date().toISOString(),
    });
  }

  // 외부 서비스에서 시스템 메시지를 보낼 수 있게 하는 메서드
  async sendSystemMessage(partyId: number, message: string) {
    // 1. DB에 저장
    const systemChat = this.chatRepository.create({
      partyId,
      senderId: null, // 시스템 메시지는 발신자가 없음
      content: message,
      messageType: 'SYSTEM',
    });
    const savedChat = await this.chatRepository.save(systemChat);

    // 2. 해당 채에 전송
    const roomName = `party_${partyId}`;
    this.server.to(roomName).emit('message', {
      userId: 0,
      partyId: partyId,
      message: message,
      nickname: '시스템',
      messageType: 'SYSTEM',
      createdAt: savedChat.createdAt?.toISOString() || new Date().toISOString(),
    });
  }
}
